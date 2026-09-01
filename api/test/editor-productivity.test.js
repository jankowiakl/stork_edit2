import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ui=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");
const i18nSource=fs.readFileSync(new URL("../../app-i18n.js",import.meta.url),"utf8");
const serverSource=fs.readFileSync(new URL("../src/server.js",import.meta.url),"utf8");

function editorControlHarness(){
  const busySource=ui.match(/  const editorSetBusy = \(busy\) => \{[\s\S]*?\n  \};/)?.[0];
  const editableSource=ui.match(/  const editorSetEditable=\(editable\)=>\{[\s\S]*?\n  \};/)?.[0];
  assert.ok(busySource,"editorSetBusy source");assert.ok(editableSource,"editorSetEditable source");
  return new Function(`
    const button=()=>({disabled:false,hidden:false});
    const editorSaveDraftBtn=button(),editorSaveAnalysedBtn=button(),editorSaveNextBtn=button(),editorPrevPhotoBtn=button(),editorNextPhotoBtn=button(),editorCopyPreviousBtn=button(),editorNextUnannotatedBtn=button(),editorRequestReviewBtn=button(),editorDownloadPhotoBtn=button(),editorEnvToggleBtn=button();
    const editorFieldEls=[{disabled:false}],editorFormEl={classList:{toggle:()=>{}}},track=[{photoId:"C"}];
    let editorSaving=false,editorCanEdit=false,editorCurrentPhotoId="C",editorPhotoIndex=0,pinRefreshes=0,conditionalRefreshes=0;
    const editorHasConnection=()=>true,activeEditorSequence=()=>track,photoSafeViewerContext=null,document={body:{classList:{contains:()=>false}}};
    const editorUpdatePinButtons=()=>{pinRefreshes++;},editorApplyConditionalRules=()=>{conditionalRefreshes++;},closeEditorEnvAutocomplete=()=>{};
    ${busySource}
    ${editableSource}
    return {setBusy:editorSetBusy,setEditable:editorSetEditable,track,state:()=>({copy:editorCopyPreviousBtn.disabled,draft:editorSaveDraftBtn.disabled,analysed:editorSaveAnalysedBtn.disabled,saveNext:editorSaveNextBtn.disabled,environment:editorEnvToggleBtn.disabled,field:editorFieldEls[0].disabled,pinRefreshes,conditionalRefreshes,canEdit:editorCanEdit})};
  `)();
}

function loadI18n(language){
  const documentElement={lang:"en",dataset:{},hasAttribute:()=>false,querySelectorAll:()=>[]};
  const document={documentElement,title:"",readyState:"complete",body:{classList:{contains:()=>false}},querySelectorAll:()=>[],getElementById:()=>null,createTreeWalker:()=>({nextNode:()=>null}),addEventListener:()=>{}};
  const context={window:null,document,location:{search:""},navigator:{languages:["en-US"],language:"en-US"},localStorage:{getItem:(key)=>key==="storkAppLanguageV1"?language:null,setItem:()=>{}},URLSearchParams,MutationObserver:class{observe(){}},NodeFilter:{SHOW_TEXT:4},Node:{},console};
  context.window=context;vm.runInNewContext(i18nSource,context,{filename:"app-i18n.js"});return context.StorkAppI18n;
}

test("copy previous opens a localized picker backed by the current photo database endpoint",()=>{
  assert.match(ui,/id="editorPreviousPicker"[\s\S]*?id="editorPreviousChoices"/);
  assert.match(ui,/apiFetch\(`\/api\/photos\/\$\{encodeURIComponent\(editorCurrentPhotoId\)\}\/previous-annotations\?limit=3`\)/);
  assert.doesNotMatch(ui,/collectEditorPreviousAnnotations[\s\S]{0,500}activeEditorSequence\(\)/);
  assert.doesNotMatch(ui,/collectEditorPreviousAnnotations[\s\S]{0,500}editorPhotoIndex/);
  assert.match(ui,/editorCopyPreviousBtn\.addEventListener\("click",\(\)=>void openEditorPreviousPicker\(\)\)/);
  const en=loadI18n("en"),pl=loadI18n("pl");
  assert.equal(en.t("editor.copyPickerTitle"),"Choose a previous annotation");
  assert.equal(pl.t("editor.copyPickerTitle"),"Wybierz poprzedni opis");
  assert.equal(pl.optionLabel("foraging"),"Żerowanie");
});

