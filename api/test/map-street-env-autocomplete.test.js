import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");
const i18n=fs.readFileSync(new URL("../../app-i18n.js",import.meta.url),"utf8");

test("Google map shortcut offers Street View and satellite for valid current-photo coordinates",()=>{
  assert.match(ui,/id="mapControlDock"[\s\S]*?id="mapBasemapToggle"[\s\S]*?id="mapStreetView"[\s\S]*?id="mapSettingsToggle"[\s\S]*?id="mapGoogleMenu"/);
  assert.match(ui,/Number\.isFinite\(lat\)&&lat>=-90&&lat<=90&&Number\.isFinite\(lon\)&&lon>=-180&&lon<=180/);
  assert.match(ui,/mapStreetViewBtn\.hidden=!coordinates;mapStreetViewBtn\.disabled=!coordinates/);
  assert.match(ui,/mapGoogleStreetViewBtn\.addEventListener\("click",\(\)=>openGoogleMapForPhoto\("streetView"\)\)/);
  assert.match(ui,/mapGoogleSatelliteBtn\.addEventListener\("click",\(\)=>openGoogleMapForPhoto\("satellite"\)\)/);
  assert.match(ui,/new URL\("https:\/\/www\.google\.com\/maps\/@"\)/);
  assert.match(ui,/url\.searchParams\.set\("api","1"\)/);
  assert.match(ui,/url\.searchParams\.set\("map_action","pano"\)/);
  assert.match(ui,/url\.searchParams\.set\("viewpoint",`\$\{coordinates\.lat\},\$\{coordinates\.lon\}`\)/);
  assert.match(ui,/url\.searchParams\.set\("map_action","map"\)/);
  assert.match(ui,/url\.searchParams\.set\("center",`\$\{coordinates\.lat\},\$\{coordinates\.lon\}`\)/);
  assert.match(ui,/url\.searchParams\.set\("basemap","satellite"\)/);
  assert.match(ui,/window\.open\(url\.toString\(\),"_blank","noopener,noreferrer"\)/);
  assert.match(ui,/if\(!mapControlDockEl\.contains\(event\.target\)\)closeMapControlPanels\(\)/);
  assert.match(ui,/event\.key==="Escape"\)closeMapControlPanels\(\)/);
  assert.match(i18n,/"map\.streetView":"Street View"/);
  assert.match(i18n,/"map\.satellite":"Mapa satelitarna"/);
});

test("field guide and onboarding explain map context without weakening frame-specific guidance",()=>{
  assert.match(ui,/mapContext\.textContent=appT\("help\.googleContext"\)/);
  assert.match(ui,/title:"How to analyse photographs"/);
  assert.match(ui,/preceding and subsequent telemetry locations/);
  assert.match(ui,/this information may be recorded in Remarks/);
  assert.match(i18n,/"help\.googleContext":"Widok Street View lub zdjęcia satelitarne/);
  assert.match(i18n,/"warning\.photo":"Opis na podstawie zdjęcia/);
});

test("environment description remains unrestricted text with a custom accessible combobox",()=>{
  assert.match(ui,/<input id="editorEnvDesc" data-field="Env_desc_en" type="text" autocomplete="off" role="combobox" aria-autocomplete="list"/);
  assert.doesNotMatch(ui,/id="editorEnvDescOptions"/);
  assert.doesNotMatch(ui,/list="editorEnvDescOptions"/);
  assert.match(ui,/const EDITOR_ENV_SUGGESTIONS=\["field","landfill","landfill slope"/);
  assert.match(ui,/EDITOR_ENV_SUGGESTIONS\.filter\(\(value\)=>!query\|\|value\.toLocaleLowerCase\(\)\.includes\(query\)\)/);
  assert.match(ui,/editorEnvToggleBtn\.addEventListener\("click"[\s\S]*?renderEditorEnvAutocomplete\(\{showAll:true\}\)/);
  assert.match(ui,/editorEnvDescEl\.addEventListener\("keydown"[\s\S]*?"ArrowDown","ArrowUp","Enter"/);
  assert.match(ui,/event\.key==="Escape"[\s\S]*?closeEditorEnvAutocomplete\(\)/);
  assert.match(ui,/chooseEditorEnvSuggestion=\(value\)=>\{editorEnvDescEl\.value=value/);
  assert.match(i18n,/"editor\.environmentSuggestions":"Pokaż podpowiedzi opisu środowiska"/);
});
