import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

test("Survey API returns absolute media URLs and serves original, preview and Top 10 media over HTTP",async()=>{
  process.env.JWT_SECRET="survey-http-test-secret-that-is-long-enough-123456";
  const [{createSurveyRouter},{signSurveyMediaToken},{surveyMediaUrl}]=await Promise.all([import("../src/survey-routes.js"),import("../src/auth.js"),import("../src/survey.js")]);
  const link={id:"campaign-1",campaign_id:"campaign-1",link_id:"link-1",name:"Survey",status:"active",link_status:"active",link_type:"reusable",photo_count:1,date_from:null,date_to:null,expires_at:null,demographic_fields:[],contact_name:"Research team",contact_email:"team@example.test",project_url:null,intro_pl:"Wstęp",intro_en:"Introduction",thanks_pl:"Dziękujemy",thanks_en:"Thank you"};
  const response={id:"response-1",campaign_id:"campaign-1",link_id:"link-1",status:"started",started_at:new Date(),completed_at:null,quality_flags:[],included:true};
  const photo={id:"photo-1",individual_id:"bird-1",filename:"bird-1_20260101_120000.jpg",capture_time:new Date("2026-01-01T12:00:00Z"),latitude:52.1,longitude:16.9,altitude_m:120,elevation_m:80,media_status:"available",position:1,survey_rating:null,average_rating:4.8,rating_count:6};
  const db={query:async(sql)=>{
    const text=String(sql);
    if(text.includes("FROM survey_links link"))return{rows:[link]};
    if(text.includes("FROM survey_responses WHERE link_id"))return{rows:[response]};
    if(text.includes("FROM survey_response_photos assigned JOIN photos"))return{rows:[photo]};
    if(text.includes("SELECT 1 FROM survey_response_photos"))return{rows:[{}]};
    if(text.includes("FROM survey_photo_ratings rating"))return{rows:[photo]};
    if(text.includes("SELECT 1 FROM survey_responses WHERE id"))return{rows:[{}]};
    throw new Error(`Unexpected survey HTTP test query: ${text}`);
  }};
  const app=express();app.use(express.json());
  const server=await new Promise((resolve)=>{const listening=app.listen(0,"127.0.0.1",()=>resolve(listening));});
  try{
    const address=server.address(),apiBase=`http://127.0.0.1:${address.port}`;
    const photoPublic=(row)=>({id:row.id,bird:row.individual_id,filename:row.filename,captureTime:row.capture_time.toISOString(),lat:Number(row.latitude),lon:Number(row.longitude),altitudeM:Number(row.altitude_m),elevationM:Number(row.elevation_m),mediaGranted:true});
    const servePhoto=(req,res)=>res.type(req.query.kind==="preview"?"image/webp":"image/jpeg").send(Buffer.from("survey-image"));
    app.use(createSurveyRouter({db,transaction:async(callback)=>callback(db),publicApiUrl:apiBase,publicAppUrl:"https://app.example.test/",photoPublic,servePhoto,decimate:(points)=>points}));
    app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));

    const payloadResponse=await fetch(`${apiBase}/api/public/surveys/${"a".repeat(43)}?respondent_token=${"b".repeat(43)}`);
    assert.equal(payloadResponse.status,200);
    const payload=await payloadResponse.json();
    assert.equal(payload.photos.length,1);
    for(const url of [payload.photos[0].imageUrl,payload.photos[0].previewUrl]){assert.equal(new URL(url).origin,apiBase);assert.doesNotMatch(url,/github\.io/);}

    const original=await fetch(payload.photos[0].imageUrl);
    assert.equal(original.status,200);
    assert.match(original.headers.get("content-type")||"",/^image\/jpeg/);
    const preview=await fetch(payload.photos[0].previewUrl);
    assert.equal(preview.status,200);
    assert.match(preview.headers.get("content-type")||"",/^image\/webp/);

    const refreshedPayload=await (await fetch(`${apiBase}/api/public/surveys/${"a".repeat(43)}?respondent_token=${"b".repeat(43)}`)).json();
    assert.equal(refreshedPayload.photos[0].id,payload.photos[0].id);
    assert.equal(new URL(refreshedPayload.photos[0].imageUrl).origin,apiBase);
    assert.equal((await fetch(refreshedPayload.photos[0].imageUrl)).status,200);

    const topToken=signSurveyMediaToken({responseId:response.id,photoId:photo.id,scope:"survey-top-media"}),topUrl=surveyMediaUrl(apiBase,{responseId:response.id,photoId:photo.id,mediaToken:topToken,top:true});
    const top=await fetch(topUrl);
    assert.equal(top.status,200);
    assert.match(top.headers.get("content-type")||"",/^image\/jpeg/);
  }finally{await new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));}
});
