// Authenticated research exports only; independent of the public Survey workflow.
(function(root){
  "use strict";
  function create({request,t,onChange,userId}){
    const dialog=document.createElement("dialog");dialog.className="surveyExportDialog";
    const title=document.createElement("h2"),dataset=document.createElement("p"),status=document.createElement("p"),progress=document.createElement("progress"),details=document.createElement("p"),action=document.createElement("button");
    title.id="surveyExportTitle";dialog.setAttribute("aria-labelledby",title.id);status.setAttribute("role","status");status.setAttribute("aria-live","polite");details.className="miniNote";action.type="button";action.className="secondary";
    dialog.append(title,dataset,status,progress,details,action);document.body.append(dialog);
    let controller=null,stage="preparing",labelKey="",format="",received=0,total=0,errorText="",trigger=null;
    const render=()=>{
      title.textContent=t("surveyExport.title");dataset.textContent=`${t(labelKey)} ${format.toUpperCase()}`;
      status.textContent=t(`surveyExport.${stage}`)+(errorText?` ${errorText}`:"");
      progress.setAttribute("aria-label",t("surveyExport.progress"));progress.hidden=["done","cancelled","error"].includes(stage);
      const measurable=stage==="downloading"&&total>0&&received<=total;
      if(measurable){progress.max=total;progress.value=received;}else progress.removeAttribute("value");
      details.textContent=received?t("surveyExport.bytes",{count:received.toLocaleString()})+(measurable?` (${Math.floor(100*received/total)}%)`:""):"";
      action.textContent=t(controller?"editor.cancel":"help.close");
    };
    const cancel=()=>controller?.abort();
    action.onclick=()=>controller?cancel():dialog.close();
    dialog.addEventListener("cancel",event=>{if(controller){event.preventDefault();cancel();}});
    dialog.addEventListener("close",()=>{cancel();trigger?.focus({preventScroll:true});});
    onChange?.(()=>{if(dialog.open)render();});
    async function download({url,filename,label,format:extension,button}){
      if(controller){if(!dialog.open)dialog.showModal();return;}
      const active=new AbortController(),owner=userId?.();controller=active;trigger=button;labelKey=label;format=extension;stage="preparing";received=0;total=0;errorText="";
      const wasDisabled=button?.disabled;if(button)button.disabled=true;render();dialog.showModal();
      const check=()=>{if(active.signal.aborted||(userId&&owner!==userId()))throw new DOMException("Cancelled","AbortError");};
      let reader;
      try{
        // Server prepares data and generates CSV/XLSX before/during this request.
        const response=await request(url,{signal:active.signal});check();if(!response.ok)throw Error(`HTTP ${response.status}`);
        const length=Number(response.headers.get("Content-Length"));
        // Compressed Content-Length is not the decoded stream length.
        total=!response.headers.get("Content-Encoding")&&Number.isSafeInteger(length)&&length>0?length:0;
        stage="downloading";render();let blob;
        if(response.body?.getReader){
          reader=response.body.getReader();const chunks=[];
          const abortReader=()=>{void reader.cancel().catch(()=>{});};active.signal.addEventListener("abort",abortReader,{once:true});
          try{while(true){const {done,value}=await reader.read();check();if(done)break;chunks.push(value);received+=value.byteLength;render();}}
          finally{active.signal.removeEventListener("abort",abortReader);}
          blob=new Blob(chunks,{type:response.headers.get("Content-Type")||"application/octet-stream"});
        }else{blob=await response.blob();received=blob.size;}
        check();stage="saving";render();await new Promise(resolve=>setTimeout(resolve,0));check();
        const objectUrl=URL.createObjectURL(blob),link=document.createElement("a");
        try{link.href=objectUrl;link.download=filename;document.body.append(link);link.click();}
        finally{link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);}
        stage="done";
      }catch(error){stage=active.signal.aborted||error.name==="AbortError"?"cancelled":"error";if(stage==="error")errorText=error.message;}
      finally{if(reader){try{await reader.cancel();}catch(_){}reader.releaseLock();}controller=null;if(button)button.disabled=wasDisabled;render();}
    }
    return{download};
  }
  root.StorkSurveyDownload={create};
})(typeof window!=="undefined"?window:globalThis);
