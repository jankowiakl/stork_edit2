(function(root){
  "use strict";

  const RELOAD_SESSION_KEY="ciconiaSwReloadedVersionV1";
  const lifecycleLog=(event,detail)=>{
    if(detail===undefined)console.info(`[Ciconia lifecycle] ${event}`);
    else console.info(`[Ciconia lifecycle] ${event}`,detail);
  };

  let started=false;
  const start=()=>{
    if(started||!("serviceWorker" in navigator))return;
    started=true;

    let hadControllerAtStart=!!navigator.serviceWorker.controller;
    const observedWorkers=new WeakMap();

    const logWorkerState=(worker)=>{
      if(!worker)return;
      const state=worker.state||"installing";
      if(observedWorkers.get(worker)===state)return;
      observedWorkers.set(worker,state);
      const labels={installing:"SW INSTALLING",installed:"SW INSTALLED",activating:"SW ACTIVATING",activated:"SW ACTIVATED"};
      if(labels[state])lifecycleLog(labels[state]);
    };
    const observeWorker=(worker)=>{
      if(!worker)return;
      logWorkerState(worker);
      worker.addEventListener("statechange",()=>logWorkerState(worker));
    };
    const requestSingleReload=(version)=>{
      if(!hadControllerAtStart||!version)return;
      let alreadyReloaded=false;
      try{alreadyReloaded=sessionStorage.getItem(RELOAD_SESSION_KEY)===version;}catch(_error){}
      if(alreadyReloaded)return;
      try{sessionStorage.setItem(RELOAD_SESSION_KEY,version);}catch(_error){}
      lifecycleLog("RELOAD REQUESTED",version);
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("message",(event)=>{
      if(event.data?.type!=="SW_VERSION"&&event.data?.type!=="SW_ACTIVATED")return;
      if(event.data.updated)requestSingleReload(event.data.version);
    });
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      lifecycleLog("CONTROLLERCHANGE");
      const controller=navigator.serviceWorker.controller;
      if(hadControllerAtStart&&controller)controller.postMessage({type:"GET_VERSION"});
      if(controller)hadControllerAtStart=true;
    });

    window.addEventListener("load",async()=>{
      lifecycleLog("WINDOW LOAD");
      lifecycleLog("SW REGISTER START");
      lifecycleLog("SW UPDATE CHECK","browser-managed registration check");
      try{
        const registration=await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});
        lifecycleLog("SW REGISTERED");
        if(registration.installing){
          lifecycleLog("SW UPDATEFOUND");
          observeWorker(registration.installing);
        }
        if(registration.waiting){
          observeWorker(registration.waiting);
          if(navigator.serviceWorker.controller)registration.waiting.postMessage({type:"SKIP_WAITING"});
        }
        registration.addEventListener("updatefound",()=>{
          lifecycleLog("SW UPDATEFOUND");
          observeWorker(registration.installing);
        });
      }catch(error){
        console.warn("Application installation worker failed",error);
      }
    },{once:true});
  };

  root.CiconiaServiceWorker={start,lifecycleLog,RELOAD_SESSION_KEY};
})(window);
