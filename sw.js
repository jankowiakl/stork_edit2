const CACHE_PREFIX="stork-edit2-";
const BUILD_VERSION="2026-09-02-57";
const CACHE_NAME=`stork-edit2-shell-v${BUILD_VERSION}`;
const APP_SHELL=[`./app-i18n.js?v=${BUILD_VERSION}`,`./config.js?v=${BUILD_VERSION}`,`./viewer-interactions.js?v=${BUILD_VERSION}`,`./vendor/qrcode.min.js?v=${BUILD_VERSION}`,`./vendor/jspdf.umd.min.js?v=${BUILD_VERSION}`,`./manifest.webmanifest?v=${BUILD_VERSION}`,"./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-192.png","./icons/icon-maskable-512.png","./icons/apple-touch-icon.png"];
const shellUrl=(path)=>new URL(path,self.registration.scope).href;
const APP_SHELL_URLS=new Set(APP_SHELL.map(shellUrl));

self.addEventListener("install",(event)=>{
  console.info("[Ciconia lifecycle] SW INSTALLING",CACHE_NAME);
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map((path)=>new Request(shellUrl(path),{cache:"reload"})));
    await self.skipWaiting();
    console.info("[Ciconia lifecycle] SW INSTALLED",CACHE_NAME);
  })());
});

self.addEventListener("activate",(event)=>{
  event.waitUntil((async()=>{
    console.info("[Ciconia lifecycle] SW ACTIVATING",CACHE_NAME);
    const keys=await caches.keys(),staleKeys=keys.filter((key)=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME);
    await Promise.all(staleKeys.map((key)=>caches.delete(key)));
    await self.clients.claim();
    console.info("[Ciconia lifecycle] SW ACTIVATED",CACHE_NAME);
  })());
});

self.addEventListener("message",(event)=>{
  if(event.data?.type==="SKIP_WAITING")event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch",(event)=>{
  if(event.request.mode==="navigate")return;
  const url=new URL(event.request.url);
  if(event.request.method!=="GET"||url.origin!==self.location.origin||url.pathname.includes("/api/")||url.pathname.endsWith("/sw.js"))return;
  if(!APP_SHELL_URLS.has(url.href))return;
  event.respondWith(caches.open(CACHE_NAME).then(async(cache)=>{
    const cached=await cache.match(event.request);
    return cached||fetch(new Request(event.request,{cache:"reload"}));
  }));
});
