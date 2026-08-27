import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync=promisify(execFile);
const imagePattern=/\.(jpe?g|png|webp)$/i;
const sourceDir=path.dirname(fileURLToPath(import.meta.url));

export function normalizeImportRelativePath(value,fallback){
  const normalized=String(value||fallback||"").replaceAll("\\","/");
  if(normalized.startsWith("/")||/^[A-Za-z]:\//.test(normalized)||normalized.includes("\0"))throw new Error("invalid_upload_path");
  const parts=normalized.split("/").filter((part)=>part&&part!==".");
  if(!parts.length||parts.some((part)=>part===".."))throw new Error("invalid_upload_path");
  return parts.join(path.sep);
}

async function moveUploaded(file,target){
  await fsp.mkdir(path.dirname(target),{recursive:true});
  if(fs.existsSync(target)){const parsed=path.parse(target);target=path.join(parsed.dir,`${parsed.name}-${Date.now()}-${Math.random().toString(16).slice(2)}${parsed.ext}`);}
  await fsp.rename(file.path,target);
  return target;
}

async function extractArchive(archive,photoStage,maxEntries){
  const {stdout}=await execFileAsync("unzip",["-Z1",archive],{maxBuffer:32*1024*1024});
  const entries=stdout.split(/\r?\n/).filter(Boolean);
  if(entries.length>maxEntries)throw new Error("archive_has_too_many_files");
  for(const entry of entries)normalizeImportRelativePath(entry,entry);
  await fsp.mkdir(photoStage,{recursive:true});
  await execFileAsync("unzip",["-q",archive,"-d",photoStage],{maxBuffer:8*1024*1024});
}

export async function stageBrowserImport({batchId,files,body,stageRoot,maxEntries=10000}){
  const stage=path.join(stageRoot,batchId),photoStage=path.join(stage,"photos");
  await fsp.mkdir(stage,{recursive:true});
  const manifest={};
  const single=async(field)=>{const file=files?.[field]?.[0];if(!file)return null;const target=path.join(stage,`${field}${path.extname(file.originalname).toLowerCase()}`);return moveUploaded(file,target);};
  try{
    manifest.workbook=await single("workbook");
    manifest.gps=await single("gps");
    manifest.stopovers=await single("stopovers");
    const archive=await single("archive");
    if(archive)await extractArchive(archive,photoStage,maxEntries);
    const uploadedPhotos=files?.photos||[],photoPaths=(()=>{try{const value=JSON.parse(body?.photoPaths||"[]");return Array.isArray(value)?value:[];}catch{return[];}})();
    for(let index=0;index<uploadedPhotos.length;index++){
      const file=uploadedPhotos[index];if(!imagePattern.test(file.originalname))continue;
      const relative=normalizeImportRelativePath(photoPaths[index],file.originalname);
      await moveUploaded(file,path.join(photoStage,relative));
    }
    if(fs.existsSync(photoStage))manifest.photos=photoStage;
    manifest.sourceName=[files?.workbook?.[0]?.originalname,files?.archive?.[0]?.originalname,files?.gps?.[0]?.originalname,files?.stopovers?.[0]?.originalname,uploadedPhotos.length?`${uploadedPhotos.length} photos`:null].filter(Boolean).join(", ")||"browser import";
    return{stage,manifest};
  }catch(error){await fsp.rm(stage,{recursive:true,force:true}).catch(()=>{});for(const group of Object.values(files||{}))for(const file of group||[])await fsp.unlink(file.path).catch(()=>{});throw error;}
}

export async function runStagedImport({batchId,createdBy,manifest,reportPath,apply=false,replaceAnnotations=false,timeoutMs=30*60*1000}){
  const cli=[path.join(sourceDir,"import-data.js")];
  for(const key of ["workbook","photos","gps","stopovers"])if(manifest[key])cli.push(`--${key}`,manifest[key]);
  cli.push("--report",reportPath,"--batch-id",batchId,"--created-by",createdBy,"--source-name",manifest.sourceName||"browser import");
  if(apply)cli.push("--apply");if(replaceAnnotations)cli.push("--replace-annotations");
  await execFileAsync(process.execPath,cli,{cwd:path.dirname(sourceDir),timeout:timeoutMs,maxBuffer:8*1024*1024,env:process.env});
  return JSON.parse(await fsp.readFile(reportPath,"utf8"));
}

export async function removeStagedImport(stage){if(stage)await fsp.rm(stage,{recursive:true,force:true});}
