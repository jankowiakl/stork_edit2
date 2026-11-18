// Focused export check: real CSV/XLSX writers and router handlers, in-memory DB fixture only.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{Writable}=require('node:stream'),{pathToFileURL}=require('node:url');
const ExcelJS=require('../api/node_modules/exceljs');
class Output extends Writable{
  constructor(){super();this.chunks=[];this.headers={};}
  _write(chunk,encoding,done){this.chunks.push(Buffer.from(chunk));done();}
  type(v){this.headers.type=v;return this;}attachment(v){this.headers.filename=v;return this;}
  get bytes(){return Buffer.concat(this.chunks);}
}
function parseCsv(text){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}return rows;}
(async()=>{
  const writers=await import(pathToFileURL(require.resolve('../api/src/survey-export.js')));
  const photos=new Map([['P1',{id:'P1',filename:'bird_original,"1".jpg',individual_id:'bird',latitude:52,longitude:19,storage_path:'SECRET'}],['P2',{id:'P2',filename:'bird_original,"1".jpg',individual_id:'other',latitude:30,longitude:31}]]);
  const annotations=new Map([['P1',{photo_id:'P1',remarks:'Field observation',fly_ground:'ground',above_ground:0,env_desc_en:'field'}]]);
  const responses=[{id:'R1',campaign_id:'S1',status:'completed',included:true},{id:'R2',campaign_id:'S1',status:'completed',included:false},{id:'R3',campaign_id:'S2',status:'completed',included:true},{id:'R4',campaign_id:'S1',status:'started',included:true}];
  const ratings=[{response_id:'R1',photo_id:'P1',rating:5},{response_id:'R2',photo_id:'P1',rating:3},{response_id:'R3',photo_id:'P2',rating:4},{response_id:'R4',photo_id:'P2',rating:2}];
  const queries=[],db={query:async(sql,params=[])=>{
    if(sql.startsWith('SELECT 1 FROM survey_campaigns'))return{rows:[{}]};
    queries.push(sql);assert.ok(sql.includes("WHERE response.status='completed'"));assert.ok(!sql.includes('response.included=true'));assert.ok(sql.includes('LEFT JOIN photos p ON p.id=rating.photo_id'));
    const enriched=sql.includes('LEFT JOIN photo_annotations annotation ON annotation.photo_id=rating.photo_id');
    assert.ok(!/GROUP BY|DISTINCT|LIMIT/.test(sql));
    return{rows:ratings.flatMap(rating=>{
      const response=responses.find(r=>r.id===rating.response_id);if(response.status!=='completed'||(params.length&&response.campaign_id!==params[0]))return[];
      const photo=photos.get(rating.photo_id),annotation=annotations.get(rating.photo_id);
      const row={survey_id:response.campaign_id,response_id:response.id,photo_id:rating.photo_id,filename:photo?.filename,rating:rating.rating,demographics:{sex:'female',custom_answer:'unchanged'},quality_flags:['all_ratings_identical'],included:response.included,duration:60};
      if(enriched)for(const [alias,source] of Object.entries(writers.SURVEY_PHOTO_COLUMNS)){assert.ok(sql.includes(`${source} AS ${alias}`));const [table,key]=source.split('.');row[alias]=(table==='p'?photo:annotation)?.[key]??null;}
      return[row];
    })};
  }};
  const routes=new Map(),router={};for(const method of ['get','post','put','patch','delete'])router[method]=(path,...handlers)=>routes.set(method+path,handlers);
  const code=fs.readFileSync(require.resolve('../api/src/survey-routes.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function createSurveyRouter','function createSurveyRouter');
  const sandbox={...writers,express:{Router:()=>router},rateLimit:()=>()=>{},authenticateUser:()=>{},requireRole:(...roles)=>({roles}),audit:async()=>{}};
  vm.runInNewContext(code+';this.create=createSurveyRouter;',sandbox);sandbox.create({db});
  for(const campaign of [null,'S1'])for(const format of ['csv','xlsx']){
    const path=campaign?'/api/surveys/:id/export':'/api/survey-results/export-long',handlers=routes.get('get'+path);assert.deepEqual([...handlers[1].roles],['admin','coordinator']);
    const results=[];
    for(const enriched of [false,true]){
      const output=new Output();await handlers.at(-1)({params:{id:campaign},query:{format,includePhotoData:String(enriched)},user:{role:'admin'}},output,error=>{throw error;});
      let headers,rows;
      if(format==='csv'){[headers,...rows]=parseCsv(output.bytes.toString('utf8').replace(/^\uFEFF/,''));}
      else{const book=new ExcelJS.Workbook();await book.xlsx.load(output.bytes);const sheet=book.worksheets[0];headers=sheet.getRow(1).values.slice(1);rows=Array.from({length:sheet.rowCount-1},(_,i)=>headers.map((_,j)=>sheet.getRow(i+2).getCell(j+1).value??''));}
      assert.deepEqual(headers,writers.surveyLongHeaders({includePhotoData:enriched}));assert.equal(rows.length,campaign?2:3);
      for(const row of rows){const item=Object.fromEntries(headers.map((key,i)=>[key,row[i]]));assert.equal(item.filename,photos.get(item.photo_id).filename);if(enriched){assert.equal(item.photo_bird,photos.get(item.photo_id).individual_id);assert.equal(item.photo_remarks,item.photo_id==='P1'?'Field observation':'');assert.equal(JSON.parse(item.demographics).custom_answer,'unchanged');}}
      assert.ok(!headers.some(k=>/path|token|password|created_by|source_payload/.test(k)));assert.ok(output.headers.filename.endsWith(`${enriched?'-with-photos':''}.${format}`));results.push(rows.map(r=>r.slice(0,5)));
    }
    assert.deepEqual(results[0],results[1]);
  }
  assert.ok(!writers.SURVEY_SUMMARY_HEADERS.includes('filename'));
  const schema=fs.readFileSync(require.resolve('../api/src/schema.sql'),'utf8');assert.match(schema,/CREATE TABLE IF NOT EXISTS photos \(\s+id TEXT PRIMARY KEY/);assert.match(schema,/CREATE TABLE IF NOT EXISTS photo_annotations \(\s+photo_id TEXT PRIMARY KEY/);
  console.log('PASS: campaign/global CSV + real XLSX, original filename and ID, enriched fields/demographics, equal row counts, included=false retained, missing annotations blank, primary-key joins, unchanged role guards and Summary headers (in-memory fixture, no DB).');
})().catch(error=>{console.error(error);process.exitCode=1;});
