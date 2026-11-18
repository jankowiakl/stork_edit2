// Frontend-only join and actual XLSX readback. No network or database.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fflate=require('../vendor/fflate.min.js'),ExcelJS=require('../api/node_modules/exceljs');
const sandbox={Blob,DOMException,setTimeout,fflate};vm.runInNewContext(fs.readFileSync(require.resolve('../survey-photo-export.js'),'utf8'),sandbox);
const exporter=sandbox.StorkSurveyPhotoExport;
(async()=>{
  const original='\uFEFFsurvey_id,response_id,photo_id,rating,demographics,quality_flags,included\r\nS,R1,A,5,"{""uwagi"":""Łąka, drzewa""}",,true\r\nS,R2,A,4,"linia 1\r\nlinia ""2""",,false\r\nS,R3,B,3,0012,,true\r\nS,R4,missing,2,,,true\r\nS,R5,wrong,1,,,true\r\nS,R6,C,5,,,true\r\nS,R7,D,5,,,true\r\nS,R8,E,5,,,true\r\n';
  const table=await exporter.parseCsv(original),calls=new Map();let active=0,peak=0,last;
  const request=async url=>{
    const id=decodeURIComponent(url.split('/').at(-1));calls.set(id,(calls.get(id)||0)+1);active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;
    if(id==='missing')return{ok:false,status:403};
    return{ok:true,json:async()=>({photo:{id:id==='wrong'?'another-id':id,filename:'ten_sam_plik,"ą".jpg',bird:id,lat:0,lon:19,altitudeM:20,elevationM:10,gpsTime:'2026-11-18T10:00:00Z',country:'Polska',geoDescription:'Miejsce',filePath:'SECRET',imageUrl:'TOKEN',annotation:{Remarks:'Pole, "mokre"\r\nŁąka _x0041_',Env_desc_en:'field',Above_ground:0,Fly_ground:'ground',Spec1_name:'Ciconia ciconia'}}})};
  };
  const merged=await exporter.enrich(table,{request,onProgress:p=>{last=p;}});
  assert.equal(merged.rows.length,table.rows.length);assert.equal(merged.rows.length,8);assert.equal(calls.size,7);assert.ok([...calls.values()].every(n=>n===1));assert.ok(peak<=4&&peak>1);assert.equal(last.matched,5);assert.equal(merged.missing,2);
  const at=(i,key)=>merged.rows[i][merged.headers.indexOf(key)];
  for(let i=0;i<table.rows.length;i++)assert.deepEqual([...merged.rows[i].slice(0,table.headers.length)],[...table.rows[i]]);
  assert.equal(at(0,'photo_bird'),'A');assert.equal(at(2,'photo_bird'),'B');assert.equal(at(0,'filename'),'ten_sam_plik,"ą".jpg');assert.equal(at(3,'filename'),'');assert.equal(at(4,'photo_bird'),'');assert.equal(at(0,'photo_above_ground'),0);assert.equal(at(0,'photo_lat'),0);assert.ok(!merged.headers.includes('filePath'));
  const csv=await exporter.csvBlob(merged),roundtrip=await exporter.parseCsv(await csv.text());assert.deepEqual([...roundtrip.headers],[...merged.headers]);
  for(let i=0;i<merged.rows.length;i++)assert.deepEqual([...roundtrip.rows[i]],[...merged.rows[i]].map(String));
  const xlsx=await exporter.xlsxBlob(merged),book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await xlsx.arrayBuffer()));const sheet=book.worksheets[0];assert.equal(sheet.rowCount,9);
  for(let i=0;i<merged.rows.length;i++)for(let j=0;j<merged.headers.length;j++)assert.equal(String(sheet.getRow(i+2).getCell(j+1).value??''),String(merged.rows[i][j]));
  const withFilename=await exporter.parseCsv('photo_id,filename,rating\nA,wrong-old-name.jpg,5'),updated=await exporter.enrich(withFilename,{request});assert.equal(updated.headers.filter(k=>k==='filename').length,1);assert.equal(updated.rows[0][1],'ten_sam_plik,"ą".jpg');
  // Standard Long adds ONLY filename, immediately after photo_id, in both formats.
  const names=await exporter.enrich(table,{request,filenameOnly:true});
  assert.deepEqual([...names.headers],['survey_id','response_id','photo_id','filename','rating','demographics','quality_flags','included']);
  const namesCsv=await exporter.parseCsv(await (await exporter.csvBlob(names)).text()),namesBook=new ExcelJS.Workbook();
  await namesBook.xlsx.load(Buffer.from(await (await exporter.xlsxBlob(names)).arrayBuffer()));
  const namesSheet=namesBook.worksheets[0];assert.deepEqual(namesSheet.getRow(1).values.slice(1),[...names.headers]);assert.equal(namesSheet.rowCount,table.rows.length+1);
  for(let i=0;i<table.rows.length;i++){
    assert.equal(namesCsv.rows[i][3],merged.rows[i][merged.headers.indexOf('filename')]);
    for(let j=0;j<names.headers.length;j++)assert.equal(namesSheet.getRow(i+2).getCell(j+1).value??'',namesCsv.rows[i][j]);
    assert.deepEqual([...namesCsv.rows[i].slice(0,3),...namesCsv.rows[i].slice(4)],[...table.rows[i]]);
  }
  const misplaced=await exporter.enrich(await exporter.parseCsv('filename,rating,photo_id\nold.jpg,5,A'),{filenameOnly:true,request:async()=>({ok:true,json:async()=>({photo:{id:'A',filename:'original.jpg',get annotation(){throw Error('must not inspect annotation');}}})})});
  assert.deepEqual([...misplaced.headers],['rating','photo_id','filename']);assert.deepEqual([...misplaced.rows[0]],['5','A','original.jpg']);
  const empty=await exporter.enrich(await exporter.parseCsv('photo_id,rating\r\n'),{request});assert.equal(empty.rows.length,0);
  await assert.rejects(exporter.parseCsv('photo_id,rating\nA,"unfinished'),/invalidCsv/);
  const controller=new AbortController();controller.abort();await assert.rejects(exporter.enrich(table,{request,signal:controller.signal,check:()=>controller.signal.throwIfAborted()}),{name:'AbortError'});
  for(const name of ['survey-photo-export.js','survey-download.js','app-i18n.js','sw.js'])new vm.Script(fs.readFileSync(require.resolve('../'+name),'utf8'),{filename:name});
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=/.test(match[1])&&match[2].trim())new vm.Script(match[2]);
  assert.ok(!html.includes('includePhotoData=true'));assert.ok(html.includes('format=${withPhotos||filenameOnly?"csv":format}'));assert.ok(html.includes('filenameOnly=type==="long"'));
  console.log('PASS: exact ID joins, one request/photo and max 4 concurrent, unchanged 8 survey rows, names + scientific fields, missing/mismatched IDs retained and warned, quoted/multiline/Polish CSV roundtrip, real XLSX readback, empty/existing filename/abort, syntax and CSV source for both scopes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
