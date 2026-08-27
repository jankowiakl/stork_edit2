import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import nodemailer from "nodemailer";
import sharp from "sharp";
import { db, transaction } from "./db.js";
import { migrate } from "./migrate.js";
import {
  assertAuthConfiguration,normalizeEmail,publicUser,signToken,authenticateUser,requireRole,
  canAccessIndividual,accessSql,hashPassword,temporaryPassword,verifyPassword,audit,randomId
} from "./auth.js";
import { publicAnnotationSchema,ANNOTATION_DB_COLUMNS } from "./annotation-schema.js";
import { normalizeAnnotationInput,validateAnnotation,toDbAnnotation,fromDbAnnotation } from "./validation.js";
import { queryExportRows,rowToExport,sendCsv,sendXlsx,sendGeoJson,sendKml,sendZip } from "./export.js";
import { stageBrowserImport,runStagedImport,removeStagedImport } from "./admin-import.js";
import { parsePhotoFilename } from "./photo-filename.js";
import { readPhotoExifGps } from "./photo-exif.js";

assertAuthConfiguration();
await migrate();

const app=express(), port=Number(process.env.PORT||3000);
const photoDir=path.resolve(process.env.PHOTO_DIR||"/data/photos"), previewDir=path.join(photoDir,".previews"), uploadDir=path.join(photoDir,".uploads"), importStageDir=path.join(photoDir,".import-staging"), importUploadDir=path.join(photoDir,".import-uploads");
const publicApiUrl=String(process.env.PUBLIC_API_URL||"").replace(/\/$/,"");
const publicAppUrl=String(process.env.PUBLIC_APP_URL||"").replace(/\/$/,"")+"/";
await Promise.all([photoDir,previewDir,uploadDir,importStageDir,importUploadDir].map((dir)=>fsp.mkdir(dir,{recursive:true})));

async function repairMisclassifiedPhotoImports(){
  const mistakenIds=["stork-log-photos-main","stork-log-photos"],rows=(await db.query("SELECT id,individual_id,filename FROM photos WHERE individual_id=ANY($1::text[])",[mistakenIds])).rows,repairedIds=[];
  await transaction(async(client)=>{
    for(const row of rows){const parsed=parsePhotoFilename(row.filename);if(!parsed.bird||parsed.bird===row.individual_id)continue;await client.query("INSERT INTO individuals(id) VALUES($1) ON CONFLICT(id) DO NOTHING",[parsed.bird]);const result=await client.query("UPDATE photos SET individual_id=$1,capture_time=COALESCE(capture_time,$2),updated_at=now() WHERE id=$3 AND NOT EXISTS(SELECT 1 FROM photos target WHERE target.individual_id=$1 AND target.filename=$4) RETURNING id",[parsed.bird,parsed.captureTime,row.id,row.filename]);if(result.rows[0])repairedIds.push(result.rows[0].id);}
    for(const mistakenId of mistakenIds)await client.query("UPDATE individuals SET active=false,public_visible=false,updated_at=now() WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM photos WHERE individual_id=$1)",[mistakenId]);if(repairedIds.length)await client.query("INSERT INTO audit_log(action,entity_type,payload) VALUES('misclassified_photo_import_repaired','photo_import',$1::jsonb)",[JSON.stringify({repaired:repairedIds.length,sourceIndividuals:mistakenIds})]);
  });
  if(repairedIds.length)console.log(`Repaired ${repairedIds.length} photo records imported under a folder name.`);
}
await repairMisclassifiedPhotoImports();
async function indexStoredPhotoExif(){
  const rows=(await db.query("SELECT id,storage_path FROM photos WHERE media_status='available' AND exif_checked_at IS NULL")).rows;if(!rows.length)return;let next=0,withGps=0,withoutGps=0;
  const worker=async()=>{while(next<rows.length){const row=rows[next++],file=safeStorage(row.storage_path);let exif={hasGps:false,latitude:null,longitude:null,altitudeM:null,gpsTime:null};if(file&&fs.existsSync(file))try{exif=await readPhotoExifGps(file);}catch(error){console.warn(`EXIF read failed for ${row.id}.`,error.message);}await db.query("UPDATE photos SET latitude=$1,longitude=$2,gps_time=$3,location_source=$4,exif_checked_at=now(),altitude_m=COALESCE($5,altitude_m),updated_at=now() WHERE id=$6",[exif.latitude,exif.longitude,exif.gpsTime,exif.hasGps?"exif":"missing",exif.altitudeM,row.id]);if(exif.hasGps)withGps++;else withoutGps++;}};
  await Promise.all(Array.from({length:Math.min(6,rows.length)},()=>worker()));await db.query("INSERT INTO audit_log(action,entity_type,payload) VALUES('photo_exif_indexed','photo_import',$1::jsonb)",[JSON.stringify({checked:rows.length,withGps,withoutGps,coordinatesFromTrack:0})]);console.log(`Indexed EXIF geotags: ${withGps} with GPS, ${withoutGps} without GPS.`);
}
await indexStoredPhotoExif();
await db.query("UPDATE import_batches SET status='failed',summary=summary||$1::jsonb,finished_at=now() WHERE status='started'",[JSON.stringify({error:"server_restarted_during_import"})]);

