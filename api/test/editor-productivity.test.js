import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ui=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");
const i18nSource=fs.readFileSync(new URL("../../app-i18n.js",import.meta.url),"utf8");

function loadI18n(language){
  const documentElement={lang:"en",dataset:{},hasAttribute:()=>false,querySelectorAll:()=>[]};
  const document={documentElement,title:"",readyState:"complete",body:{classList:{contains:()=>false}},querySelectorAll:()=>[],getElementById:()=>null,createTreeWalker:()=>({nextNode:()=>null}),addEventListener:()=>{}};
  const context={window:null,document,location:{search:""},navigator:{languages:["en-US"],language:"en-US"},localStorage:{getItem:(key)=>key==="storkAppLanguageV1"?language:null,setItem:()=>{}},URLSearchParams,MutationObserver:class{observe(){}},NodeFilter:{SHOW_TEXT:4},Node:{},console};
  context.window=context;vm.runInNewContext(i18nSource,context,{filename:"app-i18n.js"});return context.StorkAppI18n;
}

test("copy previous opens a localized picker and scans back to three annotated photos",()=>{
  assert.match(ui,/id="editorPreviousPicker"[\s\S]*?id="editorPreviousChoices"/);
  assert.match(ui,/for\(let index=editorPhotoIndex-1;index>=0&&choices\.length<3;index--\)/);
  assert.match(ui,/String\(point\?\.status\|\|""\)==="unstarted"/);
  assert.match(ui,/\(point\?\.bird\|\|birdId\)!==currentBird/);
  assert.match(ui,/editorCopyPreviousBtn\.addEventListener\("click",\(\)=>void openEditorPreviousPicker\(\)\)/);
  const en=loadI18n("en"),pl=loadI18n("pl");
  assert.equal(en.t("editor.copyPickerTitle"),"Choose a previous annotation");
  assert.equal(pl.t("editor.copyPickerTitle"),"Wybierz poprzedni opis");
  assert.equal(pl.optionLabel("foraging"),"Żerowanie");
});

test("copying keeps current derived fields, does not save and adds only the requested mismatch warning",()=>{
  assert.match(ui,/EDITOR_COPY_EXCLUDED_FIELDS=new Set\(\["Elevation_m","Above_ground","Height_class_100m","Analysed"\]\)/);
  assert.match(ui,/currentDerived=\{Elevation_m:editorElevationEl\.value,Above_ground:editorAboveGroundEl\.value,Height_class_100m:editorHeightClassEl\.value\}/);
  assert.match(ui,/editorElevationEl\.value=currentDerived\.Elevation_m;editorAboveGroundEl\.value=currentDerived\.Above_ground;editorHeightClassEl\.value=currentDerived\.Height_class_100m/);
  assert.match(ui,/editorPinnedFields\.clear\(\);editorUpdatePinButtons\(\);[\s\S]{0,500}populateEditorForm\([\s\S]{0,300}\{applyDefaults:false\}\)/);
  assert.match(ui,/editorApplyConditionalRules\(\);editorElevationEl\.value=currentDerived\.Elevation_m/);
  assert.doesNotMatch(ui,/copyEditorPreviousAnnotation[\s\S]{0,1400}editorApiPost/);
  assert.match(ui,/movement==="fly"&&above<=0/);
  assert.match(ui,/movement==="ground"&&above>50/);
});

test("only stable fields can be pinned and pinned-only values are not automatically drafted",()=>{
  assert.deepEqual([...ui.matchAll(/data-pin-field="([^"]+)"/g)].map((match)=>match[1]),["Pheno_period","Residence","Period_day","Artificial_lights","Fly_ground"]);
  assert.match(ui,/editorCapturePinnedValues\(\)/);
  assert.match(ui,/\["Pheno_period","Residence","Period_day","Artificial_lights","Fly_ground"\]/);
  assert.match(ui,/editorLoadPhoto\(nextIndex,\{pinnedValues\}\)/);
  assert.match(ui,/if\(changed\)\{editorDirty=false;editorOnlyPinnedChanges=true/);
  assert.match(ui,/key!=="Artificial_lights"\|\|isNight/);
});

test("new unstarted annotations default feathers visible to yes without replacing saved or copied values",()=>{
  assert.match(ui,/applyDefaults&&status==="unstarted"&&\(savedFeatherOccurrence===null\|\|savedFeatherOccurrence===undefined\|\|String\(savedFeatherOccurrence\)\.trim\(\)===""\)\)editorFeatherOccEl\.value="yes"/);
  assert.match(ui,/populateEditorForm\(result\.data \|\| \{\},\{status:result\.status\|\|"unstarted"\}\)/);
  assert.match(ui,/status:photo\.status\|\|"unstarted"/);
  assert.match(ui,/populateEditorForm\([\s\S]{0,300}\{applyDefaults:false\}\)/);
  assert.doesNotMatch(ui,/editorFeatherPercEl\.value\s*=\s*[^;]*yes/);
});

test("save and next shortcut reuses the existing button and mobile picker is a bottom sheet",()=>{
  assert.match(ui,/\(event\.ctrlKey\|\|event\.metaKey\)&&event\.key==="Enter"/);
  assert.match(ui,/editorSaveNextBtn\.click\(\)/);
  assert.match(ui,/editorSaving\|\|editorSaveNextBtn\.disabled\|\|blockingDialog\(\)/);
  assert.match(ui,/@media\(max-width:700px\)\{[\s\S]*?\.editorPreviousPicker \{[\s\S]*?bottom:max\(8px,env\(safe-area-inset-bottom\)\)/);
});
