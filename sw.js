const CACHE_PREFIX="stork-edit2-";
const BUILD_VERSION="2026-09-02-55";
const CACHE_NAME=`stork-edit2-shell-v${BUILD_VERSION}`;
const APP_SHELL=[`./sw-registration.js?v=${BUILD_VERSION}`,`./app-i18n.js?v=${BUILD_VERSION}`,`./config.js?v=${BUILD_VERSION}`,`./viewer-interactions.js?v=${BUILD_VERSION}`,`./vendor/qrcode.min.js?v=${BUILD_VERSION}`,`./vendor/jspdf.umd.min.js?v=${BUILD_VERSION}`,`./manifest.webmanifest?v=${BUILD_VERSION}`,"./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-192.png","./icons/icon-maskable-512.png","./icons/apple-touch-icon.png"];
const shellUrl=(path)=>new URL(path,self.registration.scope).href;
const OFFLINE_DOCUMENT_URL=shellUrl("./index.html");
const APP_SHELL_URLS=new Set(APP_SHELL.map(shellUrl));
let activationReplacedOldCache=false;

self.addEventListener("install",(event)=>{
  console.info("[Ciconia lifecycle] SW INSTALLING",CACHE_NAME);
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map((path)=>new Request(shellUrl(path),{cache:"reload"})));
    const offlineDocument=await fetch(new Request(OFFLINE_DOCUMENT_URL,{cache:"reload"}));
    if(!offlineDocument.ok)throw new Error(`Could not cache offline document: ${offlineDocument.status}`);
    await cache.put(OFFLINE_DOCUMENT_URL,offlineDocument);
    await self.skipWaiting();
    console.info("[Ciconia lifecycle] SW INSTALLED",CACHE_NAME);
  })());
});

self.addEventListener("activate",(event)=>{
  event.waitUntil((async()=>{
    console.info("[Ciconia lifecycle] SW ACTIVATING",CACHE_NAME);
    const keys=await caches.keys(),staleKeys=keys.filter((key)=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME);
    await Promise.all(staleKeys.map((key)=>caches.delete(key)));
    activationReplacedOldCache=staleKeys.length>0;
    await self.clients.claim();
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of windows)client.postMessage({type:"SW_ACTIVATED",version:CACHE_NAME,updated:activationReplacedOldCache});
    console.info("[Ciconia lifecycle] SW ACTIVATED",CACHE_NAME);
  })());
});

self.addEventListener("message",(event)=>{
  if(event.data?.type==="SKIP_WAITING")event.waitUntil(self.skipWaiting());
  if(event.data?.type==="GET_VERSION")event.source?.postMessage({type:"SW_VERSION",version:CACHE_NAME,updated:activationReplacedOldCache});
});

self.addEventListener("fetch",(event)=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET"||url.origin!==self.location.origin||url.pathname.includes("/api/")||url.pathname.endsWith("/sw.js"))return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(new Request(event.request,{cache:"no-store"})).catch(()=>caches.open(CACHE_NAME).then((cache)=>cache.match(OFFLINE_DOCUMENT_URL)).then((cached)=>cached||Response.error())));
    return;
  }
  if(!APP_SHELL_URLS.has(url.href))return;
  event.respondWith(caches.open(CACHE_NAME).then(async(cache)=>{
    const cached=await cache.match(event.request);
    return cached||fetch(new Request(event.request,{cache:"reload"}));
  }));
});
