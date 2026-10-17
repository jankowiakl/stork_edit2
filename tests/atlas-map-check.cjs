// Focused renderer/OOXML checks; no backend or broad browser suite.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const atlas=require('../atlas.js'),zip=require('../vendor/fflate.min.js');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
function readMetadata(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),result={};let cursor=8;
  while(cursor+12<=bytes.length){const size=view.getUint32(cursor),type=Buffer.from(bytes.subarray(cursor+4,cursor+8)).toString();
    let crc=0xffffffff;for(const byte of bytes.subarray(cursor+4,cursor+8+size)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}if(type==='iTXt'){
      assert.equal((crc^0xffffffff)>>>0,view.getUint32(cursor+8+size),'valid metadata CRC');
      const text=Buffer.from(bytes.subarray(cursor+8,cursor+8+size)).toString(),end=text.indexOf('\0');result[text.slice(0,end)]=text.slice(end+5);
    }cursor+=size+12;
  }return result;
}
async function scenario({fail=false,width=2400,abort=false}={}){
  let removed=0,hostsRemoved=0,draws=0,polygons=0,arcs=0,crossOrigin,requestedPhoto,bounds;
  const texts=[],sizes=[],bases=[],insets=[],rects=[];
  const context={fillRect(){throw Error('No footer/background rectangles');},fillText(text){texts.push(text);},strokeText(){},measureText:text=>({width:text.length*10}),save(){},restore(){},clip(){},roundRect(...args){rects.push(args);},beginPath(){},moveTo(){},lineTo(){},closePath(){polygons++;},fill(){},stroke(){},setLineDash(){},arc(){arcs++;},drawImage(image,...args){draws++;if(image.getContext)insets.push(args);}};
  const document={body:{append(){}},createElement(tag){
    if(tag==='canvas')return{width:0,height:0,getContext:()=>context,toBlob(cb){sizes.push([this.width,this.height]);cb(new Blob([png],{type:'image/png'}));}};
    if(tag==='div')return{style:{},setAttribute(){},getBoundingClientRect:()=>({left:-20000,top:0}),remove(){hostsRemoved++;}};
    return{set innerHTML(value){this.textContent=value;},textContent:''};
  }};
  class TileLayer{
    constructor(name){this.options={maxZoom:19};this.events={};this.name=name;}
    on(name,cb){this.events[name]=cb;}off(name){delete this.events[name];}isLoading(){return false;}
    getContainer(){return{querySelectorAll:()=>[{complete:true,naturalWidth:256,getBoundingClientRect:()=>({left:-20000,top:0,width:256,height:256})}]};}
    getAttribution(){return this.name+' provider';}
    addTo(){crossOrigin=this.options.crossOrigin;if(fail)this.events.tileerror();else if(abort)controller.abort();else this.events.load();}
  }
  const map={fitBounds(coords){bounds=coords;},setView(coords){requestedPhoto=coords;},latLngToContainerPoint:([lat,lon])=>({x:lon*10,y:lat*10}),remove(){removed++;}};
  const sandbox={document,Blob,TextEncoder,DOMException,AbortController,setTimeout,clearTimeout,StorkAtlas:atlas,L:{TileLayer,map:()=>map,latLngBounds:x=>x}};sandbox.globalThis=sandbox;
  vm.runInNewContext(fs.readFileSync(require.resolve('../atlas-map.js'),'utf8'),sandbox);
  const controller=new AbortController();
  const options={photo:{filename:'żółć.jpg',bird:'A',captureTime:'2026-01-01T12:00:00Z',lat:52,lon:20},route:{points:[{lat:51,lon:19},{lat:52,lon:20}]},stopovers:{features:[{geometry:{type:'Polygon',coordinates:[[[19,51],[20,51],[20,52],[19,51]]]}}]},settings:{width,extent:'photo',detailBasemap:'satellite',overviewBasemap:'osm',zoom:8,viewportWidth:800},createBaseLayer:key=>{bases.push(key);return new TileLayer(key);},signal:controller.signal,t:key=>key};
  if(fail||abort){await assert.rejects(sandbox.StorkAtlasMap.render(options),fail?/mapTileError/:{name:'AbortError'});assert.equal(draws,0);}
  else{
    const blob=await sandbox.StorkAtlasMap.render(options),bytes=new Uint8Array(await blob.arrayBuffer());
    assert.equal(blob.type,'image/png');assert.deepEqual(sizes,[[width,width*3/4]]);assert.deepEqual(Array.from(requestedPhoto),[52,20]);assert.equal(bounds.length,3);
    assert.deepEqual(bases,['satellite','osm']);assert.equal(draws,3);assert.equal(arcs,2);assert.equal(polygons,2);
    assert.equal(insets.length,1);assert.equal(insets[0][0],width-Math.round(width*.45)-16*width/1200);assert.equal(insets[0][1],16*width/1200);
    assert.equal(rects[0][2],Math.round(width*.45));assert.equal(rects[0][3],Math.round(width*.75*.24));
    assert.ok(texts.every(s=>s.includes('provider')),'only provider credit, no photo/overview labels');
    const metadata=readMetadata(bytes);assert.equal(metadata.SourcePhoto,'żółć.jpg');assert.equal(metadata.Latitude,'52');assert.equal(metadata.Longitude,'20');assert.equal(metadata.CRS,'WGS84 / EPSG:4326');assert.equal(metadata.DetailBasemap,'satellite');assert.equal(metadata.OverviewBasemap,'osm');assert.ok(metadata.MapSource.includes('osm provider'));
    const mapImage={width,height:width*.75,type:'image/png',bytes};
    const parts=atlas.docxParts([{heading:'Atlas',map:mapImage,photo:{width:1,height:1,bytes:new Uint8Array([255,216,255,217])},lines:[],source:'Providers'}],{cover:false});
    const packed=zip.zipSync(Object.fromEntries(Object.entries(parts).map(([key,value])=>[key,typeof value==='string'?zip.strToU8(value):value]))),unpacked=zip.unzipSync(packed);
    assert.deepEqual(unpacked['word/media/image1.png'],bytes,'Word embeds exact PNG, metadata included');assert.ok(parts['[Content_Types].xml'].includes('ContentType="image/png"'));assert.ok(parts['word/_rels/document.xml.rels'].includes('media/image1.png'));assert.equal(readMetadata(unpacked['word/media/image1.png']).SourcePhoto,'żółć.jpg');
  }
  assert.equal(crossOrigin,'anonymous');assert.equal(removed,fail||abort?1:2);assert.equal(hostsRemoved,removed);
}
(async()=>{await scenario();await scenario({width:1200});await scenario({fail:true});await scenario({abort:true});console.log('PASS: composite/inset geometry, independent basemaps, resolution, no footer, Unicode PNG iTXt + CRC, exact PNG in DOCX, tile errors, abort and cleanup (mocked Leaflet/canvas).');})().catch(error=>{console.error(error);process.exitCode=1;});
