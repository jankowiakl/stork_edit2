import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../../sw.js",import.meta.url),"utf8");
const indexSource=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");

const loadWorker=({networkFetch=async()=>new Response("network",{status:200})}={})=>{
  const handlers={},deleted=[],precache=[],cachePuts=[],clientMessages=[];
  let claimed=0,skipped=0;
  const cachedResponses=new Map();
  const cache={
    addAll:async(requests)=>precache.push(requests),
    put:async(key,response)=>{cachePuts.push(String(key?.url||key));cachedResponses.set(String(key?.url||key),response.clone());},
    match:async(key)=>cachedResponses.get(String(key?.url||key))
  };
  const self={
    registration:{scope:"https://example.test/stork_edit2/"},
    location:{origin:"https://example.test"},
    clients:{claim:async()=>{claimed++;},matchAll:async()=>[{postMessage:(message)=>clientMessages.push(message)}]},
    skipWaiting:async()=>{skipped++;},
    addEventListener:(type,handler)=>{handlers[type]=handler;}
  };
  const caches={
    open:async()=>cache,
    keys:async()=>["stork-edit2-shell-v-old","stork-edit2-shell-v2026-09-02-55","unrelated-user-cache"],
    delete:async(key)=>{deleted.push(key);return true;}
  };
  vm.runInNewContext(source,{self,caches,Request,Response,URL,Set,fetch:networkFetch,console},{filename:"sw.js"});
  return {handlers,deleted,precache,cachePuts,clientMessages,cachedResponses,counts:()=>({claimed,skipped})};
};

test("worker installs one coherent shell and activates without navigating clients",async()=>{
  const worker=loadWorker();
  let pending;
  worker.handlers.install({waitUntil:(promise)=>{pending=promise;}});
  await pending;
  assert.ok(worker.precache[0].length>5);
  assert.ok(worker.precache[0].every((request)=>request.cache==="reload"));
  assert.deepEqual(worker.cachePuts,["https://example.test/stork_edit2/index.html"]);
  assert.equal(worker.counts().skipped,1);

  worker.handlers.activate({waitUntil:(promise)=>{pending=promise;}});
  await pending;
  assert.deepEqual(worker.deleted,["stork-edit2-shell-v-old"]);
  assert.equal(worker.counts().claimed,1);
  assert.equal(worker.clientMessages.length,1);
  assert.equal(worker.clientMessages[0].type,"SW_ACTIVATED");
  assert.equal(worker.clientMessages[0].version,"stork-edit2-shell-v2026-09-02-55");
  assert.equal(worker.clientMessages[0].updated,true);
  assert.doesNotMatch(source,/client\.navigate|\.navigate\(client\.url\)/);
});

test("document navigation is network-first and cached HTML is offline fallback only",async()=>{
  let online=true,fetches=0;
  const worker=loadWorker({networkFetch:async()=>{fetches++;if(!online)throw new Error("offline");return new Response("fresh html",{status:200,headers:{"content-type":"text/html"}});}});
  let pending;
  worker.handlers.install({waitUntil:(promise)=>{pending=promise;}});
  await pending;
  const putsAfterInstall=worker.cachePuts.length;

  const navigationRequest=new Request("https://example.test/stork_edit2/index.html");
  Object.defineProperty(navigationRequest,"mode",{value:"navigate"});
  worker.handlers.fetch({request:navigationRequest,respondWith:(promise)=>{pending=promise;}});
  const onlineResponse=await pending;
  assert.equal(await onlineResponse.text(),"fresh html");
  assert.equal(worker.cachePuts.length,putsAfterInstall,"online navigation must not rewrite the offline document");

  online=false;
  worker.handlers.fetch({request:navigationRequest,respondWith:(promise)=>{pending=promise;}});
  const offlineResponse=await pending;
  assert.equal(await offlineResponse.text(),"fresh html");
  assert.equal(fetches,3,"one install fetch and two navigation attempts");
});

test("non-shell resources are not intercepted and versioned shell resources are cache-first",async()=>{
  const worker=loadWorker();
  let responded=false;
  const unrelated=new Request("https://example.test/stork_edit2/user-file.txt");
  worker.handlers.fetch({request:unrelated,respondWith:()=>{responded=true;}});
  assert.equal(responded,false);

  let pending;
  worker.handlers.install({waitUntil:(promise)=>{pending=promise;}});
  await pending;
  const shellRequest=new Request("https://example.test/stork_edit2/app-i18n.js?v=2026-09-02-55");
  worker.cachedResponses.set(shellRequest.url,new Response("cached i18n"));
  worker.handlers.fetch({request:shellRequest,respondWith:(promise)=>{pending=promise;}});
  assert.equal(await (await pending).text(),"cached i18n");
});

test("HTML and the atomic shell use the same build version without precaching normal navigation",()=>{
  for(const asset of ["sw-registration.js","app-i18n.js","config.js","viewer-interactions.js","vendor/qrcode.min.js","vendor/jspdf.umd.min.js","manifest.webmanifest"]){
    assert.match(indexSource,new RegExp(`${asset.replaceAll(".","\\.")}\\?v=2026-09-02-55`));
  }
  assert.doesNotMatch(source,/const APP_SHELL=\["\.\/","\.\/index\.html"/);
  assert.match(source,/const OFFLINE_DOCUMENT_URL=shellUrl\("\.\/index\.html"\)/);
  assert.doesNotMatch(source,/event\.request\.mode==="navigate"[\s\S]{0,400}cache\.put/);
});
