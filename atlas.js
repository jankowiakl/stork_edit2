(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;root.StorkAtlas=api;})(typeof globalThis==="object"?globalThis:this,function(){
  "use strict";
  const DEFAULTS={count:50,minimum:4,votes:10,cap:0,order:"north"};
  const ORDERS=["north","south","rating","oldest","newest","bird"];
  const LIMIT=192*1024*1024;
  const canUseAtlas=(user,profile)=>!!user&&!user.mustChangePassword&&!!(profile?.bestPicturesUnlocked??!user.restrictedContributor);
  const xml=value=>String(value??"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
  const numeric=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
  const located=p=>numeric(p.lat)&&numeric(p.lon)&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lon))<=180;
  const time=p=>{const value=Date.parse(p.captureTime);return Number.isFinite(value)?value:null;};
  const idCompare=(a,b)=>String(a.id).localeCompare(String(b.id),"en",{numeric:true});
  const quality=(a,b)=>Number(b.averageSurveyRating)-Number(a.averageSurveyRating)||Number(b.surveyRatingCount)-Number(a.surveyRatingCount)||idCompare(a,b);
  function settings(input={}){
    const value={...DEFAULTS,...input};
    for(const key of ["count","votes","cap"])value[key]=Math.floor(Number(value[key]));
    value.minimum=Number(value.minimum);
    if(!Number.isSafeInteger(value.count)||value.count<1||value.count>10000||!Number.isSafeInteger(value.votes)||value.votes<1||!Number.isSafeInteger(value.cap)||value.cap<0||!Number.isFinite(value.minimum)||value.minimum<1||value.minimum>5||!ORDERS.includes(value.order))throw Error("Invalid Atlas criteria");
    return value;
  }
  function order(photos,mode){
    const dates=(a,b,direction=1)=>{const x=time(a),y=time(b);return x===null?(y===null?0:1):y===null?-1:direction*(x-y);};
    return [...photos].sort((a,b)=>{
      let result=0;
      if(mode==="north"||mode==="south")result=Number(located(b))-Number(located(a))||(located(a)&&located(b)?(mode==="north"?-1:1)*(Number(a.lat)-Number(b.lat)):0);
      else if(mode==="rating")result=quality(a,b);
      else if(mode==="bird")result=String(a.bird||"").localeCompare(String(b.bird||""),"en",{numeric:true});
      else if(mode==="newest")result=dates(a,b,-1);
      return result||dates(a,b)||idCompare(a,b);
    });
  }
  function select(photos,input){
    const config=settings(input),seen=new Set(),birds=new Map(),chosen=[];
    for(const photo of [...photos].filter(p=>p.id&&numeric(p.averageSurveyRating)&&Number(p.averageSurveyRating)>=config.minimum&&Number(p.surveyRatingCount)>=config.votes).sort(quality)){
      if(seen.has(photo.id))continue;seen.add(photo.id);
      if(config.cap&&(birds.get(photo.bird)||0)>=config.cap)continue;
      chosen.push({...photo});birds.set(photo.bird,(birds.get(photo.bird)||0)+1);if(chosen.length===config.count)break;
    }
    return order(chosen,config.order);
  }
  function uniqueNames(photos){
    const used=new Set();return photos.map(p=>{
      const original=String(p.filename||`${p.id}.jpg`).split(/[\\/]/).pop().replace(/[\x00-\x1f<>:"|?*]/g,"_");
      const base=`${Number(p.averageSurveyRating)}_${original}`,dot=base.lastIndexOf("."),stem=dot>0?base.slice(0,dot):base,ext=dot>0?base.slice(dot):"";
      let name=base,n=2;while(used.has(name.toLowerCase()))name=`${stem}_${n++}${ext}`;used.add(name.toLowerCase());return name;
    });
  }
  function manifest(photos){
    const cell=value=>{let s=String(value??"");if(/^[=+@\t\r]/.test(s)||(/^\-/.test(s)&&!numeric(s)))s="'"+s;return `"${s.replace(/"/g,'""')}"`;};
    const names=uniqueNames(photos);return "\ufeff"+[["position","filename","bird","averageSurveyRating","surveyRatingCount","captureTime","lat","lon","export_filename","map_filename"],...photos.map((p,i)=>[i+1,p.filename,p.bird,p.averageSurveyRating,p.surveyRatingCount,p.captureTime,p.lat,p.lon,names[i],`${names[i]}.map.png`])].map(row=>row.map(cell).join(",")).join("\r\n");
  }
  function encodeLink(snapshot,expiresAt){
    const data={v:1,expiresAt,criteria:snapshot.criteria,createdAt:snapshot.createdAt,photos:snapshot.photos.map(p=>({id:String(p.id),averageSurveyRating:Number(p.averageSurveyRating),surveyRatingCount:Number(p.surveyRatingCount)}))};
    const bytes=new TextEncoder().encode(JSON.stringify(data));let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  function decodeLink(value,now=Date.now()){
    if(!value||value.length>60000)throw Error("invalid");
    const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0))));
    if(data.v!==1||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=now||!Array.isArray(data.photos)||!data.photos.length||data.photos.length>10000)throw Error("invalid");
    data.criteria=settings(data.criteria);const seen=new Set();
    for(const p of data.photos){if(typeof p.id!=="string"||!p.id||p.id.length>300||seen.has(p.id)||!numeric(p.averageSurveyRating)||p.averageSurveyRating<1||p.averageSurveyRating>5||!Number.isInteger(p.surveyRatingCount)||p.surveyRatingCount<1)throw Error("invalid");seen.add(p.id);}
    return data;
  }

  // A real Office Open XML package, with editable text and embedded JPEGs.
  function docxParts(pages,{title,subtitle,coverLines=[],cover=true,source}){
    const files={},rels=[],w="http://schemas.openxmlformats.org/wordprocessingml/2006/main",r="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const p=(text,size=19,bold=false)=>`<w:p><w:pPr><w:spacing w:after="70"/></w:pPr><w:r><w:rPr>${bold?"<w:b/>":""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
    const drawing=(image,id,maxWidth)=>{
      const scale=Math.min(maxWidth/image.width,340/image.height),cx=Math.round(image.width*scale*9525),cy=Math.round(image.height*scale*9525);
      files[`word/media/image${id}.jpg`]=image.bytes;rels.push(`<Relationship Id="rId${id}" Type="${r}/image" Target="media/image${id}.jpg"/>`);
      return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Atlas ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    };
    let body=cover?p(title,42,true)+p(subtitle,26)+coverLines.map(line=>p(line,22)).join(""):"";
    pages.forEach((page,i)=>{
      if(i||cover)body+='<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      const cell=(width,content)=>`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`;
      body+=p(page.heading,24,true)+`<w:tbl><w:tblPr><w:tblW w:w="15198" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="6839"/><w:gridCol w:w="8359"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(6839,drawing(page.map,i*2+1,440))}${cell(8359,drawing(page.photo,i*2+2,540))}</w:tr></w:tbl>`;
      body+=p(source,15)+page.lines.map(line=>p(line)).join("");
    });
    body+='<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="650" w:right="820" w:bottom="650" w:left="820" w:header="0" w:footer="0"/></w:sectPr>';
    files["word/document.xml"]=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${w}" xmlns:r="${r}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}</w:body></w:document>`;
    files["word/_rels/document.xml.rels"]=`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`;
    files["_rels/.rels"]=`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="${r}/officeDocument" Target="word/document.xml"/></Relationships>`;
    files["[Content_Types].xml"]='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    return files;
  }
  const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  async function raster(blob,max=1800){
    const bitmap=await createImageBitmap(blob);try{const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const image=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Image conversion failed")),"image/jpeg",.88));return{width:canvas.width,height:canvas.height,bytes:new Uint8Array(await image.arrayBuffer())};}finally{bitmap.close();}
  }
  async function routeImage(photo,route,stopovers,options,t){
    const canvas=document.createElement("canvas");canvas.width=1000;canvas.height=760;const ctx=canvas.getContext("2d");ctx.fillStyle="#edf3f5";ctx.fillRect(0,0,1000,760);
    const points=(route?.points||[]).filter(located),hasLocation=located(photo),coords=[...points,...(hasLocation?[photo]:[])];
    ctx.font="20px sans-serif";ctx.fillStyle="#253d50";ctx.fillText(String(photo.bird||""),36,34);ctx.fillText("N ↑",915,34);
    if(coords.length){
      // Equirectangular schematic; unwrap longitude around the photo for dateline routes.
      const reference=hasLocation?Number(photo.lon):Number(coords[0].lon),lon=p=>reference+((Number(p.lon)-reference+540)%360)-180;
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(const p of coords){minX=Math.min(minX,lon(p));maxX=Math.max(maxX,lon(p));minY=Math.min(minY,Number(p.lat));maxY=Math.max(maxY,Number(p.lat));}
      const midX=(minX+maxX)/2,midY=(minY+maxY)/2,cos=Math.max(.1,Math.cos(midY*Math.PI/180)),spanX=Math.max(.02,maxX-minX)*1.18,spanY=Math.max(.02,maxY-minY)*1.18,scale=Math.min(820/(spanX*cos),580/spanY);
      const xy=p=>[500+(lon(p)-midX)*cos*scale,365-(Number(p.lat)-midY)*scale];
      ctx.strokeStyle="#cad5dc";ctx.lineWidth=1;ctx.font="15px sans-serif";
      for(let i=0;i<=4;i++){const y=75+i*145,x=90+i*205;ctx.beginPath();ctx.moveTo(90,y);ctx.lineTo(910,y);ctx.moveTo(x,75);ctx.lineTo(x,655);ctx.stroke();ctx.fillText(`${(midY-(y-365)/scale).toFixed(2)}°`,5,y);ctx.fillText(`${(((midX+(x-500)/(cos*scale))+540)%360-180).toFixed(2)}°`,x-25,683);}
      if(options.stopovers)for(const feature of stopovers?.features||[]){const g=feature.geometry,polygons=g?.type==="Polygon"?[g.coordinates]:g?.type==="MultiPolygon"?g.coordinates:[];for(const polygon of polygons){ctx.beginPath();for(const ring of polygon){ring.forEach(([x,y],i)=>{const [px,py]=xy({lon:x,lat:y});i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.closePath();}ctx.fillStyle="#df9f3340";ctx.strokeStyle="#b47c25";ctx.fill("evenodd");ctx.stroke();}}
      if(options.route&&points.length){ctx.strokeStyle="#2186b5";ctx.lineWidth=3;ctx.beginPath();points.forEach((p,i)=>{const [x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
      if(hasLocation){const [x,y]=xy(photo);ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fillStyle="#d44837";ctx.fill();ctx.strokeStyle="white";ctx.lineWidth=3;ctx.stroke();ctx.fillStyle="#253d50";ctx.fillText(`${Number(photo.lat).toFixed(5)}, ${Number(photo.lon).toFixed(5)}`,36,720);}
    }
    ctx.fillStyle="#9b3e27";ctx.font="19px sans-serif";if(!hasLocation)ctx.fillText(t("noLocation"),36,360);if(options.route&&!points.length)ctx.fillText(t("noRoute"),36,400);if(route?.simplified){ctx.fillStyle="#253d50";ctx.fillText(t("simplified"),36,746);}
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Map conversion failed")),"image/jpeg",.88));return{width:1000,height:760,bytes:new Uint8Array(await blob.arrayBuffer()),warning:!hasLocation||(options.route&&!points.length)};
  }

  function create(adapter){
    const i18n=window.StorkAppI18n,t=(key,vars)=>i18n.t(`atlas.${key}`,vars),dialog=document.createElement("dialog");dialog.className="atlasDialog";document.body.append(dialog);
    let config={...DEFAULTS},snapshot=null,screen="config",controller=null,progressText="",shareValue="",consumedLink=null,jobUser=null;
    let mapPhotoIndex=0,mapExtent="photo";
    const allowed=()=>!!adapter.canAccess();
    const requireAccess=()=>{if(allowed())return true;screen="locked";render();show();return false;};
    try{config=settings(JSON.parse(localStorage.getItem("storkAtlasSettingsV1")||"{}"));}catch(_){}
    let wordOptions=Object.fromEntries(["titlePage","average","n","individual","time","filename","description","remarks","altitude","height","place","coords","route","stopovers","number"].map(key=>[key,key!=="stopovers"]));
    const button=(key,fn)=>{const b=document.createElement("button");b.type="button";b.className="secondary";b.textContent=t(key);b.onclick=event=>{if(["close","cancel"].includes(key)||requireAccess())return fn(event);};return b;};
    const e=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
    const date=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?t("unavailable"):d.toLocaleString(i18n.language);};
    const check=()=>{if(controller?.signal.aborted)throw new DOMException("Cancelled","AbortError");if(!adapter.userId()||String(adapter.userId())!==jobUser)throw Error(t("login"));if(!allowed())throw Error(t("locked"));};
    const show=()=>{if(!dialog.open)dialog.showModal();};
    const notify=message=>{progressText=message;const node=dialog.querySelector("[data-atlas-status]");if(node)node.textContent=message;};
    const summaryLines=()=>{
      const photos=snapshot.photos,dates=photos.map(time).filter(x=>x!==null),positions=photos.filter(located),range=values=>values.length?`${Math.min(...values).toFixed(3)} … ${Math.max(...values).toFixed(3)}`:t("unavailable");
      return [[t("dates"),dates.length?`${date(Math.min(...dates))} — ${date(Math.max(...dates))}`:t("unavailable")],[t("geo"),`${range(positions.map(p=>Number(p.lat)))} / ${range(positions.map(p=>Number(p.lon)))}`],[t("minimum"),snapshot.criteria.minimum],[t("votes"),snapshot.criteria.votes],[t("order"),t(snapshot.criteria.order)]];
    };
    async function job(fn){
      if(controller)return;controller=new AbortController();jobUser=String(adapter.userId()||"");progressText="";render();
      try{check();await fn();}catch(error){notify(error.name==="AbortError"||controller.signal.aborted?t("cancelled"):t("failed",{error:error.message}));}finally{controller=null;jobUser=null;render();}
    }
    async function build(){await job(async()=>{
      const all=[],seen=new Set();let page=1,total=Infinity;
      while(all.length<total){check();const data=await adapter.api(`/api/survey-results/photos?page=${page++}&pageSize=100&sort=rating_desc`,{signal:controller.signal});check();total=Number(data.total)||0;
        if(!data.photos?.length)break;let added=0;for(const p of data.photos)if(!seen.has(p.id)){all.push(p);seen.add(p.id);added++;}if(!added)throw Error("Survey pagination did not advance");notify(t("loading",{count:all.length}));await yieldUI();
      }
      await adapter.selectionChanged?.();check();snapshot={criteria:{...config},createdAt:new Date().toISOString(),photos:select(all,config)};screen="summary";try{localStorage.setItem("storkAtlasSettingsV1",JSON.stringify(config));}catch(_){}progressText="";
    });}
    async function imageBlob(photo){
      check();const response=await adapter.api(`/api/photos/${encodeURIComponent(photo.id)}/download`,{signal:controller.signal},{raw:true});
      if(Number(response.headers.get("Content-Length"))>LIMIT)throw Error(t("memory"));
      const reader=response.body?.getReader();if(!reader){const blob=await response.blob();if(blob.size>LIMIT)throw Error(t("memory"));return blob;}
      const chunks=[];let size=0;try{while(true){check();const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT)throw Error(t("memory"));chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
      return new Blob(chunks,{type:response.headers.get("Content-Type")||"image/jpeg"});
    }
    async function archive(parts,name,type){
      check();await yieldUI();let size=0;const files=Object.create(null);for(const [key,value] of Object.entries(parts)){const bytes=typeof value==="string"?new TextEncoder().encode(value):value;size+=bytes.byteLength;if(size>LIMIT)throw Error(t("memory"));files[key]=bytes;}
      const zipped=window.fflate.zipSync(files,{level:0});await yieldUI();check();download(new Blob([zipped],{type}),name);
    }
    async function exportZip(){await job(async()=>{const parts=Object.create(null),names=uniqueNames(snapshot.photos);let size=0;for(let i=0;i<snapshot.photos.length;i++){notify(t("progress",{current:i+1,total:snapshot.photos.length}));const blob=await imageBlob(snapshot.photos[i]);size+=blob.size;if(size>LIMIT)throw Error(t("memory"));parts[names[i]]=new Uint8Array(await blob.arrayBuffer());await yieldUI();}parts["atlas_manifest.csv"]=manifest(snapshot.photos);await archive(parts,"atlas-photos.zip","application/zip");});}
    async function exportMaps(single=false){await job(async()=>{
      const photos=[...snapshot.photos],names=uniqueNames(photos),indices=single?[mapPhotoIndex]:photos.map((_,i)=>i),parts=Object.create(null),routes=new Map(),stops=new Map(),mapSettings={...adapter.mapSettings(),extent:mapExtent};let size=0;
      for(let i=0;i<indices.length;i++){
        check();const index=indices[i],selected=photos[index];notify(t("progress",{current:i+1,total:indices.length}));
        // Check current photo access via the existing browse mechanism, including contribution limits.
        const access=await adapter.api(`/api/photos/${encodeURIComponent(selected.id)}/access`,{method:"POST",body:JSON.stringify({purpose:"browse"}),signal:controller.signal});adapter.onAccess?.(access);check();
        const photo={...selected,...access.photo};if(!located(photo))throw Error(`${photo.filename}: ${t("noLocation")}`);
        if(!routes.has(photo.bird))routes.set(photo.bird,await adapter.api(`/api/individuals/${encodeURIComponent(photo.bird)}/route?detail=full&max=100000`,{signal:controller.signal}));
        if(!stops.has(photo.bird))stops.set(photo.bird,await adapter.api(`/api/individuals/${encodeURIComponent(photo.bird)}/stopovers`,{signal:controller.signal}));
        const blob=await adapter.renderMap({photo,route:routes.get(photo.bird),stopovers:stops.get(photo.bird),settings:mapSettings,signal:controller.signal,t});check();size+=blob.size;if(size>LIMIT)throw Error(t("memory"));
        const name=`${names[index]}.map.png`;if(single)download(blob,name);else parts[name]=new Uint8Array(await blob.arrayBuffer());await yieldUI();
      }
      if(!single){parts["atlas_manifest.csv"]=manifest(photos);await archive(parts,"atlas-maps.zip","application/zip");}
    });}
    async function exportWord(){await job(async()=>{
      const pages=[],routes=new Map(),stops=new Map();let size=0,warnings=0;
      for(let i=0;i<snapshot.photos.length;i++){
        check();const selected=snapshot.photos[i];notify(t("progress",{current:i+1,total:snapshot.photos.length}));
        const {photo:detail}=await adapter.api(`/api/photos/${encodeURIComponent(selected.id)}`,{signal:controller.signal});check();const photo={...detail,...selected,annotation:detail.annotation};
        if(wordOptions.route&&!routes.has(photo.bird))routes.set(photo.bird,await adapter.api(`/api/individuals/${encodeURIComponent(photo.bird)}/route?max=5000`,{signal:controller.signal}));
        if(wordOptions.stopovers&&!stops.has(photo.bird))stops.set(photo.bird,await adapter.api(`/api/individuals/${encodeURIComponent(photo.bird)}/stopovers`,{signal:controller.signal}));
        const map=await routeImage(photo,routes.get(photo.bird),stops.get(photo.bird),wordOptions,t),image=await raster(await imageBlob(photo));if(map.warning)warnings++;
        size+=map.bytes.length+image.bytes.length;if(size>LIMIT)throw Error(t("memory"));
        const a=photo.annotation||{},height=numeric(a.Above_ground)?a.Above_ground:numeric(photo.altitudeM)&&numeric(photo.elevationM)?Number(photo.altitudeM)-Number(photo.elevationM):null;
        const values={average:selected.averageSurveyRating,n:selected.surveyRatingCount,individual:photo.bird,time:photo.captureTime?date(photo.captureTime):null,filename:photo.filename,description:a.Env_desc_en||photo.geoDescription,remarks:a.Remarks,altitude:photo.altitudeM,height,place:[photo.country,photo.closeCity,photo.address].filter(Boolean).join(" • "),coords:located(photo)?`${photo.lat}, ${photo.lon}`:null};
        const lines=Object.entries(values).filter(([key,value])=>wordOptions[key]&&value!==null&&value!==undefined&&value!=="").map(([key,value])=>`${t(key)}: ${value}`);
        pages.push({heading:wordOptions.number?`Atlas • ${i+1} / ${snapshot.photos.length}`:"Atlas",map,photo:image,lines});await yieldUI();
      }
      await archive(docxParts(pages,{title:t("title"),subtitle:t("subtitle"),cover:wordOptions.titlePage,coverLines:[date(snapshot.createdAt),t("summary",{photos:snapshot.photos.length,birds:new Set(snapshot.photos.map(p=>p.bird)).size}),...summaryLines().map(([k,v])=>`${k}: ${v}`)],source:t("mapSource")}),"atlas.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      if(warnings)progressText=t("mapWarning",{count:warnings});
    });}
    function render(){
      dialog.replaceChildren();const header=e("header"),heading=e("h2","Atlas");heading.id="atlasDialogTitle";dialog.setAttribute("aria-labelledby",heading.id);header.append(heading,button(controller?"cancel":"close",()=>controller?controller.abort():dialog.close()));dialog.append(header);
      if(!allowed()){dialog.append(e("p",t("locked"),"atlasNotice"));return;}
      if(controller){dialog.append(e("p",progressText));const progress=e("progress");dialog.append(progress);const status=e("p",progressText);status.dataset.atlasStatus="";status.setAttribute("role","status");dialog.append(status);return;}
      if(screen==="config"){
        dialog.append(e("p",t("criteria")));const form=e("form"),grid=e("div",undefined,"atlasGrid");
        for(const [key,min,max,step] of [["count",1,10000,1],["minimum",1,5,.1],["votes",1,10000000,1],["cap",0,10000,1]]){const label=e("label",t(key)),input=e("input");input.type="number";input.min=min;input.max=max;input.step=step;input.required=true;input.value=config[key];input.oninput=()=>{config[key]=Number(input.value);};label.append(input);grid.append(label);}
        const label=e("label",t("order")),orderSelect=e("select");ORDERS.forEach(key=>orderSelect.add(new Option(t(key),key)));orderSelect.value=config.order;orderSelect.onchange=()=>{config.order=orderSelect.value;};label.append(orderSelect);grid.append(label);form.append(grid);const actions=e("div",undefined,"atlasActions"),buildButton=button("build",()=>{});buildButton.type="submit";actions.append(buildButton);if(snapshot)actions.append(button("back",()=>{screen="summary";render();}));form.append(actions);form.onsubmit=event=>{event.preventDefault();if(form.reportValidity()){config=settings(config);void build();}};dialog.append(form);
      }else if(screen==="summary"){
        const photos=snapshot.photos;dialog.append(e("h3",t("summary",{photos:photos.length,birds:new Set(photos.map(p=>p.bird)).size})),e("p",t("snapshot")));
        const dl=e("dl",undefined,"atlasSummary");for(const [key,value] of summaryLines())dl.append(e("dt",key),e("dd",String(value)));dialog.append(dl);
        const missing=photos.filter(p=>!located(p)).length;if(missing)dialog.append(e("p",t("missing",{count:missing}),"atlasNotice"));if(!photos.length)dialog.append(e("p",t("empty")));
        const actions=e("div",undefined,"atlasActions");if(photos.length)actions.append(button("open",async()=>{dialog.close();await adapter.openCollection(snapshot);}),button("zip",exportZip),button("maps",()=>{screen="maps";render();}),button("share",()=>{screen="share";shareValue="";render();}),button("word",()=>{screen="word";render();}));actions.append(button("settings",()=>{screen="config";render();}));dialog.append(actions);
      }else if(screen==="maps"){
        dialog.append(e("p",t("mapsNote")));const label=e("label",t("mapExtent")),extent=e("select");for(const key of ["photo","route"])extent.add(new Option(t(key==="photo"?"mapPhotoExtent":"mapRouteExtent"),key));extent.value=mapExtent;extent.onchange=()=>{mapExtent=extent.value;};label.append(extent);dialog.append(label);
        const photoLabel=e("label",t("mapPhoto")),photoSelect=e("select");snapshot.photos.forEach((p,i)=>photoSelect.add(new Option(`${i+1}. ${p.filename} — ${p.bird}`,String(i))));mapPhotoIndex=Math.min(mapPhotoIndex,snapshot.photos.length-1);photoSelect.value=String(mapPhotoIndex);photoSelect.onchange=()=>{mapPhotoIndex=Number(photoSelect.value);};photoLabel.append(photoSelect);dialog.append(photoLabel);
        const actions=e("div",undefined,"atlasActions");actions.append(button("mapSingle",()=>exportMaps(true)),button("mapsZip",()=>exportMaps(false)),button("back",()=>{screen="summary";render();}));dialog.append(actions);
      }else if(screen==="word"){
        dialog.append(e("p",t("mapNote")));const grid=e("div",undefined,"atlasChecks");for(const key of Object.keys(wordOptions)){const label=e("label"),input=e("input");input.type="checkbox";input.checked=wordOptions[key];input.onchange=()=>{wordOptions[key]=input.checked;};label.append(input,document.createTextNode(t(key)));grid.append(label);}dialog.append(grid);const actions=e("div",undefined,"atlasActions");actions.append(button("word",exportWord),button("back",()=>{screen="summary";render();}));dialog.append(actions);
      }else if(screen==="share"){
        dialog.append(e("p",t("linkNote"),"atlasNotice"));const label=e("label",t("expiry")),expiry=e("select"),custom=e("input");for(const days of [1,7,14,30])expiry.add(new Option(t("days",{n:days}),String(days)));expiry.add(new Option(t("custom"),"custom"));expiry.value="14";custom.type="datetime-local";custom.hidden=true;
        const output=e("textarea");output.rows=4;output.readOnly=true;output.setAttribute("aria-label",t("share"));
        const update=()=>{custom.hidden=expiry.value!=="custom";try{const expiresAt=expiry.value==="custom"?new Date(custom.value):new Date(Date.now()+Number(expiry.value)*86400000);if(!(expiresAt.getTime()>Date.now()))throw Error(t("invalidLink"));const url=new URL(location.href);url.search="";url.hash=`atlas=${encodeLink(snapshot,expiresAt.toISOString())}`;if(url.href.length>60000)throw Error(t("linkLarge"));shareValue=url.href;output.value=shareValue;}catch(error){shareValue="";output.value=error.message;}};
        expiry.onchange=update;custom.onchange=update;label.append(expiry,custom);dialog.append(label,output);update();const actions=e("div",undefined,"atlasActions");actions.append(button("copy",async()=>{if(!shareValue)return;try{await navigator.clipboard.writeText(shareValue);notify(t("copied"));}catch(_){output.focus();output.select();}}),button("back",()=>{screen="summary";render();}));dialog.append(actions);
      }
      const status=e("p",progressText);status.dataset.atlasStatus="";status.setAttribute("role","status");dialog.append(status);
    }
    async function consumeLink(){
      const value=new URLSearchParams(location.hash.slice(1)).get("atlas");if(!value||consumedLink===value)return false;
      if(!adapter.userId()){adapter.requestLogin();return false;}if(!requireAccess())return true;consumedLink=value;show();await job(async()=>{
        let data;try{data=decodeLink(value);}catch(_){throw Error(t("invalidLink"));}const photos=[];
        for(const selected of data.photos){check();notify(t("progress",{current:photos.length+1,total:data.photos.length}));const response=await adapter.api(`/api/photos/${encodeURIComponent(selected.id)}`,{signal:controller.signal});photos.push({...response.photo,...selected});}
        await adapter.selectionChanged?.();check();snapshot={photos,criteria:data.criteria,createdAt:data.createdAt};config={...data.criteria};screen="summary";progressText="";
      });return true;
    }
    dialog.addEventListener("cancel",event=>{if(controller){event.preventDefault();controller.abort();}});
    i18n.onChange(()=>{if(dialog.open)render();});
    return{open(){if(!adapter.userId()){adapter.requestLogin();return;}if(!requireAccess())return;if(adapter.beforeOpen?.()===false)return;screen=snapshot?"summary":"config";render();show();},openMaps(index=0){if(!adapter.userId()){adapter.requestLogin();return;}if(!requireAccess()||!snapshot?.photos.length)return;mapPhotoIndex=Math.max(0,Math.min(Number(index)||0,snapshot.photos.length-1));screen="maps";render();show();},enforceAccess(){if(allowed())return;controller?.abort();if(dialog.open)render();adapter.onLocked?.();},consumeLink,get snapshot(){return snapshot;},setOrder(mode){if(!snapshot||!ORDERS.includes(mode))return;snapshot.photos=order(snapshot.photos,mode);snapshot.criteria.order=mode;config.order=mode;},label(index){const p=snapshot?.photos[index];return p?t("position",{current:index+1,total:snapshot.photos.length,rating:Number(p.averageSurveyRating).toLocaleString(i18n.language),n:p.surveyRatingCount}):"Atlas";},reset(){controller?.abort();snapshot=null;screen="config";consumedLink=null;dialog.close();adapter.onReset?.();},isOpen:()=>dialog.open};
  }
  return{DEFAULTS,ORDERS,canUseAtlas,settings,located,order,select,uniqueNames,manifest,encodeLink,decodeLink,docxParts,create};
});
