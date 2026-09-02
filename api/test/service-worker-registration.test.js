import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../../sw-registration.js",import.meta.url),"utf8");

const eventTarget=()=>{
  const handlers=new Map();
  return {handlers,addEventListener:(type,handler)=>{const list=handlers.get(type)||[];list.push(handler);handlers.set(type,list);},dispatch:async(type,event={})=>{for(const handler of handlers.get(type)||[])await handler(event);}};
};

const loadRegistration=({controlled=true}={})=>{
  const windowTarget=eventTarget(),serviceWorker=eventTarget(),registration=eventTarget(),logs=[],storage=new Map();
  let reloads=0,registerCalls=0,updateCalls=0;
  const controller={messages:[],postMessage(message){this.messages.push(message);}};
  registration.installing=null;registration.waiting=null;registration.update=async()=>{updateCalls++;};
  serviceWorker.controller=controlled?controller:null;
  serviceWorker.register=async(url,options)=>{registerCalls++;registration.registerArgs={url,options};return registration;};
  const window={...windowTarget,location:{reload:()=>{reloads++;}}};
  const sessionStorage={getItem:(key)=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))};
  const context={window,navigator:{serviceWorker},sessionStorage,WeakMap,console:{info:(...args)=>logs.push(args),warn:(...args)=>logs.push(args)}};
  vm.runInNewContext(source,context,{filename:"sw-registration.js"});
  return {window,serviceWorker,registration,controller,storage,logs,counts:()=>({reloads,registerCalls,updateCalls})};
};

test("ordinary window load registers once without forcing registration.update or navigation",async()=>{
  const page=loadRegistration();
  page.window.CiconiaServiceWorker.start();
  await page.window.dispatch("load");
  assert.equal(page.registration.registerArgs.url,"./sw.js");
  assert.equal(page.registration.registerArgs.options.updateViaCache,"none");
  assert.deepEqual(page.counts(),{reloads:0,registerCalls:1,updateCalls:0});
  assert.ok(page.logs.some(([message])=>message.includes("WINDOW LOAD")));
  assert.ok(page.logs.some(([message])=>message.includes("SW REGISTERED")));
});

test("a real worker version change reloads at most once per session version",async()=>{
  const page=loadRegistration({controlled:true});
  page.window.CiconiaServiceWorker.start();
  await page.window.dispatch("load");
  await page.serviceWorker.dispatch("controllerchange");
  assert.equal(page.controller.messages.length,1);
  assert.equal(page.controller.messages[0].type,"GET_VERSION");
  const update={data:{type:"SW_VERSION",version:"stork-edit2-shell-v2026-09-02-55",updated:true}};
  await page.serviceWorker.dispatch("message",update);
  await page.serviceWorker.dispatch("message",update);
  assert.equal(page.counts().reloads,1);
  assert.equal(page.storage.get("ciconiaSwReloadedVersionV1"),"stork-edit2-shell-v2026-09-02-55");
});

test("first installation claims control without reloading the first page",async()=>{
  const page=loadRegistration({controlled:false});
  page.window.CiconiaServiceWorker.start();
  await page.window.dispatch("load");
  page.serviceWorker.controller=page.controller;
  await page.serviceWorker.dispatch("controllerchange");
  await page.serviceWorker.dispatch("message",{data:{type:"SW_ACTIVATED",version:"stork-edit2-shell-v2026-09-02-55",updated:false}});
  assert.equal(page.counts().reloads,0);
});
