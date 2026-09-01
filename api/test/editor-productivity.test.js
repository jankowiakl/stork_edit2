import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ui=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");
const i18nSource=fs.readFileSync(new URL("../../app-i18n.js",import.meta.url),"utf8");

function editorControlHarness(){
  const busySource=ui.match(/  const editorSetBusy = \(busy\) => \{[\s\S]*?\n  \};/)?.[0];
  const editableSource=ui.match(/  const editorSetEditable=\(editable\)=>\{[\s\S]*?\n  \};/)?.[0];
  assert.ok(busySource,"editorSetBusy source");assert.ok(editableSource,"editorSetEditable source");
  return new Function(`
    const button=()=>({disabled:false,hidden:false});
    const editorSaveDraftBtn=button(),editorSaveAnalysedBtn=button(),editorSaveNextBtn=button(),editorPrevPhotoBtn=button(),editorNextPhotoBtn=button(),editorCopyPreviousBtn=button(),editorNextUnannotatedBtn=button(),editorRequestReviewBtn=button(),editorDownloadPhotoBtn=button(),editorEnvToggleBtn=button();
    const editorFieldEls=[{disabled:false}],editorFormEl={classList:{toggle:()=>{}}},track=[{photoId:"C"}];
    let editorSaving=false,editorCanEdit=false,editorCurrentPhotoId="C",editorPhotoIndex=0,pinRefreshes=0,conditionalRefreshes=0,hasLastAnnotation=false;
    const editorHasConnection=()=>true,activeEditorSequence=()=>track,photoSafeViewerContext=null,document={body:{classList:{contains:()=>false}}};
    const editorHasLastAnnotation=()=>hasLastAnnotation;
    const editorUpdatePinButtons=()=>{pinRefreshes++;},editorApplyConditionalRules=()=>{conditionalRefreshes++;},closeEditorEnvAutocomplete=()=>{};
    ${busySource}
    ${editableSource}
    return {setBusy:editorSetBusy,setEditable:editorSetEditable,setHasLastAnnotation:(value)=>{hasLastAnnotation=!!value;},track,state:()=>({copy:editorCopyPreviousBtn.disabled,draft:editorSaveDraftBtn.disabled,analysed:editorSaveAnalysedBtn.disabled,saveNext:editorSaveNextBtn.disabled,environment:editorEnvToggleBtn.disabled,field:editorFieldEls[0].disabled,pinRefreshes,conditionalRefreshes,canEdit:editorCanEdit})};
  `)();
}

function lastAnnotationHarness(){
  const names=["editorReusableAnnotationValues","editorLastAnnotationStorageKey","editorReadLastAnnotation","editorHasLastAnnotation","editorStoreLastAnnotation"],sources=names.map((name)=>ui.match(new RegExp(`  const ${name}=.*?;\\r?\\n`))?.[0]);
  const pasteSource=ui.match(/  const pasteEditorLastAnnotation=\(\)=>\{[\s\S]*?\n  \};/)?.[0];
  for(const [index,source] of sources.entries())assert.ok(source,names[index]);assert.ok(pasteSource,"pasteEditorLastAnnotation");
  return new Function(`
    const makeField=(key,value="",tagName="INPUT",type="text")=>({dataset:{field:key},value,tagName,type,checked:false});
    const editorFieldEls=[makeField("Residence","no","SELECT"),makeField("Activity_class","fly","SELECT"),makeField("Fly_ground","fly","SELECT"),makeField("Remarks","old"),makeField("Elevation_m","220","INPUT","number"),makeField("Above_ground","120","INPUT","number"),makeField("Height_class_100m","100","INPUT","number")];
    const byKey=Object.fromEntries(editorFieldEls.map((field)=>[field.dataset.field,field])),editorElevationEl=byKey.Elevation_m,editorAboveGroundEl=byKey.Above_ground,editorHeightClassEl=byKey.Height_class_100m;
    const EDITOR_LOCAL_BUFFER_EXCLUDED_FIELDS=new Set(["FileName","Bird","photoId","Latitude","Longitude","GPS_time","GPS_source","Altitude_m","Elevation_m","Above_ground","Height_class_100m","version","status","Analysed"]),EDITOR_LAST_ANNOTATION_PREFIX="storkLastAnnotationV1:";
    const storage=new Map(),localStorage={getItem:(key)=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},authState={user:{id:"user-7"}};
    let editorSaving=false,editorCanEdit=true,editorCurrentPhotoId="B",editorHeightClassManual=true,editorDirty=false,pinRefreshes=0,conditionalRuns=0,hintRuns=0,statusMessage="",editorLoadedVersion=9,editorLoadedStatus="unstarted";
    const editorPinnedFields=new Set(["Residence","Fly_ground"]),editorUpdatePinButtons=()=>{pinRefreshes++;},clearEditorInvalid=()=>{},editorSelectValue=(field,value)=>{field.value=value==null?"":String(value);},editorApplyConditionalRules=()=>{conditionalRuns++;},updateEditorCompletionHints=()=>{hintRuns++;},editorMarkDirty=()=>{editorDirty=true;},editorSetStatus=(message)=>{statusMessage=message;},editorT=(key)=>({"editor.pasteEmpty":"No previous entry has been saved in this browser yet.","editor.pasteSuccess":"Previous entry pasted. Review the values before saving."}[key]||key);
    ${sources.join("\n")}
    ${pasteSource}
    return {store:editorStoreLastAnnotation,paste:pasteEditorLastAnnotation,has:editorHasLastAnnotation,storage,state:()=>({values:Object.fromEntries(editorFieldEls.map((field)=>[field.dataset.field,field.value])),photoId:editorCurrentPhotoId,version:editorLoadedVersion,status:editorLoadedStatus,pins:[...editorPinnedFields],pinRefreshes,conditionalRuns,hintRuns,dirty:editorDirty,statusMessage})};
  `)();
}

