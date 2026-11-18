// Focused frontend export fixture. No real API or database.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ExcelJS=require('../api/node_modules/exceljs'),fflate=require('../vendor/fflate.min.js');
const context={Blob,DOMException,AbortController,setTimeout,fflate};vm.runInNewContext(fs.readFileSync(require.resolve('../survey-photo-export.js'),'utf8'),context);
const exporter=context.StorkSurveyPhotoExport,headers=['survey_id','response_id','photo_id','rating','sex','year_of_birth','started_at','completed_at','duration','quality_flags','included'];
const rows=Array.from({length:30},(_,i)=>['S','complete',`P${i}`,String(i%5+1),'female','1990','start','end','60','original_flag','true']);
const base={headers,rows:[...rows,rows[0]]};
const detail={id:'partial',status:'started',demographics:{sex:'male',year_of_birth:1985},startedAt:'2026-11-18T10:00:00Z',completedAt:null,duration:null,qualityFlags:['incomplete'],included:false,photos:Array.from({length:30},(_,i)=>({id:`P${i}`,filename:`P${i}.jpg`,rating:i<5?i+1:null}))};
detail.photos.push({...detail.photos[0]},...['',0,6,2.5,true].map((rating,i)=>({id:'invalid'+i,rating})));
function fixture(fail=false){
  const calls=new Map();let concurrent=0,peak=0;
  const request=async(url)=>{
    calls.set(url,(calls.get(url)||0)+1);concurrent++;peak=Math.max(peak,concurrent);await new Promise(r=>setTimeout(r,1));concurrent--;
    if(fail&&url.endsWith('/responses/partial'))return{ok:false,status:503};
    let data;if(url==='/api/surveys')data={campaigns:[{id:'S'},{id:'T'}]};
    else if(url==='/api/surveys/S/results')data={responses:[{id:'complete',status:'completed'},{id:'partial',status:'started'},{id:'empty',status:'started'}]};
    else if(url==='/api/surveys/T/results')data={responses:[{id:'just-completed',status:'completed'}]};
    else if(url.endsWith('/responses/partial'))data={response:detail};
    else if(url.endsWith('/responses/empty'))data={response:{...detail,id:'empty',photos:[{id:'P0',rating:null}]}};
    else if(url.endsWith('/responses/just-completed'))data={response:{...detail,id:'just-completed',status:'completed',completedAt:'2026-11-18T10:05:00Z',duration:300,photos:[{id:'P0',rating:4}]}};
    else if(url.startsWith('/api/photos/')){const id=url.split('/').at(-1);data={photo:{id,filename:id+'.jpg',annotation:{Remarks:'Test'}}};}
    else throw Error(url);
    return{ok:true,json:async()=>data};
  };return{request,calls,get peak(){return peak;}};
}
(async()=>{
  for(const campaignId of ['S',null]){
    const api=fixture(),progress=[];const table=await exporter.appendIncompleteRatings(base,{request:api.request,campaignId,onProgress:p=>progress.push(p)});
    const get=(row,key)=>row[table.headers.indexOf(key)],byResponse=id=>table.rows.filter(row=>get(row,'response_id')===id);
    assert.equal(byResponse('complete').length,30);assert.equal(byResponse('partial').length,5);assert.equal(byResponse('empty').length,0);assert.equal(table.rows.length,campaignId?35:36);
    assert.equal(new Set(table.rows.map(row=>JSON.stringify([get(row,'response_id'),get(row,'photo_id')]))).size,table.rows.length);
    assert.ok(byResponse('partial').every(row=>get(row,'response_status')==='started'&&get(row,'included')===false&&get(row,'completed_at')===''&&get(row,'duration')===''&&get(row,'sex')==='male'));
    assert.ok(byResponse('complete').every(row=>get(row,'response_status')==='completed'));
    for(let i=0;i<30;i++)assert.deepEqual(headers.map(key=>get(table.rows[i],key)),rows[i]);
    assert.ok([...api.calls.values()].every(n=>n===1));assert.ok(api.peak<=4);assert.equal(api.calls.has('/api/surveys'),!campaignId);assert.ok(!api.calls.has('/api/surveys/S/responses/complete'));assert.equal(progress.at(-1).done,progress.at(-1).total);
    for(const filenameOnly of [true,false]){
      const merged=await exporter.enrich(table,{request:api.request,filenameOnly});const csv=await exporter.parseCsv(await (await exporter.csvBlob(merged)).text());
      const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await (await exporter.xlsxBlob(merged)).arrayBuffer()));const sheet=book.worksheets[0];assert.equal(sheet.rowCount,table.rows.length+1);
      assert.deepEqual(sheet.getRow(1).values.slice(1),[...csv.headers]);
      for(let i=0;i<csv.rows.length;i++)for(let j=0;j<csv.headers.length;j++)assert.equal(String(sheet.getRow(i+2).getCell(j+1).value??''),csv.rows[i][j]);
      assert.equal(csv.rows.length,table.rows.length);assert.equal(csv.headers.filter(k=>k==='response_status').length,1);
    }
  }
  await assert.rejects(exporter.appendIncompleteRatings(base,{request:fixture(true).request,campaignId:'S'}),/503/);
  const abort=new AbortController();abort.abort();await assert.rejects(exporter.appendIncompleteRatings(base,{request:fixture().request,signal:abort.signal,check:()=>abort.signal.throwIfAborted()}),{name:'AbortError'});
  // Actual download coordinator must show an error, not save a partial file.
  let saved=0;class Element{constructor(){this.children=[];this.events={};}append(...items){this.children.push(...items);}setAttribute(){}removeAttribute(){}addEventListener(k,fn){this.events[k]=fn;}showModal(){this.open=true;}close(){this.open=false;}click(){saved++;}remove(){}}
  const document={body:new Element(),createElement:()=>new Element()};context.document=document;context.URL={createObjectURL:()=> 'blob:test',revokeObjectURL(){}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../survey-download.js'),'utf8'),context);
  const csvBlob=await exporter.csvBlob(base),bad=fixture(true);
  const download=context.StorkSurveyDownload.create({request:async(url,options)=>url==='/base'?new Response(csvBlob):bad.request(url,options),t:key=>key,userId:()=> 'user'});
  await download.download({url:'/base',filename:'test.csv',label:'surveyExport.long',format:'csv',filenameOnly:true,campaignId:'S'});
  assert.equal(saved,0);assert.match(document.body.children[0].children[2].textContent,/surveyExport.error.*503/);
  for(const name of ['survey-photo-export.js','survey-download.js','app-i18n.js','sw.js'])new vm.Script(fs.readFileSync(require.resolve('../'+name),'utf8'));
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=/.test(match[1])&&match[2].trim())new vm.Script(match[2]);
  console.log('PASS: completed 30, started 5, unrated 0; excluded ratings retained; pair deduplication; campaign/global and both Long variants share CSV/XLSX rows/status; late completion; request limits; abort and failed detail prevents download; syntax. Mock API only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
