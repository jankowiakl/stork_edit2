import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require=createRequire(import.meta.url);
const interactions=require("../../viewer-interactions.js");
const ui=await readFile(new URL("../../index.html",import.meta.url),"utf8");

test("swipe left advances and swipe right returns",()=>{
  assert.equal(interactions.swipeDecision({dx:-110,dy:8,durationMs:280,width:390,canNavigate:true}).direction,1);
  assert.equal(interactions.swipeDecision({dx:-110,dy:8,durationMs:280,width:390,canNavigate:true}).commit,true);
  assert.equal(interactions.swipeDecision({dx:110,dy:8,durationMs:280,width:390,canNavigate:true}).direction,-1);
  assert.equal(interactions.swipeDecision({dx:110,dy:8,durationMs:280,width:390,canNavigate:true}).commit,true);
});

test("short swipe and vertical scroll do not navigate",()=>{
  assert.equal(interactions.swipeDecision({dx:14,dy:2,durationMs:300,width:390,canNavigate:true}).commit,false);
  assert.equal(interactions.swipeDecision({dx:-45,dy:90,durationMs:120,width:390,canNavigate:true}).commit,false);
});

test("bounds and an unrated Survey photo snap back",()=>{
  const boundary=interactions.swipeDecision({dx:130,dy:2,durationMs:160,width:390,canNavigate:false});
  const unrated=interactions.swipeDecision({dx:-130,dy:2,durationMs:160,width:390,canNavigate:false});
  assert.equal(boundary.commit,false);
  assert.equal(unrated.commit,false);
  assert.equal(boundary.resistedX,31.2);
  assert.match(ui,/reason==="survey_unrated"[\s\S]*?Najpierw oceń to zdjęcie\.[\s\S]*?Please rate this photo first\./);
});

test("rated Survey navigation uses the same allowed swipe path",()=>{
  assert.equal(interactions.swipeDecision({dx:-80,dy:4,durationMs:120,width:375,canNavigate:true}).commit,true);
  assert.match(ui,/access=photoNavigationAccess\(direction\)/);
  assert.match(ui,/navigatePhotoSequenceBy\(direction,\{source:"swipe"\}\)/);
});

test("touch navigation hides side buttons while desktop controls remain defined",()=>{
  assert.match(ui,/@media \(hover:none\), \(pointer:coarse\)[\s\S]*?body:not\(\.editorOpen\) \.photoStage \.photoNav \{ display:none!important; \}/);
  assert.match(ui,/id="prevPhoto"[\s\S]*?id="nextPhoto"/);
  assert.match(ui,/prevPhotoBtn\.addEventListener\("click"/);
});

test("the shared photo-stage swipe also serves the mobile editor without blocking vertical form scrolling",()=>{
  const begin=ui.slice(ui.indexOf("const beginPhotoSwipe="),ui.indexOf("const movePhotoSwipe="));
  assert.doesNotMatch(begin,/editorOpen/);
  assert.match(ui,/\.photoStage \{ touch-action:pan-y pinch-zoom; \}/);
  assert.match(ui,/document\.body\.classList\.contains\("editorOpen"\)\)\{const next=editorPhotoIndex\+direction,total=activeEditorSequence\(\)\.length;return\{allowed:next>=0&&next<total/);
  assert.match(ui,/document\.body\.classList\.contains\("editorOpen"\)\)return!!\(await moveEditorPhoto\(direction\)\)/);
  assert.match(ui,/Saving draft before changing photo/);
});

test("initial Maps & Photos bird is random, has photos, and avoids the prior automatic choice",()=>{
  const counts=new Map([["empty",0],["A",10],["B",4]]);
  assert.equal(interactions.chooseInitialBird(["empty","A","B"],(id)=>counts.get(id),"A",0),"B");
  assert.equal(interactions.chooseInitialBird(["empty","A","B"],(id)=>counts.get(id),"B",0),"A");
  assert.equal(interactions.chooseInitialBird(["empty"],(id)=>counts.get(id),null,0.5),null);
  assert.match(ui,/storkLastAutomaticBirdV1/);
});

test("Survey runtime viewport assertion requires every stage to fill the viewport",()=>{
  for(const width of [320,360,375,390,430]){
    assert.equal(interactions.surveyViewportWidthsMatch(width,{wrap:width,side:width,photoCard:width,photoStage:width,mapStack:width},3),true);
    assert.equal(interactions.surveyViewportWidthsMatch(width,{wrap:width*.45,side:width*.45,photoCard:width*.45,photoStage:width*.45,mapStack:width*.45},3),false);
  }
  assert.match(ui,/assertSurveyMobileViewportWidth/);
  assert.match(ui,/visualViewport\?\.width\|\|window\.innerWidth/);
  assert.match(ui,/requestAnimationFrame\(\(\)=>requestAnimationFrame\(/);
});