function loadI18n(language){
  const documentElement={lang:"en",dataset:{},hasAttribute:()=>false,querySelectorAll:()=>[]};
  const document={documentElement,title:"",readyState:"complete",body:{classList:{contains:()=>false}},querySelectorAll:()=>[],getElementById:()=>null,createTreeWalker:()=>({nextNode:()=>null}),addEventListener:()=>{}};
  const context={window:null,document,location:{search:""},navigator:{languages:["en-US"],language:"en-US"},localStorage:{getItem:(key)=>key==="storkAppLanguageV1"?language:null,setItem:()=>{}},URLSearchParams,MutationObserver:class{observe(){}},NodeFilter:{SHOW_TEXT:4},Node:{},console};
  context.window=context;vm.runInNewContext(i18nSource,context,{filename:"app-i18n.js"});return context.StorkAppI18n;
}

test("Paste previous entry is localized and has no database or queue dependency",()=>{
  assert.match(ui,/id="editorCopyPrevious"[^>]*>Paste previous entry<\/button>/);
  assert.match(ui,/editorCopyPreviousBtn\.addEventListener\("click",pasteEditorLastAnnotation\)/);
  assert.doesNotMatch(ui,/previous-annotations\?limit=/);
  const pasteSource=ui.match(/const pasteEditorLastAnnotation=\(\)=>\{[\s\S]*?\n  \};/)?.[0]||"";
  assert.ok(pasteSource,"paste handler must exist");
  assert.doesNotMatch(pasteSource,/apiFetch|editorApiPost/);
  assert.doesNotMatch(pasteSource,/editorPhotoIndex|activeEditorSequence/);
  const en=loadI18n("en"),pl=loadI18n("pl");
  assert.equal(en.t("editor.pastePrevious"),"Paste previous entry");
  assert.equal(pl.t("editor.pastePrevious"),"Wklej poprzedni wpis");
  assert.equal(pl.t("editor.pastePreviousTooltip"),"Wklej ostatni opis zapisany przez Ciebie w tej przeglądarce");
});

