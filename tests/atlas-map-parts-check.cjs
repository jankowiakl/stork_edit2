// Focused map ZIP batching test, with simulated large PNG sizes (no API or tiles).
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const atlas=require('../atlas.js'),source=fs.readFileSync(require.resolve('../atlas.js'),'utf8'),MB=1024*1024;
new vm.Script(source);new vm.Script(fs.readFileSync(require.resolve('../app-i18n.js'),'utf8'));
const start=source.indexOf('    async function exportMaps('),end=source.indexOf('    async function exportWord()',start);
assert.ok(start>0&&end>start);
async function run(count,{single=false,size=3*MB,failAt=-1}={}){
  const photos=Array.from({length:count},(_,i)=>({id:String(i),bird:'A',filename:'same.jpg',averageSurveyRating:4.7,surveyRatingCount:20})),files=[],downloads=[];
  let context;
  const state={snapshot:{photos},mapPhotoIndex:count-1,LIMIT:192*MB,TextEncoder,uniqueNames:atlas.uniqueNames,manifest:atlas.manifest,
    Uint8Array:class{constructor(buffer){this.byteLength=buffer.byteLength;this.photoId=buffer.id;}},
    mapExportContext:()=>({settings:{width:2400},warnings:[]}),
    mapForPhoto:async(photo,ctx)=>{if(Number(photo.id)===failAt)throw Error('network unavailable');ctx.warnings.push(`warning-${photo.id}`);return{blob:{size,arrayBuffer:async()=>({byteLength:size,id:photo.id})}};},
    t:(key,vars)=>`${key} ${JSON.stringify(vars)}`,check(){},notify(){},yieldUI:async()=>{},render(){},progressText:'',
    download:(blob,name)=>downloads.push({blob,name}),
    archive:async(parts,name)=>{const bytes=Object.values(parts).reduce((n,v)=>n+(typeof v==='string'?new TextEncoder().encode(v).byteLength:v.byteLength),0);assert.ok(bytes<=192*MB);files.push({parts,name});},
    job:async fn=>{try{await fn();}catch(error){context.progressText=error.message;}}
  };
  context=vm.createContext(state);vm.runInContext(source.slice(start,end)+'\nthis.runExport=exportMaps;',context);await context.runExport(single);
  const ids=[];
  for(const {parts} of files){
    const rows=parts['atlas_manifest.csv'].split('\r\n').slice(1),maps=Object.entries(parts).filter(([name])=>name.endsWith('.map.png'));
    assert.equal(rows.length,maps.length);assert.equal(JSON.parse(parts['atlas_map_settings.json']).width,2400);
    const warnings=parts['atlas_map_warnings.txt'].split('\n');assert.equal(warnings.length,maps.length);
    maps.forEach(([name,png],i)=>{const cells=rows[i].split(',').map(x=>x.replace(/^"|"$/g,''));assert.equal(cells[0],String(Number(png.photoId)+1));assert.equal(cells.at(-1),name);assert.equal(warnings[i],`warning-${png.photoId}`);ids.push(Number(png.photoId));});
  }
  return{files,downloads,ids,message:context.progressText};
}
(async()=>{
  const small=await run(2);assert.equal(small.files.length,1);assert.equal(small.files[0].name,'atlas-maps.zip');
  const large=await run(100);assert.equal(large.files.length,4);assert.deepEqual(large.ids,Array.from({length:100},(_,i)=>i));assert.equal(large.files[0].name,'atlas-maps-part-001-photos-001-032.zip');assert.equal(large.files[3].name,'atlas-maps-part-004-photos-097-100.zip');assert.ok(large.files[1].parts['4.7_same_33.jpg.map.png'],'collision-safe names remain global across parts');
  const single=await run(100,{single:true});assert.equal(single.files.length,0);assert.equal(single.downloads[0].name,'4.7_same_100.jpg.map.png');
  const interrupted=await run(100,{failAt:35});assert.equal(interrupted.files.length,1);assert.equal(interrupted.ids.length,32);assert.match(interrupted.message,/network unavailable.*mapsPartial/);
  const huge=await run(1,{size:193*MB});assert.equal(huge.files.length,0);assert.match(huge.message,/mapSingleTooLarge/);
  console.log('PASS: syntax; 100-map ZIP split, order/no duplicates, global collision-safe names/CSV positions, per-part settings/warnings, small ZIP, unchanged single PNG, partial failure and oversized image. Media simulated.');
})().catch(error=>{console.error(error);process.exitCode=1;});
