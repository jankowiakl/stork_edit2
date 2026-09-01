import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const indexSource=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");
const i18nSource=fs.readFileSync(new URL("../../app-i18n.js",import.meta.url),"utf8");

function loadI18n(language){
  const documentElement={lang:"en",dataset:{},hasAttribute:()=>false,querySelectorAll:()=>[]};
  const document={documentElement,title:"",readyState:"complete",body:{classList:{contains:()=>false}},querySelectorAll:()=>[],getElementById:()=>null,createTreeWalker:()=>({nextNode:()=>null}),addEventListener:()=>{}};
  const context={window:null,document,location:{search:""},navigator:{languages:["en-US"],language:"en-US"},localStorage:{getItem:(key)=>key==="storkAppLanguageV1"?language:null,setItem:()=>{}},URLSearchParams,MutationObserver:class{observe(){}},NodeFilter:{SHOW_TEXT:4},Node:{},console};
  context.window=context;vm.runInNewContext(i18nSource,context,{filename:"app-i18n.js"});return context.StorkAppI18n;
}

test("interface coach has thirteen bilingual role-safe steps",()=>{
  const en=loadI18n("en"),pl=loadI18n("pl");
  for(let index=1;index<=13;index++){
    assert.notEqual(en.t(`coach.${index}`),`coach.${index}`);
    assert.notEqual(pl.t(`coach.${index}`),`coach.${index}`);
    assert.notEqual(en.t(`coach.${index}`),pl.t(`coach.${index}`));
  }
  assert.match(indexSource,/const interfaceCoachSteps=\[/);
  assert.equal((indexSource.match(/\{key:"coach\.\d+"/g)||[]).length,13);
  assert.match(indexSource,/if\(step\.final\|\|\(ready!==false&&targets\.length\)\)/);
  assert.match(indexSource,/interfaceCoachIndex\+=direction>=0\?1:-1/);
});

test("coach follows onboarding, supports replay, skip and live app-language rerender",()=>{
  assert.match(indexSource,/INTERFACE_COACH_STORAGE_PREFIX = "storkInterfaceCoachV1:"/);
  assert.match(indexSource,/localStorage\.setItem\(key,"complete"\)/);
  assert.match(indexSource,/id="showInterfaceTutorialAgain"/);
  assert.match(indexSource,/showInterfaceTutorialAgain"\)\.addEventListener\("click",\(\)=>void startInterfaceCoach\(\{force:true\}\)\)/);
  assert.match(indexSource,/closeHelpWorkspace\(\);void startInterfaceCoach\(\);/);
  assert.match(indexSource,/if\(completed\)\{void startInterfaceCoach\(\);return;\}void openOnboarding\(\);/);
  assert.match(indexSource,/if\(interfaceCoachActive\)await renderInterfaceCoachStep\(\{direction:1,scroll:false\}\)/);
  assert.match(indexSource,/interfaceCoachSkipBtn\.addEventListener\("click",\(\)=>void completeInterfaceCoach\(\{markComplete:true\}\)\)/);
  assert.match(indexSource,/appI18n\?\.isPublicSurvey/);
});

test("first final Finish keeps the editor open and persists the 20/35/45 layout only once",()=>{
  assert.match(indexSource,/firstFinalFinish=markComplete&&finishedFinal&&interfaceCoachSteps\[interfaceCoachIndex\]\?\.final&&!snapshot\?\.previouslyComplete/);
  assert.match(indexSource,/if\(!firstFinalFinish&&snapshot\?\.openedEditor/);
  assert.match(indexSource,/if\(firstFinalFinish\)\{editorPaneRatios=\[0\.20,0\.35,0\.45\];if\(!document\.body\.classList\.contains\("editorOpen"\)\)await openEditorMode\(\)/);
  assert.match(indexSource,/if\(firstFinalFinish\)\{editorPaneRatios=\[0\.20,0\.35,0\.45\]/);
  assert.match(indexSource,/setEditorTab\("form"\);applyEditorPaneRatios\(\{persist:true\}\)/);
  assert.match(indexSource,/completeInterfaceCoach\(\{markComplete:true,finishedFinal:true\}\)/);
  assert.match(indexSource,/openedEditor:false,previouslyComplete/);
});

test("editor coach resize note is bilingual and desktop-only",()=>{
  const en=loadI18n("en"),pl=loadI18n("pl");
  assert.match(en.t("coach.editorResize"),/dragging the vertical separators/);
  assert.match(pl.t("coach.editorResize"),/przeciągając pionowe separatory/);
  assert.match(indexSource,/desktopNoteKey:"coach\.editorResize"/);
  assert.match(indexSource,/if\(step\.desktopNoteKey&&!isMobile\(\)\)coachText\.push/);
});

test("coach targets the real responsive interface and preserves dirty editor state",()=>{
  for(const target of ["appNavHandleEl","appNavDrawerEl","mapStackEl","mapBasemapToggleBtn","mapSettingsToggleBtn","photoStageEl","editorPanelEl","openFieldGuideBtn","editorSaveDraftBtn","musicToggleBtn"])assert.match(indexSource,new RegExp(`targets:\\(\\)=>\\[[^\\]]*${target}`));
  assert.match(indexSource,/if\(!interfaceCoachSnapshot\?\.openedEditor\|\|editorDirty\)return false/);
  assert.match(indexSource,/snapshot\?\.openedEditor&&document\.body\.classList\.contains\("editorOpen"\)&&!editorDirty/);
  assert.match(indexSource,/@media \(max-width:700px\)\s*\{\s*\.interfaceCoachCard/);
  assert.match(indexSource,/window\.visualViewport\?\.addEventListener\("resize",scheduleInterfaceCoachPosition\)/);
});

test("final coach card remains reachable inside a narrow mobile viewport",()=>{
  assert.match(indexSource,/\.interfaceCoachFinal \{ display:grid; place-items:center;[\s\S]*?overflow:auto;/);
  assert.match(indexSource,/\.interfaceCoachFinal \.interfaceCoachCard \{[\s\S]*?max-height:100%;[\s\S]*?transform:none!important;/);
  assert.match(indexSource,/\.interfaceCoachFinal \.interfaceCoachActions \{ position:sticky; bottom:0;/);
  assert.match(indexSource,/if\(step\.final\)\{[\s\S]*?style\.removeProperty\("top"\)[\s\S]*?scrollTop=0/);
});