test("successful local snapshot from photo A pastes into B without metadata, save, or pins",()=>{
  const editor=lastAnnotationHarness();
  assert.equal(editor.has(),false);
  const photoA={Residence:"yes",Activity_class:"foraging",Fly_ground:"ground",Remarks:"test",photoId:"A",Latitude:51.1,Longitude:17.2,Elevation_m:90,Above_ground:0,Height_class_100m:0,version:4,status:"complete",Analysed:"yes"};
  assert.equal(editor.store(photoA),true);
  const stored=JSON.parse(editor.storage.get("storkLastAnnotationV1:user-7"));
  assert.deepEqual({Residence:stored.values.Residence,Activity_class:stored.values.Activity_class,Fly_ground:stored.values.Fly_ground,Remarks:stored.values.Remarks},{Residence:"yes",Activity_class:"foraging",Fly_ground:"ground",Remarks:"test"});
  for(const key of ["photoId","Latitude","Longitude","Elevation_m","Above_ground","Height_class_100m","version","status","Analysed"])assert.equal(Object.hasOwn(stored.values,key),false,key);
  editor.paste();const state=editor.state();
  assert.equal(state.values.Residence,"yes");assert.equal(state.values.Activity_class,"foraging");assert.equal(state.values.Fly_ground,"ground");assert.equal(state.values.Remarks,"test");
  assert.equal(state.photoId,"B");assert.equal(state.version,9);assert.equal(state.status,"unstarted");
  assert.equal(state.values.Elevation_m,"220");assert.equal(state.values.Above_ground,"120");assert.equal(state.values.Height_class_100m,"100");
  assert.deepEqual(state.pins,[]);assert.ok(state.pinRefreshes>=2);assert.equal(state.conditionalRuns,1);assert.equal(state.hintRuns,1);assert.equal(state.dirty,true);
  assert.equal(state.statusMessage,"Previous entry pasted. Review the values before saving.");
});

test("editable API resolution immediately refreshes copy, save, environment and pin controls",()=>{
  const editor=editorControlHarness();
  editor.setEditable(false);editor.setBusy(false);
  const locked=editor.state();
  assert.equal(locked.copy,true);assert.equal(locked.draft,true);assert.equal(locked.analysed,true);assert.equal(locked.environment,true);assert.equal(locked.field,true);
  editor.setHasLastAnnotation(true);
  editor.setEditable(true);
  const editable=editor.state();
  assert.equal(editable.copy,false,"a local saved-entry buffer enables Paste previous entry regardless of queue index");
  assert.equal(editable.draft,false);assert.equal(editable.analysed,false);assert.equal(editable.environment,false);assert.equal(editable.field,false);
  assert.equal(editable.saveNext,true,"Save & next remains disabled when the current queue has no next photo");
  assert.ok(editable.pinRefreshes>locked.pinRefreshes);assert.equal(editable.conditionalRefreshes,1);
  editor.track.push({photoId:"D"});editor.setEditable(true);
  assert.equal(editor.state().saveNext,false,"Save & next refreshes when a next queue photo exists");
  assert.doesNotMatch(ui.match(/const editorSetBusy = \(busy\) => \{[\s\S]*?\n  \};/)?.[0]||"",/editorSetEditable\(/,"editorSetBusy must not recurse into editorSetEditable");
});

test("local buffer is user-scoped, written only after save succeeds, and excludes current-photo fields",()=>{
  assert.match(ui,/EDITOR_LAST_ANNOTATION_PREFIX="storkLastAnnotationV1:"/);
  assert.match(ui,/authState\.user\?\.id\?`\$\{EDITOR_LAST_ANNOTATION_PREFIX\}\$\{authState\.user\.id\}`:""/);
  assert.match(ui,/EDITOR_LOCAL_BUFFER_EXCLUDED_FIELDS=new Set\(\["FileName","Bird","photoId","Latitude","Longitude","GPS_time","GPS_source","Altitude_m","Elevation_m","Above_ground","Height_class_100m","version","status","Analysed"\]\)/);
  assert.match(ui,/const result = await editorApiPost[\s\S]{0,600}editorStoreLastAnnotation\(values\)/);
  assert.match(ui,/editorPinnedFields\.clear\(\);editorUpdatePinButtons\(\);clearEditorInvalid\(\)/);
  assert.match(ui,/editorApplyConditionalRules\(\);editorElevationEl\.value=currentDerived\.Elevation_m;editorAboveGroundEl\.value=currentDerived\.Above_ground;editorHeightClassEl\.value=currentDerived\.Height_class_100m/);
  assert.match(ui,/updateEditorCompletionHints\(\);editorMarkDirty\(\);editorSetStatus\(editorT\("editor\.pasteSuccess"\),"busy"\)/);
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
  assert.match(ui,/EDITOR_LOCAL_BUFFER_EXCLUDED_FIELDS/);
  assert.doesNotMatch(ui,/editorFeatherPercEl\.value\s*=\s*[^;]*yes/);
});

test("save and next shortcut still reuses the existing button",()=>{
  assert.match(ui,/\(event\.ctrlKey\|\|event\.metaKey\)&&event\.key==="Enter"/);
  assert.match(ui,/editorSaveNextBtn\.click\(\)/);
  assert.match(ui,/editorSaving\|\|editorSaveNextBtn\.disabled\|\|blockingDialog\(\)/);
});
