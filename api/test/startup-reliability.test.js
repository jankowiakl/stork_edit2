import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");

test("restored authentication startup does not open onboarding or interface coach",()=>{
  const startup=source.match(/\/\/ Automatically load the lightweight individual list on page load\.[\s\S]*?const handleBirdSelectionChange/)?.[0]||"";
  assert.match(startup,/if \(authState\.token\)[\s\S]*?apiFetch\("\/api\/me"\)/);
  assert.doesNotMatch(startup,/maybeShowOnboarding|openOnboarding|startInterfaceCoach/);
});

test("explicit login and first required password change may trigger onboarding",()=>{
  const loginFlow=source.match(/testEditorConnectionBtn\.addEventListener\("click"[\s\S]*?editorLogoutBtn\.addEventListener/)?.[0]||"";
  const passwordFlow=source.match(/changeEditorPasswordBtn\.addEventListener\("click"[\s\S]*?recoverAdminAccessBtn\.addEventListener/)?.[0]||"";
  assert.match(loginFlow,/setTimeout\(maybeShowOnboarding,250\)/);
  assert.match(passwordFlow,/setTimeout\(maybeShowOnboarding,250\)/);
});

test("manual Introduction and interface tutorial replay remain available",()=>{
  assert.match(source,/runIntroductionAgain"\)\.addEventListener\("click",\(\)=>openOnboarding\(\{force:true\}\)\)/);
  assert.match(source,/showInterfaceTutorialAgain"\)\.addEventListener\("click",\(\)=>void startInterfaceCoach\(\{force:true\}\)\)/);
  assert.match(source,/helpButton\("Close for now","secondary",closeHelpWorkspace\)/);
});
