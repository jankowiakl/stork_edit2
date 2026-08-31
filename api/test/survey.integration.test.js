import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";

const execFileAsync=promisify(execFile),testDatabaseUrl=process.env.TEST_DATABASE_URL||"",here=path.dirname(fileURLToPath(import.meta.url)),src=path.resolve(here,"../src");
const schemaConnection=(base,schema)=>{const url=new URL(base);url.searchParams.set("options",`-csearch_path=${schema}`);return url.toString();};

test("real Survey API keeps a fixed photo set, protects ratings and applies the Top 10 threshold",{skip:!testDatabaseUrl,timeout:120000},async()=>{
  assert.notEqual(testDatabaseUrl,process.env.DATABASE_URL||null,"TEST_DATABASE_URL must not be the production DATABASE_URL");
  const schema=`stork_survey_test_${Date.now()}_${Math.random().toString(16).slice(2,10)}`,rootClient=new pg.Client({connectionString:testDatabaseUrl});
  await rootClient.connect();
  let server,db;
  try{
    await rootClient.query(`CREATE SCHEMA "${schema}"`);
    const databaseUrl=schemaConnection(testDatabaseUrl,schema);
    process.env.DATABASE_URL=databaseUrl;
    process.env.JWT_SECRET="survey-integration-test-secret-with-at-least-32-chars";
    await execFileAsync(process.execPath,[path.join(src,"migrate.js")],{env:{...process.env,DATABASE_URL:databaseUrl}});
    const dbModule=await import("../src/db.js"),auth=await import("../src/auth.js"),{createSurveyRouter}=await import("../src/survey-routes.js");
    db=dbModule.db;
    await db.query("INSERT INTO users(id,email,name,role,password_hash) VALUES('survey-admin','survey-admin@example.org','Survey Admin','admin','test-hash')");
    await db.query("INSERT INTO individuals(id) VALUES('bird-a'),('bird-b')");
    await db.query(`INSERT INTO photos(id,individual_id,filename,capture_time,latitude,longitude,media_status) VALUES
      ('survey-photo-1','bird-a','survey-photo-1.jpg','2026-01-01T10:00:00Z',52.1,16.9,'available'),
      ('survey-photo-2','bird-a','survey-photo-2.jpg','2026-01-02T10:00:00Z',52.2,17.0,'available'),
      ('survey-photo-3','bird-b','survey-photo-3.jpg','2026-01-03T10:00:00Z',52.3,17.1,'available')`);
    const app=express();app.use(express.json());server=app.listen(0,"127.0.0.1");await new Promise((resolve)=>server.once("listening",resolve));const origin=`http://127.0.0.1:${server.address().port}`;
    const photoPublic=(row)=>({id:row.id,bird:row.individual_id,filename:row.filename,captureTime:row.capture_time?new Date(row.capture_time).toISOString():null,lat:Number(row.latitude),lon:Number(row.longitude),mediaGranted:true,imageUrl:`${origin}/protected/${row.id}`,previewUrl:`${origin}/protected/${row.id}?kind=preview`});
    const servePhoto=(req,res)=>res.type(req.query.kind==="preview"?"image/webp":"image/jpeg").send(req.query.kind==="preview"?Buffer.from("RIFF-test-WEBP"):Buffer.from([0xff,0xd8,0xff,0xd9]));
    app.use(createSurveyRouter({db,transaction:dbModule.transaction,publicApiUrl:origin,publicAppUrl:"https://example.test/app",photoPublic,servePhoto,decimate:(rows)=>rows}));
    app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));
    const adminToken=auth.signToken({id:"survey-admin"}),adminHeaders={authorization:`Bearer ${adminToken}`,"content-type":"application/json"},json=async(url,options={})=>{const response=await fetch(`${origin}${url}`,options),body=await response.json();return{response,body};};
    const campaignBody={name:"Integration survey",photoCount:2,linkType:"reusable",permanent:true,demographicFields:[],contactName:"Research team",contactEmail:"research@example.org",introPl:"Wprowadzenie",introEn:"Introduction",thanksPl:"Dziękujemy",thanksEn:"Thank you"};
    let result=await json("/api/surveys",{method:"POST",headers:adminHeaders,body:JSON.stringify(campaignBody)});assert.equal(result.response.status,201);const link=result.body.links[0],token=link.token;
    result=await json(`/api/public/surveys/${encodeURIComponent(token)}/start`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ageConfirmed:true,consentAccepted:true,demographics:{}})});assert.equal(result.response.status,201);assert.equal(result.body.photos.length,2);const respondentToken=result.body.respondentToken,responseId=result.body.response.id,photoIds=result.body.photos.map((photo)=>photo.id);
    const refreshed=await json(`/api/public/surveys/${encodeURIComponent(token)}?respondent_token=${encodeURIComponent(respondentToken)}`);assert.deepEqual(refreshed.body.photos.map((photo)=>photo.id),photoIds);assert.deepEqual(refreshed.body.photos.map((photo)=>photo.position),[1,2]);
    const firstImageUrl=new URL(result.body.photos[0].imageUrl);assert.equal(firstImageUrl.origin,origin);const media=await fetch(firstImageUrl);assert.equal(media.status,200);assert.match(media.headers.get("content-type"),/^image\//);
    const preview=await fetch(result.body.photos[0].previewUrl);assert.equal(preview.status,200);assert.equal(preview.headers.get("content-type"),"image/webp");
    const unassigned=["survey-photo-1","survey-photo-2","survey-photo-3"].find((id)=>!photoIds.includes(id));result=await json(`/api/public/surveys/${encodeURIComponent(token)}/responses/${responseId}/photos/${unassigned}/rating`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({respondentToken,rating:5})});assert.equal(result.response.status,403);
    for(const [index,photoId] of photoIds.entries()){result=await json(`/api/public/surveys/${encodeURIComponent(token)}/responses/${responseId}/photos/${photoId}/rating`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({respondentToken,rating:index+4})});assert.equal(result.response.status,200);}
    result=await json(`/api/public/surveys/${encodeURIComponent(token)}/responses/${responseId}/complete`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({respondentToken})});assert.equal(result.response.status,200);assert.equal(result.body.photos.length,0,"fewer than five independent ratings must not enter Top 10");
    result=await json(`/api/public/surveys/${encodeURIComponent(token)}/responses/${responseId}/photos/${photoIds[0]}/rating`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({respondentToken,rating:1})});assert.equal(result.response.status,409);
    const campaignId=(await db.query("SELECT id FROM survey_campaigns WHERE name='Integration survey'")).rows[0].id,linkId=(await db.query("SELECT id FROM survey_links WHERE campaign_id=$1",[campaignId])).rows[0].id;
    for(let index=0;index<4;index++){const extraResponse=`survey-extra-${index}`;await db.query("INSERT INTO survey_responses(id,campaign_id,link_id,respondent_token_hash,status,demographics,age_confirmed,consent_accepted,completed_at) VALUES($1,$2,$3,$4,'completed','{}',true,true,now())",[extraResponse,campaignId,linkId,`unique-test-hash-${index}`]);await db.query("INSERT INTO survey_response_photos(response_id,photo_id,position) VALUES($1,$2,1)",[extraResponse,photoIds[0]]);await db.query("INSERT INTO survey_photo_ratings(response_id,photo_id,rating) VALUES($1,$2,5)",[extraResponse,photoIds[0]]);}
    result=await json(`/api/public/surveys/${encodeURIComponent(token)}?respondent_token=${encodeURIComponent(respondentToken)}`);assert.equal(result.body.state,"completed");assert.equal(result.body.photos[0].id,photoIds[0]);assert.equal(result.body.photos[0].surveyRatingCount,5);const topMedia=await fetch(result.body.photos[0].imageUrl);assert.equal(topMedia.status,200);assert.match(topMedia.headers.get("content-type"),/^image\//);
    const single=await json("/api/surveys",{method:"POST",headers:adminHeaders,body:JSON.stringify({...campaignBody,name:"Single use survey",photoCount:1,linkType:"single_use",singleUseCount:1})}),singleToken=single.body.links[0].token,first=await json(`/api/public/surveys/${encodeURIComponent(singleToken)}/start`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ageConfirmed:true,consentAccepted:true,demographics:{}})}),second=await json(`/api/public/surveys/${encodeURIComponent(singleToken)}/start`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ageConfirmed:true,consentAccepted:true,demographics:{}})});assert.equal(first.body.response.id,second.body.response.id);assert.equal(Number((await db.query("SELECT count(*) count FROM survey_responses WHERE campaign_id=$1",[single.body.campaign.id])).rows[0].count),1);
  }finally{
    if(server)await new Promise((resolve)=>server.close(resolve));
    if(db)await db.end().catch(()=>{});
    await rootClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
    await rootClient.end();
  }
});
