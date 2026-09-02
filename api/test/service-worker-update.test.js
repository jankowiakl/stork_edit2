import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../../sw.js",import.meta.url),"utf8");
const indexSource=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");

const loadWorker=()=>{
  const handlers={},deleted=[],precache=[];
  let claimed=0,skipped=0;
  const cachedResponses=new Map();
  const cache={addAll:async(requests)=>precache.push(requests),match:async(key)=>cachedResponses.get(String(key?.url||key))};
  const self={
    registration:{scope:"https://example.test/stork_edit2/"},
    location:{origin:"https://example.test"},
    clients:{claim:async()=>{claimed++;}},
    skipWaiting:async()=>{skipped++;},
    addEventListener:(type,handler)=>{handlers[type]=handler;}
  };
  const caches={open:async()=>cache,keys:async()=>["stork-edit2-shell-v-old","stork-edit2-shell-v2026-09-02-57","unrelated-user-cache"],delete:async(key)=>{deleted.push(key);return true;}};
  vm.runInNewContext(source,{self,caches,Request,Response,URL,Set,fetch:async()=>new Response("network"),console},{filename:"sw.js"});
  return {handlers,deleted,precache,cachedResponses,counts:()=>({claimed,skipped})};
};

test("worker installs the explicit shell, removes old app caches and claims clients",async()=>{
  const worker=loadWorker();
  let pending;
  worker.handlers.install({waitUntil:(promise)=>{pending=promise;}});
  await pending;
  assert.ok(worker.precache[0].length>5);
  assert.ok(worker.precache[0].every((request)=>request.cache==="reload"));
  assert.ok(worker.precache[0].every((request)=>!request.url.endsWith("/")&&!request.url.includes("index.html")));
  assert.equal(worker.counts().skipped,1);

  worker.handlers.activate({waitUntil:(promise)=>{pending=promise;}});
  await pending;
  assert.deepEqual(worker.deleted,["stork-edit2-shell-v-old"]);
  assert.equal(worker.counts().claimed,1);
  assert.doesNotMatch(source,/client\.navigate|clients\.matchAll|postMessage\(\{type:"SW_ACTIVATED"/);
});

test("navigation and API requests are never intercepted",()=>{
  const worker=loadWorker();
  let navigationResponses=0,apiResponded=false;
  for(const url of ["https://example.test/stork_edit2/","https://example.test/stork_edit2/?survey=token","https://example.test/stork_edit2/?photo_safe=token"]){
    const navigationRequest=new Request(url);
    Object.defineProperty(navigationRequest,"mode",{value:"navigate"});
    worker.handlers.fetch({request:navigationRequest,respondWith:()=>{navigationResponses++;}});
  }
  worker.handlers.fetch({request:new Request("https://example.test/stork_edit2/api/me"),respondWith:()=>{apiResponded=true;}});
  assert.equal(navigationResponses,0);
  assert.equal(apiResponded,false);
});

test("versioned APP_SHELL resources retain cache-first behaviour",async()=>{
  const worker=loadWorker();
  const shellRequest=new Request("https://example.test/stork_edit2/app-i18n.js?v=2026-09-02-57");
  worker.cachedResponses.set(shellRequest.url,new Response("cached i18n"));
  let pending;
  worker.handlers.fetch({request:shellRequest,respondWith:(promise)=>{pending=promise;}});
  assert.equal(await (await pending).text(),"cached i18n");
});

test("HTML references the same build version and registration has no reload lifecycle",()=>{
  for(const asset of ["app-i18n.js","config.js","viewer-interactions.js","vendor/qrcode.min.js","vendor/jspdf.umd.min.js","manifest.webmanifest"]){
    assert.match(indexSource,new RegExp(`${asset.replaceAll(".","\\.")}\\?v=2026-09-02-57`));
  }
  assert.match(indexSource,/serviceWorker\.register\("\.\/sw\.js",\{updateViaCache:"none"\}\)/);
  assert.doesNotMatch(indexSource,/controllerchange|ciconiaSwReloadedVersion|CiconiaServiceWorker/);
  assert.doesNotMatch(source,/OFFLINE_DOCUMENT_URL|event\.respondWith\([^\n]*event\.request\.mode==="navigate"/);
});