if(String(process.env.TRUST_PROXY||"")==="1")app.set("trust proxy",1);
app.use(helmet({crossOriginResourcePolicy:{policy:"cross-origin"}}));
app.use(cors({
  origin(origin,callback){const allowed=String(process.env.CORS_ORIGIN||"").split(",").map((x)=>x.trim()).filter(Boolean); if(!origin||allowed.includes(origin))return callback(null,true); callback(new Error("Origin is not allowed by CORS."));},
  exposedHeaders:["Content-Disposition","ETag"]
}));
app.use(express.json({limit:"3mb"})); app.use(express.urlencoded({extended:false}));
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:true,legacyHeaders:false});
const writeLimiter=rateLimit({windowMs:60*1000,limit:120,standardHeaders:true,legacyHeaders:false});
const uploadPhoto=multer({dest:uploadDir,limits:{fileSize:Math.max(1,Number(process.env.MAX_PHOTO_MB||30))*1024*1024},fileFilter:(_req,file,cb)=>cb(null,/^image\/(jpeg|png|webp)$/i.test(file.mimetype))});
const uploadImport=multer({dest:importUploadDir,limits:{fileSize:Math.max(1,Number(process.env.MAX_IMPORT_FILE_MB||4096))*1024*1024,files:6005,parts:6020}}).fields([{name:"workbook",maxCount:1},{name:"gps",maxCount:1},{name:"stopovers",maxCount:1},{name:"archive",maxCount:1},{name:"photos",maxCount:6000}]);

const positiveInt=(value,fallback,max)=>{const n=Number.parseInt(value,10);return Number.isFinite(n)&&n>0?Math.min(n,max):fallback;};
const iso=(value)=>{if(!value)return null;const date=value instanceof Date?value:new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString();};
const imageUrl=(id,preview=false)=>`${publicApiUrl}/api/public/photos/${encodeURIComponent(id)}/image${preview?"?kind=preview":""}`;
function photoPublic(row){return{id:row.id,bird:row.individual_id,filename:row.filename,captureTime:iso(row.capture_time),lat:row.latitude==null?null:Number(row.latitude),lon:row.longitude==null?null:Number(row.longitude),gpsTime:iso(row.gps_time),locationSource:row.location_source||null,altitudeM:row.altitude_m==null?null:Number(row.altitude_m),elevationM:row.elevation_m==null?null:Number(row.elevation_m),imageUrl:imageUrl(row.id),previewUrl:imageUrl(row.id,true)};}
function photoJoined(row){return{...photoPublic(row),address:row.address,country:row.country,closeCity:row.close_city,geoDescription:row.geo_desc,status:row.status||"unstarted",version:Number(row.version||0),annotation:fromDbAnnotation(row),updatedAt:iso(row.annotation_updated_at),updatedBy:row.updated_by_name?{id:row.updated_by,name:row.updated_by_name}:null};}
function safeStorage(storagePath){if(!storagePath)return null;const absolute=path.resolve(photoDir,storagePath),rel=path.relative(photoDir,absolute);return rel.startsWith("..")||path.isAbsolute(rel)?null:absolute;}

async function servePhoto(req,res,next,publicOnly=true){try{
  const result=await db.query(`SELECT id,storage_path,mime_type,sha256,public_visible,media_status FROM photos WHERE id=$1 ${publicOnly?"AND public_visible=true":""}`,[req.params.id]);
  const photo=result.rows[0]; if(!photo||photo.media_status!=="available")return res.status(404).json({error:"photo_not_found"});
  const original=safeStorage(photo.storage_path); if(!original||!fs.existsSync(original))return res.status(404).json({error:"photo_file_missing"});
  const stat=fs.statSync(original),etag=`\"${photo.sha256||`${photo.id}-${stat.size}`}\"`; if(req.headers["if-none-match"]===etag)return res.status(304).end();
  res.setHeader("ETag",etag);res.setHeader("Cache-Control","public, max-age=604800, stale-while-revalidate=2592000");
  if(req.query.kind!=="preview")return res.sendFile(original);
  const preview=path.join(previewDir,`${photo.id}.webp`);try{if(!fs.existsSync(preview)){const temporary=`${preview}.${randomId()}.tmp.webp`;try{await sharp(original).rotate().resize({width:720,height:720,fit:"inside",withoutEnlargement:true}).webp({quality:78}).toFile(temporary);await fsp.rename(temporary,preview).catch(async(error)=>{if(error.code!=="EEXIST")throw error;await fsp.unlink(temporary).catch(()=>{});});}catch(error){await fsp.unlink(temporary).catch(()=>{});throw error;}}return res.type("image/webp").sendFile(preview);}catch(error){console.warn(`Preview generation failed for ${photo.id}; serving original.`,error.message);return res.type(photo.mime_type||"image/jpeg").sendFile(original);}
}catch(error){next(error);}}

