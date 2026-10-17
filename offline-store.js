(function attachOfflineStore(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.StorkOfflineStore=api;
})(typeof globalThis==="object"?globalThis:this,function createOfflineStoreModule(){
  "use strict";

  const DB_NAME="stork-edit2-offline-v1",DB_VERSION=1;
  const STORES={pending:"pendingAnnotations",working:"editorWorkingCopies",resume:"resumeWorkspace",media:"photoBuffer"};
  const keyFor=(userId,photoId)=>`${String(userId)}:${String(photoId)}`;
  const requestResult=(request)=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("IndexedDB request failed."));});
  const transactionDone=(transaction)=>new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(transaction.error||new Error("IndexedDB transaction was aborted."));transaction.onerror=()=>reject(transaction.error||new Error("IndexedDB transaction failed."));});
  const normalizePending=(existing,incoming,now=Date.now())=>({
    ...(existing||{}),...incoming,
    key:keyFor(incoming.userId,incoming.photoId),
    queueId:existing?.queueId||incoming.queueId||`${now}-${Math.random().toString(36).slice(2)}`,
    expectedVersion:existing?.expectedVersion??incoming.expectedVersion??0,
    createdAt:existing?.createdAt||incoming.createdAt||now,
    savedAt:incoming.savedAt||now,
    syncState:"pending",lastError:null
  });

  function create({indexedDB:factory=globalThis.indexedDB}={}){
    let databasePromise=null;
    const database=()=>{
      if(!factory)return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
      if(databasePromise)return databasePromise;
      databasePromise=new Promise((resolve,reject)=>{
        const request=factory.open(DB_NAME,DB_VERSION);
        request.onupgradeneeded=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains(STORES.pending)){const store=db.createObjectStore(STORES.pending,{keyPath:"key"});store.createIndex("userId","userId",{unique:false});}
          if(!db.objectStoreNames.contains(STORES.working)){const store=db.createObjectStore(STORES.working,{keyPath:"key"});store.createIndex("userId","userId",{unique:false});}
          if(!db.objectStoreNames.contains(STORES.resume))db.createObjectStore(STORES.resume,{keyPath:"userId"});
          if(!db.objectStoreNames.contains(STORES.media)){const store=db.createObjectStore(STORES.media,{keyPath:"key"});store.createIndex("userId","userId",{unique:false});}
        };
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>{databasePromise=null;reject(request.error||new Error("Could not open IndexedDB."));};
        request.onblocked=()=>{databasePromise=null;reject(new Error("IndexedDB upgrade is blocked by another tab."));};
      });
      return databasePromise;
    };
    const getAllForUser=async(storeName,userId)=>{const db=await database(),tx=db.transaction(storeName,"readonly"),items=await requestResult(tx.objectStore(storeName).index("userId").getAll(String(userId)));await transactionDone(tx);return items;};
    const put=async(storeName,value)=>{const db=await database(),tx=db.transaction(storeName,"readwrite");tx.objectStore(storeName).put(value);await transactionDone(tx);return value;};
    const remove=async(storeName,key)=>{const db=await database(),tx=db.transaction(storeName,"readwrite");tx.objectStore(storeName).delete(key);await transactionDone(tx);};

    return{
      ready:database,
      async putPending(record){
        const userId=String(record?.userId||""),photoId=String(record?.photoId||"");if(!userId||!photoId)throw new Error("A user and photo are required for an offline save.");
        const db=await database(),tx=db.transaction(STORES.pending,"readwrite"),store=tx.objectStore(STORES.pending),items=await requestResult(store.index("userId").getAll(userId)),key=keyFor(userId,photoId),existing=items.find((item)=>item.key===key),pending=normalizePending(existing,{...record,userId,photoId});
        if(pending.status!=="complete")for(const item of items)if(item.key!==key&&item.status!=="complete"&&item.syncState==="pending")store.delete(item.key);
        store.put(pending);await transactionDone(tx);return pending;
      },
      async listPending(userId){const items=await getAllForUser(STORES.pending,userId);return items.sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0)||String(a.key).localeCompare(String(b.key)));},
      async getPending(userId,photoId){const db=await database(),tx=db.transaction(STORES.pending,"readonly"),value=await requestResult(tx.objectStore(STORES.pending).get(keyFor(userId,photoId)));await transactionDone(tx);return value||null;},
      async updatePending(userId,photoId,changes){const current=await this.getPending(userId,photoId);if(!current)return null;return put(STORES.pending,{...current,...changes,key:current.key,userId:current.userId,photoId:current.photoId});},
      removePending:(userId,photoId)=>remove(STORES.pending,keyFor(userId,photoId)),
      async saveWorkingCopy(copy){const userId=String(copy?.userId||""),photoId=String(copy?.photoId||"");if(!userId||!photoId)throw new Error("A user and photo are required for a working copy.");return put(STORES.working,{...copy,userId,photoId,key:keyFor(userId,photoId),savedAt:copy.savedAt||Date.now()});},
      async getWorkingCopy(userId,photoId){const db=await database(),tx=db.transaction(STORES.working,"readonly"),value=await requestResult(tx.objectStore(STORES.working).get(keyFor(userId,photoId)));await transactionDone(tx);return value||null;},
      removeWorkingCopy:(userId,photoId)=>remove(STORES.working,keyFor(userId,photoId)),
      saveResume:(resume)=>put(STORES.resume,{...resume,userId:String(resume.userId),savedAt:resume.savedAt||Date.now()}),
      async getResume(userId){const db=await database(),tx=db.transaction(STORES.resume,"readonly"),value=await requestResult(tx.objectStore(STORES.resume).get(String(userId)));await transactionDone(tx);return value||null;},
      async putMedia(record){const userId=String(record?.userId||""),photoId=String(record?.photoId||"");if(!userId||!photoId||!(record.blob instanceof Blob))throw new Error("A user, photo and Blob are required for offline media.");return put(STORES.media,{...record,userId,photoId,key:keyFor(userId,photoId),touchedAt:Date.now()});},
      async getMedia(userId,photoId){const db=await database(),tx=db.transaction(STORES.media,"readwrite"),store=tx.objectStore(STORES.media),value=await requestResult(store.get(keyFor(userId,photoId)));if(value){value.touchedAt=Date.now();store.put(value);}await transactionDone(tx);return value||null;},
      listMedia:(userId)=>getAllForUser(STORES.media,userId),
      async pruneMedia(userId,keepPhotoIds=[],maximum=13){const keep=new Set(keepPhotoIds.map(String)),items=await getAllForUser(STORES.media,userId),ordered=items.sort((a,b)=>Number(b.touchedAt||0)-Number(a.touchedAt||0)),allowed=new Set(ordered.filter((item)=>keep.has(String(item.photoId))).map((item)=>item.key));for(const item of ordered)if(allowed.size<maximum)allowed.add(item.key);const db=await database(),tx=db.transaction(STORES.media,"readwrite"),store=tx.objectStore(STORES.media);for(const item of ordered)if(!allowed.has(item.key))store.delete(item.key);await transactionDone(tx);return ordered.length-allowed.size;}
    };
  }

  return{create,normalizePending,keyFor,DB_NAME,STORES};
});
