// Focused frontend workflows with fake DOM/media; no API, database or browser suite.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),fflate=require('../vendor/fflate.min.js');
const source=fs.readFileSync(require.resolve('../atlas.js'),'utf8'),html=fs.readFileSync(require.resolve('../index.html'),'utf8');
for(const file of ['atlas.js','app-i18n.js','sw.js'])new vm.Script(fs.readFileSync(require.resolve('../'+file),'utf8'),{filename:file});
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=/.test(match[1])&&match[2].trim())new vm.Script(match[2]);
const nodes=[],downloads=[],urls=new Map(),listeners=[],calls=[],maps=[];let user='user-A',canAccess=true,rating=true;
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.dataset={};this.events={};this.open=false;this.value='';}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,fn){this.events[k]=fn;}
  showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}focus(){}remove(){}add(o){this.children.push(o);}
  querySelector(){return null;}getBoundingClientRect(){return{left:10,top:10,right:350,bottom:400};}
  click(){if(this.tagName==='a')downloads.push({name:this.download,blob:urls.get(this.href)});}
  getContext(){return{fillRect(){},drawImage(){}};}toBlob(cb){cb(new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}));}
}
const document={body:{append(node){nodes.push(node);}},createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
const i18n={language:'en',t:(key,vars)=>key+(vars?JSON.stringify(vars):''),onChange:fn=>listeners.push(fn)},storage=new Map();
const sandbox={document,window:{StorkAppI18n:i18n,fflate,StorkAtlasMap:{sourceFor:()=> 'Provider attribution'}},Blob,Uint8Array,TextEncoder,TextDecoder,AbortController,DOMException,Option:class{constructor(label,value){this.textContent=label;this.value=value;}},
  URL:{createObjectURL:blob=>{const id='blob:'+urls.size;urls.set(id,blob);return id;},revokeObjectURL(){}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  setTimeout:(fn,ms)=>{if(!ms)fn();return 0;},createImageBitmap:async()=>({width:640,height:480,close(){}})
};
vm.runInNewContext(source,sandbox);const atlas=sandbox.StorkAtlas;
const all=node=>[node,...node.children.flatMap(child=>child.children?all(child):[])],button=(dialog,key)=>{const b=all(dialog).find(n=>n.tagName==='button'&&n.textContent==='atlas.'+key);assert.ok(b,key);return b;};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const adapter={userId:()=>user,canAccess:()=>canAccess,requestLogin(){},beforeOpen(){throw Error('must not close editor');},selectionChanged(){throw Error('must not reset Atlas selection');},
  api:async(url,options={},raw)=>{calls.push({url,options});if(url.includes('/survey-results/'))return{total:rating?1:0,photos:rating?[{id:'B',averageSurveyRating:4.7,surveyRatingCount:23}]:[]};
    if(url.endsWith('/download'))return{headers:{get:()=> 'image/jpeg'},blob:async()=>new Blob(['ORIGINAL'],{type:'image/jpeg'})};
    if(url.includes('/route'))return{individualId:'Bird-B',points:[{lat:52,lon:19}]};if(url.endsWith('/stopovers'))return{features:[]};
    return{photo:{id:'B',filename:'Bird-B_20260101.jpg',bird:'Bird-B',lat:52,lon:19,annotation:{Remarks:'saved note'}}};},
  mapSettings:()=>({basemap:'satellite',width:2400,zoom:8,viewportWidth:800}),basemapOptions:()=>[{value:'satellite',label:'Satellite'},{value:'osm',label:'OSM'}],
  renderMap:async options=>{maps.push(options);return new Blob([png],{type:'image/png'});}
};
(async()=>{
  // Use the displayed ID even while collectionDisplayedPoint / details still refer to A.
  const classes=new Set(['collectionMode']),viewer={document:{body:{classList:{contains:x=>classes.has(x)}}},socialPhotoId:'B',currentPhotoDetails:{id:'A',filename:'old.jpg',imageUrl:'old'},collectionDisplayedPoint:{photoId:'A'},collectionSequence:[{id:'B',filename:'original.jpg',imageUrl:'signed-B'}],photoSafeViewerContext:{readOnly:true},editorHasConnection:()=>true};
  vm.runInNewContext(html.slice(html.indexOf('  const currentViewerDownload='),html.indexOf('  const renderPhotoDownload='))+'this.target=currentViewerDownload;',viewer);
  assert.equal(viewer.target().photoId,'B');assert.equal(viewer.target().remoteUrl,'signed-B');assert.equal(viewer.target().filename,'original.jpg');classes.add('surveyMode');assert.equal(viewer.target(),null);
  // Original filenames take precedence over a generic Content-Disposition name.
  const original=new Blob(['ORIGINAL']),downloadContext={document:{...document,body:{appendChild(){}}},URL:sandbox.URL,setTimeout:sandbox.setTimeout,apiFetch:async()=>({headers:{get:()=> 'attachment; filename="generic.jpg"'},blob:async()=>original})};
  vm.runInNewContext(html.slice(html.indexOf('  const downloadApiFile='),html.indexOf('  const downloadRemoteImage='))+'this.save=downloadApiFile;',downloadContext);
  await downloadContext.save('/api/photos/B/download','original.jpg',true);assert.equal(downloads.at(-1).name,'original.jpg');assert.equal(downloads.at(-1).blob,original);
  const lookupCalls=[];const found=await atlas.findSurveyRating(async url=>{lookupCalls.push(url);return url.includes('page=1&')?{total:101,photos:Array.from({length:100},(_,i)=>({id:'other-'+i,averageSurveyRating:5}))}:{total:101,photos:[{id:'exact',averageSurveyRating:4.2,surveyRatingCount:12}]};},'exact');assert.equal(found.averageSurveyRating,4.2);assert.equal(lookupCalls.length,2);
  await assert.rejects(atlas.findSurveyRating(async()=>{throw Error('403');},'exact'),/403/);
  assert.equal(atlas.uniqueNames([{filename:'original.jpg',averageSurveyRating:null,surveyRatingCount:0}])[0],'bez_oceny_original.jpg');
  const basic=[],advanced=[],menu=atlas.createDownloadMenu({userId:()=>user,advancedReason:s=>s.readOnly?'Read-only':'',download:async s=>basic.push(s),advanced:s=>advanced.push(s)}),menuDialog=nodes.at(-1);
  const target={photoId:'A',filename:'original.jpg'};menu.open(target);target.photoId='B';await button(menuDialog,'downloadPhoto').onclick();assert.equal(basic[0].photoId,'A');assert.equal(basic[0].filename,'original.jpg');
  menu.open({photoId:'B'});button(menuDialog,'advanced').onclick();assert.equal(advanced[0].photoId,'B');
  menu.open({remoteUrl:'signed',readOnly:true});assert.equal(button(menuDialog,'advanced').disabled,true);assert.equal(button(menuDialog,'downloadPhoto').disabled,false);menuDialog.events.click({target:menuDialog,clientX:0,clientY:0});assert.equal(menuDialog.open,false);
  const exporter=atlas.create(adapter,{singlePhoto:true}),dialog=nodes.at(-1);await exporter.openSingle('B');assert.equal(exporter.snapshot.photos[0].id,'B');
  assert.equal(all(dialog).filter(n=>n.tagName==='input'&&n.type==='checkbox').length,14);
  const selects=all(dialog).filter(n=>n.tagName==='select');selects[1].value='osm';selects[1].onchange();assert.equal(JSON.parse(storage.get('storkAtlasMapExportV1')).overviewBasemap,'osm');
  await button(dialog,'ratedPhoto').onclick();assert.equal(downloads.at(-1).name,'4.7_Bird-B_20260101.jpg');assert.equal(await downloads.at(-1).blob.text(),'ORIGINAL');
  await button(dialog,'mapSingle').onclick();assert.equal(downloads.at(-1).name,'4.7_Bird-B_20260101.jpg.map.png');assert.equal(maps.at(-1).settings.overviewBasemap,'osm');assert.equal(maps.at(-1).photo.id,'B');
  await button(dialog,'singleWord').onclick();assert.equal(downloads.at(-1).name,'4.7_Bird-B_20260101.docx');
  const unzipped=fflate.unzipSync(new Uint8Array(await downloads.at(-1).blob.arrayBuffer())),xml=fflate.strFromU8(unzipped['word/document.xml']);assert.ok(!xml.includes('w:type="page"'),'no cover page');assert.ok(xml.includes('landscape'));assert.ok(xml.includes('saved note'));assert.ok(xml.includes('Provider attribution'));assert.deepEqual(Buffer.from(unzipped['word/media/image1.png']),png);
  rating=false;await exporter.openSingle('B');assert.ok(all(dialog).some(n=>n.textContent==='atlas.noSurveyRating'));await button(dialog,'ratedPhoto').onclick();assert.equal(downloads.at(-1).name,'bez_oceny_Bird-B_20260101.jpg');
  user='user-B';exporter.enforceAccess();assert.ok(!all(dialog).some(n=>n.textContent==='Bird-B_20260101.jpg'),'old account data hidden');
  assert.ok(html.includes('openPhotoDownloadMenu(currentViewerDownload(),photoDownloadPhotoBtn)'));assert.ok(html.includes('filename:editorLookupFilename(point)},editorDownloadPhotoBtn)'));assert.ok(html.includes('filename:row.dataset.filename},button)'));assert.ok(html.includes('filename:photo?.filename},button)'));
  console.log('PASS: syntax; shared menu actions/target snapshot/read-only restriction; exact survey ID + pagination/no-rating/error; shared settings; original bytes with rating prefix; standalone PNG; single-page DOCX with same PNG and caption; account isolation; four download entry points (simulated DOM/media/API).');
})().catch(error=>{console.error(error);process.exitCode=1;});