async function assignments(userId,client=db){const result=await client.query("SELECT individual_id FROM user_individual_access WHERE user_id=$1 ORDER BY individual_id",[userId]);return result.rows.map((r)=>r.individual_id);}
async function setAssignments(client,userId,ids=[]){await client.query("DELETE FROM user_individual_access WHERE user_id=$1",[userId]);for(const id of new Set(ids)){await client.query("INSERT INTO user_individual_access(user_id,individual_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM individuals WHERE id=$2)",[userId,String(id)]);}}
function mailTransport(){return process.env.SMTP_HOST?nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||"false")==="true",auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined}):null;}
async function invite(user,password){const subject="Access to Stork Photo Editor",body=[`Hello ${user.name},`,"","You have been invited to Stork Photo Editor.",`Application: ${publicAppUrl}`,`Login: ${user.email}`,`Temporary password: ${password}`,"","Change the password immediately after logging in."].join("\n");const transport=mailTransport();if(transport){await transport.sendMail({from:process.env.MAIL_FROM,to:user.email,subject,text:body});return{sent:true};}return{sent:false,temporaryPassword:password,mailtoUrl:`mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`};}

app.get("/health",async(_req,res,next)=>{try{await db.query("SELECT 1");res.json({ok:true,time:new Date().toISOString(),app:"stork-edit-api"});}catch(e){next(e);}});
app.get("/api/auth/status",async(_req,res,next)=>{try{res.json({ok:true,bootstrapCompleted:Number((await db.query("SELECT count(*) FROM users")).rows[0].count)>0,recoveryAvailable:String(process.env.BOOTSTRAP_TOKEN||"").length>=24});}catch(e){next(e);}});
app.post("/api/bootstrap-admin",loginLimiter,async(req,res,next)=>{try{
  if(Number((await db.query("SELECT count(*) FROM users")).rows[0].count)>0)return res.status(409).json({error:"bootstrap_already_completed"});
  const expected=String(process.env.BOOTSTRAP_TOKEN||""),supplied=String(req.body.bootstrapToken||req.headers["x-bootstrap-token"]||"");if(expected.length<24||supplied!==expected)return res.status(403).json({error:"invalid_bootstrap_token"});
  const email=normalizeEmail(req.body.email),name=String(req.body.name||"").trim();if(!email||!name)return res.status(400).json({error:"email_and_name_required"});
  const user=(await db.query("INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,'admin',$4) RETURNING *",[randomId(),email,name,await hashPassword(req.body.password)])).rows[0];res.status(201).json({user:publicUser(user)});
}catch(e){next(e);}});
app.post("/api/recover-admin",loginLimiter,async(req,res,next)=>{try{
  const expected=Buffer.from(String(process.env.BOOTSTRAP_TOKEN||"")),supplied=Buffer.from(String(req.body.bootstrapToken||req.headers["x-bootstrap-token"]||""));
  if(expected.length<24||expected.length!==supplied.length||!crypto.timingSafeEqual(expected,supplied))return res.status(403).json({error:"invalid_recovery_credentials"});
  const email=normalizeEmail(req.body.email),user=(await db.query("SELECT * FROM users WHERE lower(email)=lower($1) AND role='admin'",[email])).rows[0];
  if(!user)return res.status(403).json({error:"invalid_recovery_credentials"});
  const passwordHash=await hashPassword(req.body.newPassword);await db.query("UPDATE users SET password_hash=$1,is_active=true,must_change_password=false,updated_at=now() WHERE id=$2",[passwordHash,user.id]);
  await audit(null,"admin_access_recovered","user",user.id,{email:user.email},req);res.json({ok:true});
}catch(e){next(e);}});
app.post("/api/login",loginLimiter,async(req,res,next)=>{try{const user=(await db.query("SELECT * FROM users WHERE lower(email)=lower($1)",[normalizeEmail(req.body.email)])).rows[0];if(!user||!user.is_active||!await verifyPassword(req.body.password,user.password_hash))return res.status(401).json({error:"invalid_credentials"});await db.query("UPDATE users SET last_login_at=now() WHERE id=$1",[user.id]);await audit(user,"login","user",user.id,{},req);res.json({token:signToken(user),user:publicUser({...user,last_login_at:new Date()})});}catch(e){next(e);}});
app.get("/api/me",authenticateUser,async(req,res)=>res.json({user:publicUser(req.user),individualIds:await assignments(req.user.id)}));
app.post("/api/me/change-password",authenticateUser,writeLimiter,async(req,res,next)=>{try{if(!await verifyPassword(req.body.currentPassword,req.user.password_hash))return res.status(400).json({error:"current_password_incorrect"});await db.query("UPDATE users SET password_hash=$1,must_change_password=false,updated_at=now() WHERE id=$2",[await hashPassword(req.body.newPassword),req.user.id]);await audit(req.user,"password_changed","user",req.user.id,{},req);res.json({ok:true});}catch(e){next(e);}});

