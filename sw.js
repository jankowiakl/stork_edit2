const CACHE_NAME="stork-edit2-shell-v2026-09-01-50";
const APP_SHELL=["./","./index.html","./app-i18n.js","./config.js","./viewer-interactions.js","./vendor/qrcode.min.js","./vendor/jspdf.umd.min.js","./manifest.webmanifest","./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-192.png","./icons/icon-maskable-512.png","./icons/apple-touch-icon.png"];

self.addEventListener("install",(event)=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.addAll(APP_SHELL)));
});

self.addEventListener("activate",(event)=>{
  event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key.startsWith("stork-edit2-")&&key!==CACHE_NAME).map((key)=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener("message",(event)=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting();});

self.addEventListener("fetch",(event)=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET"||url.origin!==self.location.origin||url.pathname.includes("/api/")){return;}
  event.respondWith(fetch(event.request).then((response)=>{
    if(response?.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.put(event.request,copy)).catch(()=>undefined));}
    return response;
  }).catch(()=>caches.match(event.request).then((cached)=>cached||(event.request.mode==="navigate"?caches.match("./index.html"):Response.error()))));
});
