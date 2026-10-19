// Exercise the actual Word export workflow with simulated media sizes, no API/network.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const atlas=require('../atlas.js'),source=fs.readFileSync(require.resolve('../atlas.js'),'utf8');
new vm.Script(source);new vm.Script(fs.readFileSync(require.resolve('../app-i18n.js'),'utf8'));
const start=source.indexOf('    async function exportWord()'),end=source.indexOf('    function render()',start);
assert.ok(start>0&&end>start);
const MB=1024*1024;
async function run(count,{mapSize=3*MB,extra=0,failAt=-1}={}){
  const files=[],photos=Array.from({length:count},(_,i)=>({id:String(i),bird:'A',filename:`photo-${i}.jpg`}));let context;
  const state={snapshot:{photos,createdAt:'2026-10-19'},controller:{signal:{}},LIMIT:192*MB,TextEncoder,
    // Media buffers report their real-world sizes without allocating hundreds of MiB in a test.
    Uint8Array:class{constructor(buffer){this.length=this.byteLength=buffer.byteLength;}},
    wordOptions:{number:true,titlePage:true},t:(key,vars={})=>`${key} ${JSON.stringify(vars)}`,date:x=>x,summaryLines:()=>[],
    numeric:x=>x!=null&&Number.isFinite(Number(x)),located:()=>false,check(){},notify(){},yieldUI:async()=>{},render(){},progressText:'',
    mapExportContext:()=>({warnings:[]}),adapter:{api:async url=>{const id=Number(url.split('/')[3]);if(id===failAt)throw Error('network unavailable');return{photo:{...photos[id],annotation:{}}};}},
    mapForPhoto:async()=>({width:2400,height:1800,blob:{arrayBuffer:async()=>({byteLength:mapSize})},source:'Map providers'}),
    imageBlob:async()=>null,raster:async()=>({width:1000,height:750,bytes:{length:MB,byteLength:MB}}),
    docxParts:(pages,options)=>{const parts=atlas.docxParts(pages,options);if(extra)parts['word/extra.xml']={byteLength:extra*pages.length};return parts;},
    archive:async(parts,name)=>{const size=Object.values(parts).reduce((n,v)=>n+(typeof v==='string'?new TextEncoder().encode(v).length:v.byteLength),0);assert.ok(size<=192*MB);files.push({name,xml:parts['word/document.xml']});},
    job:async fn=>{try{await fn();}catch(error){context.progressText=error.message;}}
  };
  context=vm.createContext(state);vm.runInContext(source.slice(start,end)+'\nthis.runExport=exportWord;',context);await context.runExport();
  const indices=files.flatMap(f=>[...f.xml.matchAll(/Atlas • (\d+) \/ (\d+)/g)].map(m=>Number(m[1])));
  return{files,indices,message:context.progressText};
}
(async()=>{
  const small=await run(2);assert.equal(small.files.length,1);assert.equal(small.files[0].name,'atlas.docx');assert.deepEqual(small.indices,[1,2]);
  const large=await run(100);assert.equal(large.files.length,5);assert.deepEqual(large.indices,Array.from({length:100},(_,i)=>i+1));assert.equal(large.files[0].name,'atlas-part-001-photos-001-024.docx');assert.equal(large.files.at(-1).name,'atlas-part-005-photos-097-100.docx');assert.ok(large.files.every(f=>f.xml.includes('wordPart')));
  const xmlHeavy=await run(4,{extra:60*MB});assert.equal(xmlHeavy.files.length,2);assert.deepEqual(xmlHeavy.indices,[1,2,3,4]);
  const huge=await run(1,{mapSize:193*MB});assert.equal(huge.files.length,0);assert.match(huge.message,/wordSingleTooLarge/);
  const interrupted=await run(100,{failAt:30});assert.equal(interrupted.files.length,1);assert.deepEqual(interrupted.indices,Array.from({length:24},(_,i)=>i+1));assert.match(interrupted.message,/network unavailable.*wordPartial/);
  console.log('PASS: syntax; small single DOCX; 100-photo automatic split, ordered ranges/no duplicates; actual package-size fallback; oversized single page; partial-export error. Media/API simulated.');
})().catch(error=>{console.error(error);process.exitCode=1;});