app.get("/api/users",authenticateUser,requireRole("admin"),async(_req,res,next)=>{try{const result=await db.query("SELECT * FROM users ORDER BY created_at DESC");res.json({users:await Promise.all(result.rows.map(async(u)=>({...publicUser(u),individualIds:await assignments(u.id)})))});}catch(e){next(e);}});
app.post("/api/users",authenticateUser,requireRole("admin"),writeLimiter,async(req,res,next)=>{try{
  const email=normalizeEmail(req.body.email),name=String(req.body.name||"").trim(),role=String(req.body.role||"annotator");if(!email||!name||!["admin","coordinator","annotator"].includes(role))return res.status(400).json({error:"invalid_user"});
  const password=req.body.password||temporaryPassword(),hash=await hashPassword(password),id=randomId();const user=await transaction(async(client)=>{const row=(await client.query("INSERT INTO users(id,email,name,role,password_hash,must_change_password) VALUES($1,$2,$3,$4,$5,true) RETURNING *",[id,email,name,role,hash])).rows[0];await setAssignments(client,id,req.body.individualIds);await audit(req.user,"user_created","user",id,{role},req,client);return row;});
  res.status(201).json({user:{...publicUser(user),individualIds:await assignments(id)},invite:req.body.sendInvite===false?null:await invite(user,password)});
}catch(e){next(e);}});
app.patch("/api/users/:id",authenticateUser,requireRole("admin"),writeLimiter,async(req,res,next)=>{try{
  const existing=(await db.query("SELECT * FROM users WHERE id=$1",[req.params.id])).rows[0];if(!existing)return res.status(404).json({error:"user_not_found"});const role=req.body.role??existing.role,active=req.body.isActive??existing.is_active;if(!["admin","coordinator","annotator"].includes(role))return res.status(400).json({error:"invalid_role"});if(existing.id===req.user.id&&(role!=="admin"||!active))return res.status(400).json({error:"cannot_remove_own_admin_access"});
  if(existing.role==="admin"&&(role!=="admin"||!active)&&Number((await db.query("SELECT count(*) FROM users WHERE role='admin' AND is_active=true")).rows[0].count)<=1)return res.status(400).json({error:"last_active_admin"});
  const user=await transaction(async(client)=>{const row=(await client.query("UPDATE users SET name=$1,role=$2,is_active=$3,updated_at=now() WHERE id=$4 RETURNING *",[String(req.body.name??existing.name).trim(),role,!!active,existing.id])).rows[0];if(req.body.individualIds!==undefined)await setAssignments(client,existing.id,req.body.individualIds);await audit(req.user,"user_updated","user",existing.id,{role,isActive:!!active},req,client);return row;});res.json({user:{...publicUser(user),individualIds:await assignments(user.id)}});
}catch(e){next(e);}});
app.post("/api/users/:id/reset-password",authenticateUser,requireRole("admin"),writeLimiter,async(req,res,next)=>{try{const user=(await db.query("SELECT * FROM users WHERE id=$1",[req.params.id])).rows[0];if(!user)return res.status(404).json({error:"user_not_found"});const password=temporaryPassword();await db.query("UPDATE users SET password_hash=$1,must_change_password=true,updated_at=now() WHERE id=$2",[await hashPassword(password),user.id]);await audit(req.user,"password_reset","user",user.id,{},req);res.json({ok:true,invite:await invite(user,password)});}catch(e){next(e);}});

app.get("/api/schema/annotation",(_req,res)=>res.json(publicAnnotationSchema()));
app.get("/api/public/individuals",async(_req,res,next)=>{try{const result=await db.query(`SELECT i.id,i.display_name,i.species,i.ring,i.sex,i.metadata,count(p.id)::int photo_count,min(p.capture_time) first_photo_at,max(p.capture_time) last_photo_at FROM individuals i LEFT JOIN photos p ON p.individual_id=i.id AND p.public_visible=true WHERE i.active=true AND i.public_visible=true GROUP BY i.id ORDER BY i.id`);res.json({individuals:result.rows.map((r)=>({id:r.id,displayName:r.display_name,species:r.species,ring:r.ring,sex:r.sex,metadata:r.metadata,photoCount:r.photo_count,firstPhotoAt:iso(r.first_photo_at),lastPhotoAt:iso(r.last_photo_at)}))});}catch(e){next(e);}});
app.get("/api/public/individuals/:id/photos",async(req,res,next)=>{try{const result=await db.query("SELECT p.* FROM photos p JOIN individuals i ON i.id=p.individual_id WHERE p.individual_id=$1 AND p.public_visible=true AND i.public_visible=true ORDER BY p.capture_time NULLS LAST,p.filename LIMIT $2",[req.params.id,positiveInt(req.query.limit,5000,10000)]);res.json({photos:result.rows.map(photoPublic)});}catch(e){next(e);}});
function decimate(points,max){if(points.length<=max)return points;const output=[points[0]],step=(points.length-1)/(max-1);for(let i=1;i<max-1;i++)output.push(points[Math.round(i*step)]);output.push(points.at(-1));return output;}
app.get("/api/public/individuals/:id/route",async(req,res,next)=>{try{const params=[req.params.id],where=["g.individual_id=$1","i.public_visible=true"];if(req.query.from){params.push(req.query.from);where.push(`g.observed_at >= $${params.length}::timestamptz`);}if(req.query.to){params.push(req.query.to);where.push(`g.observed_at <= $${params.length}::timestamptz`);}const result=await db.query(`SELECT g.* FROM gps_points g JOIN individuals i ON i.id=g.individual_id WHERE ${where.join(" AND ")} ORDER BY g.observed_at NULLS LAST,g.sequence_no NULLS LAST`,params);const raw=result.rows.map((r)=>({time:iso(r.observed_at),lon:Number(r.longitude),lat:Number(r.latitude),altitudeM:r.altitude_m==null?null:Number(r.altitude_m),type:r.point_type,countN:r.count_n})),max=req.query.detail==="full"?positiveInt(req.query.max,50000,100000):positiveInt(req.query.max,2500,5000);res.json({individualId:req.params.id,total:raw.length,simplified:raw.length>max,points:decimate(raw,max)});}catch(e){next(e);}});
app.get("/api/public/individuals/:id/stopovers",async(req,res,next)=>{try{const result=await db.query("SELECT s.* FROM stopovers s JOIN individuals i ON i.id=s.individual_id WHERE s.individual_id=$1 AND i.public_visible=true ORDER BY s.time_start",[req.params.id]);res.json({type:"FeatureCollection",features:result.rows.map((r)=>({type:"Feature",id:r.id,geometry:r.geometry_geojson,properties:{...r.properties,id:r.individual_id,time_start:iso(r.time_start),time_end:iso(r.time_end)}}))});}catch(e){next(e);}});
app.get("/api/public/photos/:id/image",(req,res,next)=>servePhoto(req,res,next,true));

