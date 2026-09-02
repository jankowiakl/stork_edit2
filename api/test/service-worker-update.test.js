import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../../sw.js",import.meta.url),"utf8");

test("updated worker precaches fresh files, removes only old app caches and claims clients",async()=>{
  const handlers={},deleted=[],precache=[];
  let claimed=0,skipped=0,navigated=0;
  const self={
    registration:{scope:"https://example.test/stork_edit2/"},
    location:{origin:"https://example.test"},
    clients:{claim:async()=>{claimed++;},matchAll:async()=>[{url:"https://example.test/stork_edit2/",navigate:async()=>{navigated++;}}]},
    skipWaiting:async()=>{skipped++;},
    addEventListener:(type,handler)=>{handlers[type]=handler;}
  };
  const caches={
    open:async(name)=>({addAll:async(requests)=>precache.push({name,requests}),put:async()=>{}}),
    keys:async()=>["stork-edit2-shell-v-old","stork-edit2-shell-v2026-09-02-54","unrelated-user-cache"],
    delete:async(key)=>{deleted.push(key);return true;},
    match:async()=>undefined
  };
  vm.runInNewContext(source,{self,caches,Request,Response,URL,fetch:async()=>new Response("ok"),console},{filename:"sw.js"});

  let pending;
  handlers.install({waitUntil:(promise)=>{pending=promise;}});
  await pending;
  assert.equal(precache[0].name,"stork-edit2-shell-v2026-09-02-54");
  assert.ok(precache[0].requests.length>5);
  assert.ok(precache[0].requests.every((request)=>request.cache==="reload"));
  assert.equal(skipped,1);

  handlers.activate({waitUntil:(promise)=>{pending=promise;}});
  await pending;
  assert.deepEqual(deleted,["stork-edit2-shell-v-old"]);
  assert.equal(claimed,1);
  assert.equal(navigated,1);
});