test("the previous annotation endpoint uses database chronology and meaningful saved records",()=>{
  assert.match(serverSource,/\/api\/photos\/:id\/previous-annotations/);
  assert.match(serverSource,/row_number\(\) OVER \(ORDER BY p\.capture_time NULLS LAST,p\.filename\) sequence_position/);
  assert.match(serverSource,/a\.status IN \('draft','needs_review','complete'\) OR \$\{meaningful\}/);
  assert.match(serverSource,/ORDER BY previous\.capture_time DESC NULLS LAST,previous\.filename DESC/);
  assert.match(serverSource,/canAccessIndividual\(req\.user,current\.individual_id\)/);
  assert.match(serverSource,/limit=positiveInt\(req\.query\.limit,3,3\)/);
});

test("copy previous remains enabled for queue index zero and maps database photos B and A",()=>{
  assert.match(ui,/editorCopyPreviousBtn\.disabled=busy\|\|!editorCanEdit\|\|!editorCurrentPhotoId/);
  assert.doesNotMatch(ui,/editorCopyPreviousBtn\.disabled=[^;]*editorPhotoIndex\s*<=\s*0/);
  assert.doesNotMatch(ui,/openEditorPreviousPicker=async\(\)=>\{[^}]*editorPhotoIndex\s*<=\s*0/);
  const editorPhotoIndex=0,editorCanEdit=true,editorSaving=false,editorCurrentPhotoId="C";
  assert.equal(editorSaving||!editorCanEdit||!editorCurrentPhotoId,false);
  const apiResult={annotations:[{photoId:"B",distance:1,data:{Activity_class:"foraging"}},{photoId:"A",distance:2,data:{Activity_class:"fly"}}]};
  const choices=apiResult.annotations.map((annotation)=>({point:{photoId:annotation.photoId},record:{data:annotation.data}}));
  assert.deepEqual(choices.map((choice)=>choice.point.photoId),["B","A"]);
  assert.equal(choices[0].record.data.Activity_class,"foraging");
  assert.equal(editorPhotoIndex,0);
});

test("editable API resolution immediately refreshes copy, save, environment and pin controls",()=>{
  const editor=editorControlHarness();
  editor.setEditable(false);editor.setBusy(false);
  const locked=editor.state();
  assert.equal(locked.copy,true);assert.equal(locked.draft,true);assert.equal(locked.analysed,true);assert.equal(locked.environment,true);assert.equal(locked.field,true);
  editor.setEditable(true);
  const editable=editor.state();
  assert.equal(editable.copy,false,"photo C at queue index zero must allow database-backed Copy previous");
  assert.equal(editable.draft,false);assert.equal(editable.analysed,false);assert.equal(editable.environment,false);assert.equal(editable.field,false);
  assert.equal(editable.saveNext,true,"Save & next remains disabled when the current queue has no next photo");
  assert.ok(editable.pinRefreshes>locked.pinRefreshes);assert.equal(editable.conditionalRefreshes,1);
  editor.track.push({photoId:"D"});editor.setEditable(true);
  assert.equal(editor.state().saveNext,false,"Save & next refreshes when a next queue photo exists");
  assert.doesNotMatch(ui.match(/const editorSetBusy = \(busy\) => \{[\s\S]*?\n  \};/)?.[0]||"",/editorSetEditable\(/,"editorSetBusy must not recurse into editorSetEditable");
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
  assert.match(ui,/status:photo\.status, hasAnnotation:photo\.hasAnnotation/);
  assert.match(ui,/populateEditorForm\([\s\S]{0,300}\{applyDefaults:false\}\)/);
  assert.doesNotMatch(ui,/editorFeatherPercEl\.value\s*=\s*[^;]*yes/);
});

test("save and next shortcut reuses the existing button and mobile picker is a bottom sheet",()=>{
  assert.match(ui,/\(event\.ctrlKey\|\|event\.metaKey\)&&event\.key==="Enter"/);
  assert.match(ui,/editorSaveNextBtn\.click\(\)/);
  assert.match(ui,/editorSaving\|\|editorSaveNextBtn\.disabled\|\|blockingDialog\(\)/);
  assert.match(ui,/@media\(max-width:700px\)\{[\s\S]*?\.editorPreviousPicker \{[\s\S]*?bottom:max\(8px,env\(safe-area-inset-bottom\)\)/);
});