app.get("/api/individuals",authenticateUser,async(req,res,next)=>{try{const access=accessSql(req.user,"i.id",1),result=await db.query(`SELECT i.* FROM individuals i WHERE ${access.sql} ORDER BY i.id`,access.params);res.json({individuals:result.rows});}catch(e){next(e);}});
app.get("/api/progress",authenticateUser,async(req,res,next)=>{try{const access=accessSql(req.user,"p.individual_id",1),result=await db.query(`SELECT p.individual_id,count(*)::int total,count(*) FILTER(WHERE COALESCE(a.status,'unstarted')='complete')::int complete,count(*) FILTER(WHERE a.status='draft')::int draft,count(*) FILTER(WHERE a.status='needs_review')::int needs_review,count(*) FILTER(WHERE a.status IS NULL OR a.status='unstarted')::int unstarted,count(*) FILTER(WHERE a.status='complete' AND a.quality_selected='no')::int rejected FROM photos p LEFT JOIN photo_annotations a ON a.photo_id=p.id WHERE ${access.sql} GROUP BY p.individual_id ORDER BY p.individual_id`,access.params);res.json({individuals:result.rows.map((r)=>({individualId:r.individual_id,total:r.total,complete:r.complete,draft:r.draft,needsReview:r.needs_review,unstarted:r.unstarted,rejected:r.rejected,percentComplete:r.total?Math.round(r.complete*1000/r.total)/10:0}))});}catch(e){next(e);}});

function photoFilters(req,user){const params=[],where=[];const access=accessSql(user,"p.individual_id",1);params.push(...access.params);where.push(access.sql);const add=(sql,value)=>{params.push(value);where.push(sql.replace("?",`$${params.length}`));};if(req.query.individualId)add("p.individual_id=?",req.query.individualId);if(req.query.status)add("COALESCE(a.status,'unstarted')=?",req.query.status);if(req.query.search){const base=params.length,value=`%${req.query.search}%`;params.push(value,value,value);where.push(`(p.filename ILIKE $${base+1} OR p.individual_id ILIKE $${base+2} OR COALESCE(a.remarks,'') ILIKE $${base+3})`);}return{params,where};}
app.get("/api/photos",authenticateUser,async(req,res,next)=>{try{const page=positiveInt(req.query.page,1,1000000),pageSize=positiveInt(req.query.pageSize,50,250),{params,where}=photoFilters(req,req.user);const count=await db.query(`SELECT count(*)::int count FROM photos p LEFT JOIN photo_annotations a ON a.photo_id=p.id WHERE ${where.join(" AND ")}`,params);params.push(pageSize,(page-1)*pageSize);const result=await db.query(`SELECT p.*,COALESCE(a.status,'unstarted') status,a.version,a.quality_selected,a.pheno_period,a.residence,a.remarks,a.updated_by,a.updated_at annotation_updated_at,u.name updated_by_name FROM photos p LEFT JOIN photo_annotations a ON a.photo_id=p.id LEFT JOIN users u ON u.id=a.updated_by WHERE ${where.join(" AND ")} ORDER BY p.individual_id,p.capture_time NULLS LAST,p.filename LIMIT $${params.length-1} OFFSET $${params.length}`,params);res.json({page,pageSize,total:count.rows[0].count,photos:result.rows.map(photoJoined)});}catch(e){next(e);}});
app.get("/api/photos/:id",authenticateUser,async(req,res,next)=>{try{const row=(await db.query("SELECT p.*,COALESCE(a.status,'unstarted') status,a.*,a.updated_at annotation_updated_at,u.name updated_by_name FROM photos p LEFT JOIN photo_annotations a ON a.photo_id=p.id LEFT JOIN users u ON u.id=a.updated_by WHERE p.id=$1",[req.params.id])).rows[0];if(!row)return res.status(404).json({error:"photo_not_found"});if(!await canAccessIndividual(req.user,row.individual_id))return res.status(403).json({error:"forbidden"});res.json({photo:photoJoined(row)});}catch(e){next(e);}});
app.get("/api/photos/:id/image",authenticateUser,async(req,res,next)=>{try{const row=(await db.query("SELECT individual_id FROM photos WHERE id=$1",[req.params.id])).rows[0];if(!row)return res.status(404).json({error:"photo_not_found"});if(!await canAccessIndividual(req.user,row.individual_id))return res.status(403).json({error:"forbidden"});return servePhoto(req,res,next,false);}catch(e){next(e);}});

