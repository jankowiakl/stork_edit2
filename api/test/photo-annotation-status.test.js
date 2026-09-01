import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");
const i18n=fs.readFileSync(new URL("../../app-i18n.js",import.meta.url),"utf8");

test("photo annotation shortcut renders complete and unfinished states",()=>{
  assert.match(ui,/id="photoAnnotationStatus"[^>]*>○<\/button>/);
  assert.match(ui,/const complete=currentPhotoDetails\.status==="complete"/);
  assert.match(ui,/photoAnnotationStatusBtn\.textContent=complete\?"✓":"○"/);
  assert.match(ui,/photoAnnotationStatusBtn\.classList\.toggle\("complete",complete\)/);
  assert.match(i18n,/"photo\.annotationComplete":"Annotation complete — open editor"/);
  assert.match(i18n,/"photo\.annotationIncomplete":"Opis niezakończony — otwórz arkusz"/);
});

test("shortcut opens the current photo and saving refreshes its local status",()=>{
  assert.match(ui,/photoAnnotationStatusBtn\.addEventListener\("click",async\(\)=>/);
  assert.match(ui,/track\.findIndex\(\(point\)=>point\.photoId===socialPhotoId\)/);
  assert.match(ui,/if\(index!==currentPhotoIndex\(\)\)await showPhotoAtIndex\(index,\{purpose:"annotation"\}\);await openEditorMode\(\)/);
  assert.match(ui,/if\(socialPhotoId===point\.photoId\)\{currentPhotoDetails=\{[\s\S]*?status:targetStatus[\s\S]*?renderPhotoAnnotationStatus\(\);\}/);
});

test("touch swipe ignores the status button and Survey/read-only viewers do not expose it",()=>{
  assert.match(ui,/photoSwipeInteractiveSelector="button,/);
  assert.match(ui,/body\.surveyMode \.photoAnnotationStatus \{ display:none!important; \}/);
  assert.match(ui,/body\.sharedPhotoSafeReadOnly [^\n]*#photoAnnotationStatus/);
  assert.match(ui,/\.photoStage\.touchControlsVisible \.photoInfoToggle,\.photoStage\.touchControlsVisible \.photoAnnotationStatus/);
});

test("viewer download uses authenticated or signed media and stays out of Survey",()=>{
  assert.match(ui,/id="photoDownloadPhoto"[^>]*>↓<\/button>/);
  assert.match(ui,/\.photoDownloadToggle\{right:100px/);
  assert.match(ui,/\.photoStage\.navControlsVisible \.photoDownloadToggle/);
  assert.match(ui,/\.photoStage\.touchControlsVisible \.photoDownloadToggle/);
  assert.match(ui,/body\.surveyMode \.photoDownloadToggle,body\.surveyRewardMode \.photoDownloadToggle \{ display:none!important; \}/);
  assert.match(ui,/body\.editorOpen \.photoDownloadToggle \{ display:none!important; \}/);
  assert.match(ui,/if\(source\.remoteUrl\)await downloadRemoteImage\(source\.remoteUrl,source\.filename\);else await downloadApiFile\(`\/api\/photos\/\$\{encodeURIComponent\(source\.photoId\)\}\/download`/);
  assert.match(ui,/const downloadRemoteImage=async\(url,fallbackName\)=>\{const response=await fetch\(url\);if\(!response\.ok\)throw new Error/);
  assert.match(i18n,/"photo\.download":"Download photo"/);
  assert.match(i18n,/"photo\.download":"Pobierz zdjęcie"/);
  assert.match(ui,/id="editorDownloadPhoto"/);
});
