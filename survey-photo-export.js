// Browser-only join. This allowlist mirrors the scientific SURVEY_PHOTO_COLUMNS,
// using public photo payload names, never filePath, media URLs or author/auth data.
(function(root){
  "use strict";
  const photoFields={photo_bird:"bird",photo_capture_time:"captureTime",photo_lat:"lat",photo_lon:"lon",photo_gps_time:"gpsTime",photo_altitude_m:"altitudeM",photo_elevation_m:"elevationM",photo_country:"country",photo_close_city:"closeCity",photo_address:"address",photo_geo_description:"geoDescription"};
  const annotationFields=["Quality_selected","Pheno_period","Residence","Feather_perc","Feather_occ","Ciconia_num","Env_desc_en","Remarks","Altitude","Fly_ground","Above_ground","Height_class_100m","Thermal_updraft","Activity_class","Agriculture_type","Foraging_habitat_group","Roost_site_group","Period_day","Artificial_lights","Water_presence_class","Spec1_abund","Spec1_name","Spec2_abund","Spec2_name"];
  const photoColumns=["filename",...Object.keys(photoFields),...annotationFields.map(key=>`photo_${key.toLowerCase()}`)];
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  const fail=key=>{throw Error(`surveyExport.${key}`);};
  async function parseCsv(input,check=()=>{}){
    const text=input.replace(/^\uFEFF/,""),rows=[];let row=[],field="",quoted=false,closed=false;
    for(let i=0;i<text.length;i++){
      if(i%262144===0){await pause();check();}
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
      if(c===','||c==='\r'||c==='\n'){
        row.push(field);field="";closed=false;
        if(c!==','){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
      }else if(c==='"'&&!field&&!closed)quoted=true;
      else{if(closed||c==='"')fail("invalidCsv");field+=c;}
    }
    if(quoted)fail("invalidCsv");
    if(row.length||field||closed){row.push(field);rows.push(row);}
    const headers=rows.shift()||[];
    if(!headers.includes("photo_id")||new Set(headers).size!==headers.length||rows.some(values=>values.length!==headers.length))fail("invalidCsv");
    return{headers,rows};
  }
  async function appendIncompleteRatings(table,{request,signal,campaignId=null,check=()=>{},onProgress=()=>{},onMerge=()=>{}}){
    for(const key of ["survey_id","response_id","photo_id","rating"])if(!table.headers.includes(key))fail("invalidCsv");
    const json=async url=>{check();const response=await request(url,{signal});check();if(!response.ok)throw Error(`HTTP ${response.status}`);const data=await response.json();check();return data;};
    const limited=async(items,fn)=>{
      let cursor=0,failure;const results=new Array(items.length);
      const worker=async()=>{while(cursor<items.length&&!failure){const index=cursor++;try{check();results[index]=await fn(items[index]);}catch(error){failure=error;throw error;}}};
      await Promise.allSettled(Array.from({length:Math.min(4,items.length)},worker));if(failure)throw failure;check();return results;
    };
    const validRating=value=>["number","string"].includes(typeof value)&&String(value).trim()!==""&&Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=5;
    const column=key=>table.headers.indexOf(key),responseKey=(survey,id)=>JSON.stringify([String(survey),String(id)]);
    const known=new Set(table.rows.filter(row=>validRating(row[column("rating")])).map(row=>responseKey(row[column("survey_id")],row[column("response_id")])));
    let campaigns;
    if(campaignId)campaigns=[String(campaignId)];
    else{const data=await json("/api/surveys");if(!Array.isArray(data.campaigns)||data.campaigns.some(c=>!c.id))fail("invalidResponseData");campaigns=[...new Set(data.campaigns.map(c=>String(c.id)))];}
    const jobs=new Map();
    const lists=await limited(campaigns,async id=>{
      const data=await json(`/api/surveys/${encodeURIComponent(id)}/results`);
      if(!Array.isArray(data.responses))fail("invalidResponseData");return{id,responses:data.responses};
    });
    for(const {id,responses} of lists)for(const response of responses){
      if(!response.id||!["started","completed"].includes(response.status))fail("invalidResponseData");
      // Also cover a response completed between the CSV snapshot and the results request.
      if(response.status==="started"||(response.status==="completed"&&!known.has(responseKey(id,response.id))))jobs.set(responseKey(id,response.id),{campaign:id,id:String(response.id)});
    }
    let done=0;onProgress({done,total:jobs.size});
    const details=await limited([...jobs.values()],async job=>{
      const {response}=await json(`/api/surveys/${encodeURIComponent(job.campaign)}/responses/${encodeURIComponent(job.id)}`);
      if(!response||String(response.id)!==job.id||!Array.isArray(response.photos)||!["started","completed"].includes(response.status))fail("invalidResponseData");
      done++;onProgress({done,total:jobs.size});return{campaign:job.campaign,response};
    });
    onMerge();await pause();check();
    const headers=[...table.headers];if(!headers.includes("response_status"))headers.splice(headers.indexOf("response_id")+1,0,"response_status");
    const sourceIndices=headers.map(key=>table.headers.indexOf(key)),statusIndex=headers.indexOf("response_status"),rows=[],seen=new Set();
    const add=(row)=>{
      const id=row[headers.indexOf("response_id")],photo=row[headers.indexOf("photo_id")];
      if(!id||!photo||!validRating(row[headers.indexOf("rating")]))return;
      const key=JSON.stringify([String(id),String(photo)]);if(seen.has(key))return;seen.add(key);rows.push(row);
    };
    for(let i=0;i<table.rows.length;i++){
      if(i%500===0){await pause();check();}
      const row=sourceIndices.map(index=>index<0?"":table.rows[i][index]);if(!row[statusIndex])row[statusIndex]="completed";add(row);
    }
    for(const {campaign,response} of details){
      const values={survey_id:campaign,response_id:response.id,response_status:response.status,started_at:response.startedAt??"",completed_at:response.completedAt??"",duration:response.duration??"",quality_flags:(response.qualityFlags||[]).join("|"),included:response.included,demographics:JSON.stringify(response.demographics??{})};
      for(let i=0;i<response.photos.length;i++){
        if(i%500===0){await pause();check();}
        const photo=response.photos[i];if(!validRating(photo.rating))continue;if(!photo.id)fail("invalidResponseData");
        const data={...values,photo_id:photo.id,filename:photo.filename??"",rating:photo.rating};
        add(headers.map(key=>Object.hasOwn(data,key)?data[key]??"":response.demographics?.[key]??""));
      }
    }
    return{headers,rows};
  }
  function project(photo,filenameOnly=false){
    const result={filename:photo.filename??""};
    if(filenameOnly)return result;
    for(const [key,source] of Object.entries(photoFields))result[key]=photo[source]??"";
    for(const key of annotationFields)result[`photo_${key.toLowerCase()}`]=photo.annotation?.[key]??"";
    return result;
  }
  async function enrich(table,{request,signal,check=()=>{},onProgress=()=>{},filenameOnly=false}){
    const idColumn=table.headers.indexOf("photo_id"),ids=[...new Set(table.rows.map(row=>row[idColumn]))];
    // Per-export cache is deliberately not persisted or reused between accounts.
    const cache=new Map();let cursor=0,processed=0,matched=0;
    const report=()=>onProgress({processed,matched,total:ids.length,missing:processed-matched});report();
    const worker=async()=>{
      while(cursor<ids.length){
        check();const id=ids[cursor++];let data=null;
        try{
          if(id){const response=await request(`/api/photos/${encodeURIComponent(id)}`,{signal});check();if(!response.ok)throw Error(`HTTP ${response.status}`);
            const payload=await response.json();check();
            if(payload.photo&&String(payload.photo.id)===id)data=project(payload.photo,filenameOnly);
          }
        }catch(error){check();if(error.name==="AbortError")throw error;}
        cache.set(id,data);processed++;if(data)matched++;report();
      }
    };
    // Keep all workers settled on cancellation so no request outlives this export.
    const results=await Promise.allSettled(Array.from({length:Math.min(4,ids.length)},worker));
    const failed=results.find(result=>result.status==="rejected");if(failed)throw failed.reason;check();
    const columns=filenameOnly?["filename"]:photoColumns;
    const headers=filenameOnly?table.headers.filter(key=>key!=="filename"):[...table.headers,...columns.filter(key=>!table.headers.includes(key))];
    if(filenameOnly)headers.splice(headers.indexOf("photo_id")+1,0,"filename");
    const sourceIndices=headers.map(key=>table.headers.indexOf(key)),positions=columns.map(key=>[key,headers.indexOf(key)]),rows=[];
    for(let i=0;i<table.rows.length;i++){
      if(i%500===0){await pause();check();}
      const original=table.rows[i],data=cache.get(original[idColumn]),row=sourceIndices.map(index=>index<0?"":original[index]);
      if(data)for(const [key,index] of positions)row[index]=data[key];
      rows.push(row);
    }
    return{headers,rows,missing:ids.length-matched};
  }
  const csvCell=value=>{const text=String(value??"");return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;};
  async function csvBlob(table,check=()=>{}){
    const parts=["\uFEFF",table.headers.map(csvCell).join(",")+"\r\n"];
    for(let i=0;i<table.rows.length;i++){if(i%500===0){await pause();check();}parts.push(table.rows[i].map(csvCell).join(",")+"\r\n");}
    check();return new Blob(parts,{type:"text/csv;charset=utf-8"});
  }
  // Minimal real XLSX package; reuse the already vendored fflate, no new library.
  const xml=value=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("\r","&#13;");
  const column=index=>{let name="";for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
  async function xlsxBlob(table,{check=()=>{},signal}={}){
    if(table.rows.length+1>1048576||table.headers.length>16384)fail("xlsxLimit");
    const parts=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>'];
    for(let i=0;i<=table.rows.length;i++){
      if(i%250===0){await pause();check();}
      const values=i?table.rows[i-1]:table.headers;
      parts.push(`<row r="${i+1}">`+values.map((value,j)=>{
        const text=String(value??"");if(text.length>32767||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))fail("xlsxCellLimit");
        const ref=column(j)+(i+1);
        // Survey values remain literal text, preserving leading zeros and preventing formulas.
        return typeof value==="number"&&Number.isFinite(value)?`<c r="${ref}"><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
      }).join("")+"</row>");
    }
    parts.push(`</sheetData><autoFilter ref="A1:${column(table.headers.length-1)}${table.rows.length+1}"/></worksheet>`);
    const files={
      "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      "_rels/.rels":'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      "xl/workbook.xml":'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Survey + photos" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/worksheets/sheet1.xml":parts.join("")
    };
    for(const key of Object.keys(files)){await pause();check();files[key]=root.fflate.strToU8(files[key]);}
    check();const bytes=await new Promise((resolve,reject)=>{
      let terminate;const abort=()=>{terminate?.();reject(new DOMException("Cancelled","AbortError"));};
      signal?.addEventListener("abort",abort,{once:true});
      terminate=root.fflate.zip(files,{level:0},(error,value)=>{signal?.removeEventListener("abort",abort);if(error)reject(error);else resolve(value);});
      if(signal?.aborted)abort();
    });check();return new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  }
  root.StorkSurveyPhotoExport={parseCsv,appendIncompleteRatings,enrich,csvBlob,xlsxBlob,photoColumns};
})(typeof window!=="undefined"?window:globalThis);