app.patch("/api/photos/:id/annotation",authenticateUser,writeLimiter,async(req,res,next)=>{try{
  const status=String(req.body.status||"draft"),expectedVersion=Number(req.body.expectedVersion??0);if(!["draft","complete","needs_review"].includes(status))return res.status(400).json({error:"invalid_status"});
  const saved=await transaction(async(client)=>{const photo=(await client.query("SELECT * FROM photos WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];if(!photo)return{http:404,body:{error:"photo_not_found"}};if(!await canAccessIndividual(req.user,photo.individual_id,client))return{http:403,body:{error:"forbidden"}};const current=(await client.query("SELECT * FROM photo_annotations WHERE photo_id=$1",[photo.id])).rows[0]||null,currentVersion=Number(current?.version||0);if(!Number.isInteger(expectedVersion)||expectedVersion!==currentVersion)return{http:409,body:{error:"version_conflict",currentVersion,current:current?fromDbAnnotation({...current,elevation_m:photo.elevation_m}):null}};
    const values=normalizeAnnotationInput(req.body.values||{},photo),errors=validateAnnotation(values,status);if(errors.length)return{http:422,body:{error:"validation_failed",fields:errors}};if(values.Elevation_m!==photo.elevation_m)await client.query("UPDATE photos SET elevation_m=$1,updated_at=now() WHERE id=$2",[values.Elevation_m,photo.id]);
    const dbValues=toDbAnnotation(values),columns=ANNOTATION_DB_COLUMNS,newVersion=currentVersion+1,columnValues=columns.map((c)=>dbValues[c]);let annotation;
    if(!current){const names=["photo_id","status","version",...columns,"created_by","updated_by","completed_at"],params=[photo.id,status,newVersion,...columnValues,req.user.id,req.user.id,status==="complete"?new Date():null];annotation=(await client.query(`INSERT INTO photo_annotations(${names.join(",")}) VALUES(${params.map((_,i)=>`$${i+1}`).join(",")}) RETURNING *`,params)).rows[0];}
    else{const params=[photo.id,status,newVersion,...columnValues,req.user.id,status==="complete"?new Date():null],assignments=columns.map((c,i)=>`${c}=$${i+4}`);annotation=(await client.query(`UPDATE photo_annotations SET status=$2,version=$3,${assignments.join(",")},updated_by=$${params.length-1},completed_at=$${params.length},updated_at=now() WHERE photo_id=$1 RETURNING *`,params)).rows[0];}
    const snapshot={...fromDbAnnotation({...annotation,elevation_m:values.Elevation_m}),status,version:newVersion};await client.query("INSERT INTO annotation_history(photo_id,version,status,changed_by,snapshot) VALUES($1,$2,$3,$4,$5::jsonb)",[photo.id,newVersion,status,req.user.id,JSON.stringify(snapshot)]);await audit(req.user,"annotation_saved","photo",photo.id,{status,version:newVersion},req,client);return{http:200,body:{ok:true,status,version:newVersion,values:snapshot}};
  });res.status(saved.http).json(saved.body);
}catch(e){next(e);}});

app.get("/api/next-unfinished",authenticateUser,async(req,res,next)=>{try{const access=accessSql(req.user,"p.individual_id",1),params=[...access.params],where=[access.sql,"COALESCE(a.status,'unstarted') <> 'complete'"];if(req.query.individualId){params.push(req.query.individualId);where.push(`p.individual_id=$${params.length}`);}if(req.query.after){params.push(req.query.after);where.push(`(p.capture_time,p.filename) > (SELECT capture_time,filename FROM photos WHERE id=$${params.length})`);}const result=await db.query(`SELECT p.id,p.individual_id,p.filename FROM photos p LEFT JOIN photo_annotations a ON a.photo_id=p.id WHERE ${where.join(" AND ")} ORDER BY p.capture_time NULLS LAST,p.filename LIMIT 1`,params);res.json({photo:result.rows[0]||null});}catch(e){next(e);}});
app.get("/api/export",authenticateUser,requireRole("admin","coordinator"),async(req,res,next)=>{try{const source=await queryExportRows(db,req.user,{individualId:req.query.individualId||null,status:req.query.status||null,search:req.query.search||null}),rows=source.map((r)=>rowToExport(r,publicApiUrl)),format=String(req.query.format||"xlsx").toLowerCase();await audit(req.user,"data_exported","export",null,{format,count:rows.length},req);if(format==="csv")return sendCsv(res,rows);if(format==="json")return res.attachment("stork-photo-data.json").json(rows);if(format==="geojson")return sendGeoJson(res,rows);if(format==="kml")return sendKml(res,rows);if(format==="zip")return sendZip(res,source,rows,photoDir);return sendXlsx(res,rows);}catch(e){next(e);}});

const publicImportBatch=(row)=>({id:row.id,sourceName:row.source_name,status:row.status,summary:row.summary||{},createdAt:iso(row.created_at),finishedAt:iso(row.finished_at),createdBy:row.created_by_name?{id:row.created_by,name:row.created_by_name}:null});
const safeImportStage=(value)=>{if(!value)return null;const absolute=path.resolve(value),relative=path.relative(importStageDir,absolute);return relative&&!relative.startsWith("..")&&!path.isAbsolute(relative)?absolute:null;};
async function processImportBatch(row,user,requestIp){
  try{const stage=safeImportStage(row.staging_path);if(!stage||!fs.existsSync(stage))throw new Error("import_staging_missing");const reportPath=path.join(stage,"report-applied.json"),report=await runStagedImport({batchId:row.id,createdBy:user.id,manifest:row.input_manifest,reportPath,apply:true,replaceAnnotations:false});await audit(user,"import_completed","import_batch",row.id,report.summary,{ip:requestIp});await removeStagedImport(stage);await db.query("UPDATE import_batches SET staging_path=NULL,input_manifest=$1::jsonb WHERE id=$2",[JSON.stringify({sourceName:row.source_name}),row.id]);}
  catch(error){console.error(`Import ${row.id} failed.`,error);await db.query("UPDATE import_batches SET status='failed',summary=summary||$1::jsonb,finished_at=now() WHERE id=$2",[JSON.stringify({error:String(error.message||"import_failed")}),row.id]).catch(()=>{});}
}

app.get("/api/admin/imports",authenticateUser,requireRole("admin"),async(req,res,next)=>{try{
  const result=await db.query("SELECT b.*,u.name created_by_name FROM import_batches b LEFT JOIN users u ON u.id=b.created_by ORDER BY b.created_at DESC LIMIT $1",[positiveInt(req.query.limit,30,100)]);
  res.json({imports:result.rows.map(publicImportBatch)});
}catch(e){next(e);}});
app.get("/api/admin/imports/:id",authenticateUser,requireRole("admin"),async(req,res,next)=>{try{
  const row=(await db.query("SELECT b.*,u.name created_by_name FROM import_batches b LEFT JOIN users u ON u.id=b.created_by WHERE b.id=$1",[req.params.id])).rows[0];if(!row)return res.status(404).json({error:"import_not_found"});
  const issues=(await db.query("SELECT issue_type,source_row,source_key,details,created_at FROM import_issues WHERE batch_id=$1 ORDER BY id LIMIT 500",[row.id])).rows;
  res.json({import:publicImportBatch(row),issues});
}catch(e){next(e);}});
app.post("/api/admin/imports/preview",authenticateUser,requireRole("admin"),writeLimiter,uploadImport,async(req,res,next)=>{const batchId=randomId();let staged=null;try{
  const hasFiles=Object.values(req.files||{}).some((group)=>group?.length);if(!hasFiles)return res.status(400).json({error:"import_files_required"});
  staged=await stageBrowserImport({batchId,files:req.files,body:req.body,stageRoot:importStageDir,maxEntries:positiveInt(process.env.MAX_IMPORT_ENTRIES,10000,25000)});
  const reportPath=path.join(staged.stage,"report-preview.json"),report=await runStagedImport({batchId,createdBy:req.user.id,manifest:staged.manifest,reportPath});
  await db.query("INSERT INTO import_batches(id,source_name,source_sha256,status,summary,input_manifest,staging_path,created_by) VALUES($1,$2,$3,'previewed',$4::jsonb,$5::jsonb,$6,$7)",[batchId,staged.manifest.sourceName,report.inputs?.workbookSha256||null,JSON.stringify(report.summary),JSON.stringify(staged.manifest),staged.stage,req.user.id]);
  await audit(req.user,"import_previewed","import_batch",batchId,report.summary,req);res.status(201).json({import:{id:batchId,sourceName:staged.manifest.sourceName,status:"previewed",summary:report.summary,createdAt:new Date().toISOString(),createdBy:{id:req.user.id,name:req.user.name}},issues:report.issues.slice(0,500),issueCount:report.issues.length});
}catch(e){
  if(staged){await db.query("INSERT INTO import_batches(id,source_name,status,summary,staging_path,created_by,finished_at) VALUES($1,$2,'failed',$3::jsonb,$4,$5,now()) ON CONFLICT(id) DO UPDATE SET status='failed',summary=EXCLUDED.summary,finished_at=now()",[batchId,staged.manifest?.sourceName||"browser import",JSON.stringify({error:String(e.message||"preview_failed")}),staged.stage,req.user.id]).catch(()=>{});await removeStagedImport(staged.stage);}
  next(e);
}});
app.post("/api/admin/imports/:id/apply",authenticateUser,requireRole("admin"),writeLimiter,async(req,res,next)=>{try{
  const row=(await db.query("UPDATE import_batches SET status='started' WHERE id=$1 AND status='previewed' RETURNING *",[req.params.id])).rows[0];if(!row)return res.status(409).json({error:"import_not_ready"});
  res.status(202).json({import:{id:row.id,sourceName:row.source_name,status:"started",summary:row.summary}});void processImportBatch(row,req.user,req.ip);
}catch(e){next(e);}});
app.delete("/api/admin/imports/:id",authenticateUser,requireRole("admin"),writeLimiter,async(req,res,next)=>{try{
  const row=(await db.query("SELECT * FROM import_batches WHERE id=$1",[req.params.id])).rows[0];if(!row)return res.status(404).json({error:"import_not_found"});if(!["previewed","failed"].includes(row.status))return res.status(409).json({error:"import_cannot_be_cancelled"});
  const stage=safeImportStage(row.staging_path);if(stage)await removeStagedImport(stage);await db.query("UPDATE import_batches SET status='cancelled',staging_path=NULL,input_manifest='{}'::jsonb,finished_at=now() WHERE id=$1",[row.id]);await audit(req.user,"import_cancelled","import_batch",row.id,{},req);res.json({ok:true});
}catch(e){next(e);}});

app.post("/api/admin/photos",authenticateUser,requireRole("admin"),writeLimiter,uploadPhoto.single("photo"),async(req,res,next)=>{
  let target=null;
  try{
    if(!req.file)return res.status(400).json({error:"photo_required"});
    const individualId=String(req.body.individualId||"").trim();
    if(!/^[A-Za-z0-9._-]+$/.test(individualId)||!(await db.query("SELECT 1 FROM individuals WHERE id=$1",[individualId])).rows[0]){await fsp.unlink(req.file.path).catch(()=>{});return res.status(400).json({error:"individual_not_found"});}
    const ext={"image/jpeg":".jpg","image/png":".png","image/webp":".webp"}[req.file.mimetype]||".jpg",dir=path.join(photoDir,individualId);
    await fsp.mkdir(dir,{recursive:true});target=path.join(dir,`${randomId()}${ext}`);await fsp.rename(req.file.path,target);
    let exif={hasGps:false,latitude:null,longitude:null,altitudeM:null,gpsTime:null};try{exif=await readPhotoExifGps(target);}catch(error){console.warn(`EXIF read failed for upload ${req.file.originalname}.`,error.message);}
    const bytes=await fsp.readFile(target),id=randomId(),filename=req.body.filename||req.file.originalname,captureTime=req.body.captureTime||parsePhotoFilename(filename).captureTime||null,result=await db.query("INSERT INTO photos(id,individual_id,filename,capture_time,storage_path,original_path,mime_type,size_bytes,sha256,latitude,longitude,gps_time,location_source,exif_checked_at,altitude_m) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14) RETURNING *",[id,individualId,filename,captureTime,path.relative(photoDir,target),req.file.originalname,req.file.mimetype,req.file.size,crypto.createHash("sha256").update(bytes).digest("hex"),exif.latitude,exif.longitude,exif.gpsTime,exif.hasGps?"exif":"missing",exif.altitudeM]);
    await audit(req.user,"photo_uploaded","photo",id,{individualId,filename:result.rows[0].filename,locationSource:result.rows[0].location_source},req);res.status(201).json({photo:photoPublic(result.rows[0])});
  }catch(e){if(target)await fsp.unlink(target).catch(()=>{});else if(req.file?.path)await fsp.unlink(req.file.path).catch(()=>{});next(e);}
});

app.use((error,_req,res,_next)=>{console.error(error);if(error.code==="23505")return res.status(409).json({error:"duplicate_value",detail:error.detail});if(error.code==="LIMIT_FILE_SIZE")return res.status(413).json({error:"file_too_large"});if(error.code==="LIMIT_FILE_COUNT")return res.status(413).json({error:"too_many_files"});if(["invalid_upload_path","archive_has_too_many_files"].includes(error.message))return res.status(400).json({error:error.message});if(String(error.message||"").includes("CORS"))return res.status(403).json({error:"cors_forbidden"});res.status(500).json({error:"server_error"});});
const server=app.listen(port,()=>console.log(`Stork Edit API listening on port ${port}`));
async function shutdown(signal){console.log(`${signal}: closing server`);server.close(async()=>{await db.end();process.exit(0);});}
process.on("SIGTERM",()=>shutdown("SIGTERM"));process.on("SIGINT",()=>shutdown("SIGINT"));
