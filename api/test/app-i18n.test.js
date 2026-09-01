import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { publicAnnotationSchema } from "../src/annotation-schema.js";

const source=fs.readFileSync(new URL("../../app-i18n.js",import.meta.url),"utf8");
const indexSource=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");
const workerSource=fs.readFileSync(new URL("../../sw.js",import.meta.url),"utf8");

function loadI18n({stored=null,languages=["en-US"],search=""}={}){
  const storage=new Map(stored?[['storkAppLanguageV1',stored]]:[]),languageButtons=[];
  const documentElement={lang:"en",dataset:{},hasAttribute:()=>false,querySelectorAll:()=>[]};
  const document={documentElement,title:"",readyState:"complete",body:{classList:{contains:()=>false}},querySelectorAll:()=>languageButtons,getElementById:()=>null,createTreeWalker:()=>({nextNode:()=>null}),addEventListener:()=>{}};
  const context={window:null,document,location:{search},navigator:{languages,language:languages[0]},localStorage:{getItem:(key)=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},URLSearchParams,MutationObserver:class{observe(){}},NodeFilter:{SHOW_TEXT:4},Node:{},console};
  context.window=context;vm.runInNewContext(source,context,{filename:"app-i18n.js"});
  return {i18n:context.StorkAppI18n,document,storage};
}

test("main application language detection and persistence are independent",()=>{
  const polish=loadI18n({languages:["de-DE","pl-PL"]});
  assert.equal(polish.i18n.language,"pl");
  assert.equal(polish.document.documentElement.lang,"pl");
  assert.equal(polish.document.title,"Bocian biały – zdjęcia i trasa lotu");
  assert.equal(polish.i18n.translateText("Log in"),"Zaloguj się");
  assert.equal(polish.i18n.translateText("Photo editor"),"Arkusz opisu zdjęcia");
  polish.i18n.setLanguage("en");
  assert.equal(polish.storage.get("storkAppLanguageV1"),"en");
  assert.equal(polish.document.title,"White Stork Photo Flight Viewer");
  assert.equal(loadI18n({stored:"pl",languages:["en-US"]}).i18n.language,"pl");
  for(const language of ["en-US","de-DE","fr-FR"])assert.equal(loadI18n({languages:[language]}).i18n.language,"en");
});

test("all annotation fields and current options have Polish presentation without changing values",()=>{
  const {i18n}=loadI18n({stored:"pl"}),schema=publicAnnotationSchema();
  assert.equal(Object.keys(i18n.fieldGuidancePl).length,schema.fields.length);
  for(const field of schema.fields){
    const localized=i18n.localizeField(field);
    assert.ok(localized.label,`${field.key} label`);
    assert.ok(localized.plainDefinition,`${field.key} definition`);
    assert.ok(localized.howToRecord,`${field.key} recording guidance`);
    assert.equal(localized.key,field.key);
    for(const value of field.options||[]){assert.ok(i18n.optionLabels.pl[value],`${field.key}.${value} label`);assert.equal(field.options.includes(value),true);}
  }
  assert.match(i18n.localizeField(schema.fields.find((field)=>field.key==="Env_desc_en")).howToRecord,/po angielsku/);
  assert.match(i18n.localizeField(schema.fields.find((field)=>field.key==="Water_presence_class")).important,/Nie oznacza to/);
  assert.equal(i18n.optionLabels.en.S_migration,"Spring migration");
  assert.equal(i18n.optionLabels.pl.S_migration,"Migracja wiosenna");
  assert.equal(i18n.optionLabels.pl.fledging,"Okres gniazdowy i pierwszych lotów");
  assert.equal(i18n.optionLabels.en.arable_unspecified,"Arable field — general");
  assert.equal(i18n.optionLabels.pl.arable_unspecified,"Pole uprawne — ogólnie");
  assert.match(i18n.localizeField(schema.fields.find((field)=>field.key==="Pheno_period")).optionHelp.S_migration,/obszaru zimowania/);
  assert.doesNotMatch(source,/control\.value\s*=/,"localization must not overwrite unsaved form values");
});

test("the protected public Survey keeps its existing language subsystem",()=>{
  assert.match(indexSource,/const surveyText=\(pl,en\)=>surveyPublicState\.language==="pl"\?pl:en/);
  assert.match(indexSource,/localStorage\.getItem\("storkSurveyLanguageV1"\)/);
  assert.match(indexSource,/\[data-survey-lang\]/);
  assert.match(indexSource,/data-app-lang="pl"/);
  assert.match(indexSource,/appI18n\?\.onChange\(async\(\)=>/);
  assert.match(indexSource,/helpWorkspaceMode==="onboarding"\)renderOnboardingStep\(\)/);
  assert.doesNotMatch(source,/storkSurveyLanguageV1|surveyPublicState\.language|const surveyText/);
  const survey=loadI18n({stored:"pl",search:"?survey=token"});
  assert.equal(survey.i18n.isPublicSurvey,true);
  assert.match(workerSource,/stork-edit2-shell-v2026-09-01-41/);
  assert.match(workerSource,/\.\/app-i18n\.js/);
});
