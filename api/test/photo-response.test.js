import test,{after,before} from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import express from "express";
import sharp from "sharp";
import { sendOriginalPhoto,sendPreviewOrOriginal } from "../src/photo-response.js";

let root,original,preview,server,baseUrl;
const forwardedErrors=[];

before(async()=>{
  root=await fsp.mkdtemp(path.join(os.tmpdir(),"stork-photo-response-"));
  original=path.join(root,"original.jpg");
  preview=path.join(root,"previews","photo-1.webp");
  await fsp.mkdir(path.dirname(preview),{recursive:true});
  await sharp({create:{width:32,height:24,channels:3,background:{r:30,g:90,b:140}}}).jpeg().toFile(original);

  const app=express();
  app.get("/api/public/photos/:id/image",(req,res,next)=>{
    if(req.query.kind!=="preview")return sendOriginalPhoto(res,next,{file:original,mimeType:"image/jpeg"});
    const target=req.query.failure==="read"?path.join(root,"preview-directory.webp"):req.query.failure==="generate"?path.join(root,"previews","generation-failure.webp"):preview;
    return sendPreviewOrOriginal(res,next,{
      original,
      originalMimeType:"image/jpeg",
      preview:target,
      createPreview:async(temporary)=>{
        if(req.query.failure==="generate")throw new Error("simulated preview generation failure");
        await sharp(original).resize({width:16}).webp().toFile(temporary);
      }
    });
  });
  await fsp.mkdir(path.join(root,"preview-directory.webp"));
  app.use((error,_req,res,_next)=>{forwardedErrors.push(error);res.status(500).json({error:error.message});});
  server=await new Promise((resolve)=>{const listener=app.listen(0,"127.0.0.1",()=>resolve(listener));});
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});

after(async()=>{
  if(server)await new Promise((resolve)=>server.close(resolve));
  if(root&&path.basename(root).startsWith("stork-photo-response-"))await fsp.rm(root,{recursive:true,force:true});
});

test("original public photo endpoint returns HTTP 200",async()=>{
  const response=await fetch(`${baseUrl}/api/public/photos/photo-1/image`);
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")||"",/^image\/jpeg/);
  assert.ok((await response.arrayBuffer()).byteLength>0);
});

test("preview endpoint returns a generated WebP without NotFoundError",async()=>{
  const response=await fetch(`${baseUrl}/api/public/photos/photo-1/image?kind=preview`);
  const body=Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")||"",/^image\/webp/);
  assert.equal(body.subarray(0,4).toString("ascii"),"RIFF");
  assert.equal(body.subarray(8,12).toString("ascii"),"WEBP");
  assert.equal(forwardedErrors.some((error)=>error?.name==="NotFoundError"),false);
});

test("preview generation failure falls back to the original photo",async()=>{
  const response=await fetch(`${baseUrl}/api/public/photos/photo-1/image?kind=preview&failure=generate`);
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")||"",/^image\/jpeg/);
});

test("preview read/send-path failure falls back to the original photo",async()=>{
  const response=await fetch(`${baseUrl}/api/public/photos/photo-1/image?kind=preview&failure=read`);
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")||"",/^image\/jpeg/);
  assert.equal(forwardedErrors.length,0);
});
