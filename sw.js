const CACHE_PREFIX="stork-edit2-";
const CACHE_NAME="stork-edit2-shell-v2026-09-02-54";
const APP_SHELL=["./","./index.html","./app-i18n.js","./config.js","./viewer-interactions.js","./vendor/qrcode.min.js","./vendor/jspdf.umd.min.js","./manifest.webmanifest","./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-192.png","./icons/icon-maskable-512.png","./icons/apple-touch-icon.png"];
const shellUrl=(path)=>new URL(path,self.registration.scope).href;

self.addEventListener("install",(event)=>{
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache)=>cache.addAll(APP_SHELL.map((path)=>new Request(shellUrl(path),{cache:"reload"})))),
    self.skipWaiting()
  ]));
});

self.addEventListener("activate",(event)=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys(),staleKeys=keys.filter((key)=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME);
    await Promise.all(staleKeys.map((key)=>caches.delete(key)));
    await self.clients.claim();
    if(staleKeys.length){
      const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
      await Promise.all(windows.map((client)=>client.navigate(client.url).catch(()=>undefined)));
    }
  })());
});

self.addEventListener("message",(event)=>{
  if(event.data?.type==="SKIP_WAITING")event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch",(event)=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET"||url.origin!==self.location.origin||url.pathname.includes("/api/")||url.pathname.endsWith("/sw.js"))return;
  const networkRequest=new Request(event.request,{cache:"no-store"});
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(networkRequest).then((response)=>{
      if(response?.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.put(shellUrl("./index.html"),copy)).catch(()=>undefined));}
      return response;
    }).catch(()=>caches.match(shellUrl("./index.html")).then((cached)=>cached||Response.error())));
    return;
  }
  event.respondWith(fetch(networkRequest).then((response)=>{
    if(response?.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.put(event.request,copy)).catch(()=>undefined));}
    return response;
  }).catch(()=>caches.match(event.request).then((cached)=>cached||Response.error())));
});
