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
async function scenario({fail=false,width=2400,abort=false,hideMainRoute=false}={}){
  let removed=0,hostsRemoved=0,draws=0,polygons=0,arcs=0,crossOrigin,requestedPhoto,bounds;
  const texts=[],textPositions=[],sizes=[],bases=[],insets=[],rects=[],strokes=[],fills=[];let path=[],dash=[];
  const context={fillRect(){throw Error('No footer/background rectangles');},fillText(text,x,y){texts.push(text);textPositions.push({x,y,draws});},strokeText(){},measureText:text=>({width:text.length*10}),save(){},restore(){},clip(){},roundRect(...args){rects.push(args);},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){polygons++;},fill(){fills.push({color:this.fillStyle,opacity:this.globalAlpha});},stroke(){strokes.push({color:this.strokeStyle,opacity:this.globalAlpha,weight:this.lineWidth,dash:[...dash],path:[...path]});},setLineDash(value){dash=value;},arc(){arcs++;},drawImage(image,...args){draws++;if(image.getContext)insets.push(args);}};
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
  const baseStyle={stroke:true,weight:2,opacity:.58,lineCap:'round',lineJoin:'round',fill:false},styles={};
  for(const [i,key] of ['follow','overview','gpsFollow','gpsOverview','segmentFollow','segmentOverview','markerFollow','markerOverview','stopFollow','stopOverview'].entries())styles[key]={...baseStyle,color:`test-${key}`,weight:i+1,opacity:(i+1)/10};
  for(const key of ['markerFollow','markerOverview','stopFollow','stopOverview'])Object.assign(styles[key],{fill:true,fillColor:`fill-${key}`,fillOpacity:.16,radius:7});
  styles.gpsFollow.dashArray='5 6';styles.gpsOverview.dashArray='4 5';
  const options={photo:{filename:'żółć.jpg',bird:'A',captureTime:'2026-01-01T12:00:00Z',lat:52,lon:20},route:{points:[{lat:10,lon:5,time:'2025-01-01'},{lat:51,lon:19,time:'2026-01-01'},{lat:52,lon:20,time:'2026-01-02'},{lat:60,lon:30,time:'2026-04-01'}]},stopovers:{features:[{geometry:{type:'Polygon',coordinates:[[[19,51],[20,51],[20,52],[19,51]]]}}]},settings:{width,extent:'photo',detailBasemap:'satellite',overviewBasemap:'osm',zoom:8,viewportWidth:800,styles,inset:{aspect:280/170,margin:12,radius:14},route:!hideMainRoute,segment:true,segmentStart:'2026-01-01',segmentEnd:'2026-01-02',photoTrack:[{lat:51,lon:19},{lat:52,lon:20}]},createBaseLayer:key=>{bases.push(key);return new TileLayer(key);},signal:controller.signal,t:key=>key};
  if(fail||abort){await assert.rejects(sandbox.StorkAtlasMap.render(options),fail?/mapTileError/:{name:'AbortError'});assert.equal(draws,0);}
  else{
    const blob=await sandbox.StorkAtlasMap.render(options),bytes=new Uint8Array(await blob.arrayBuffer());
    assert.equal(blob.type,'image/png');assert.deepEqual(sizes,[[width,width*3/4]]);assert.deepEqual(Array.from(requestedPhoto),[52,20]);assert.equal(bounds.length,7);
    assert.deepEqual(bases,['satellite','osm']);assert.equal(draws,3);assert.equal(arcs,2);assert.equal(polygons,2);
    assert.equal(insets.length,1);assert.equal(insets[0][0],width-Math.round(width*.32)-12*width/800);assert.equal(insets[0][1],12*width/800);
    assert.equal(rects[0][2],Math.round(width*.32));assert.equal(rects[0][3],Math.round(Math.round(width*.32)/(280/170)));
    const overviewGPS=strokes.find(s=>s.color==='test-gpsOverview');assert.deepEqual(overviewGPS.path,[[50,100],[190,510],[200,520],[300,600]],'full GPS survives hidden main route and segment filter');
    assert.equal(strokes.some(s=>s.color==='test-gpsFollow'),!hideMainRoute);
    for(const key of [...(!hideMainRoute?['gpsFollow']:[]),'gpsOverview','segmentFollow','stopFollow','stopOverview','markerFollow','markerOverview']){
      const pos=strokes.findIndex(s=>s.color===styles[key].color),stroke=strokes[pos];assert.ok(stroke,key);
      if(key.startsWith('marker')){assert.equal(stroke.opacity,styles[key].opacity);assert.equal(stroke.weight,styles[key].weight*width/800);assert.notEqual(strokes[pos-1].color,'#14202B');continue;}
      const stop=key.startsWith('stop'),gps=key==='gpsFollow',weight=Math.min(stop?3:gps?4:5,Math.max(stop?2.5:gps?3.25:4,styles[key].weight*1.5));
      assert.equal(stroke.opacity,Math.max(styles[key].opacity,stop||gps ? .85 : .9));assert.equal(stroke.weight,weight*width/1200);
      const casing=strokes[pos-1];assert.equal(casing.color,'#14202B');assert.equal(casing.opacity,.92);assert.equal(casing.weight,(weight+(stop?1.5:3))*width/1200);assert.deepEqual(casing.path,stroke.path);assert.deepEqual(casing.dash,stroke.dash);
    }
    assert.deepEqual(overviewGPS.dash,[12*width/1200,10*width/1200]);assert.ok(overviewGPS.dash[1]>overviewGPS.weight+3*width/1200,'round casing caps leave a visible gap');
    assert.deepEqual(strokes.find(s=>s.color==='test-segmentFollow').path,[[190,510],[200,520]],'main map segment is unchanged');
    assert.equal(strokes.some(s=>s.color==='test-segmentOverview'||s.color==='test-overview'),false,'overview has no segment or photo-connecting lines');
    assert.deepEqual(strokes.filter(s=>s.color?.startsWith('test-')).map(s=>s.color),['test-stopFollow',...(!hideMainRoute?['test-gpsFollow']:[]),'test-segmentFollow','test-markerFollow','test-stopOverview','test-gpsOverview','test-markerOverview']);
    assert.ok(fills.some(f=>f.color==='fill-stopFollow'&&f.opacity===.16));
    assert.ok(texts.every(s=>s.includes('provider')),'only provider credit, no photo/overview labels');
    assert.equal(texts.length,1,'one combined provider credit, none in inset');assert.ok(textPositions.every(p=>p.draws===3&&p.y>width*.7));
    assert.equal(sandbox.StorkAtlasMap.sourceFor(blob),'satellite provider • osm provider','full provider attribution is available for Word caption');
    const metadata=readMetadata(bytes);assert.equal(metadata.SourcePhoto,'żółć.jpg');assert.equal(metadata.Latitude,'52');assert.equal(metadata.Longitude,'20');assert.equal(metadata.CRS,'WGS84 / EPSG:4326');assert.equal(metadata.DetailBasemap,'satellite');assert.equal(metadata.OverviewBasemap,'osm');assert.ok(metadata.MapSource.includes('osm provider'));
    const mapImage={width,height:width*.75,type:'image/png',bytes};
    const parts=atlas.docxParts([{heading:'Atlas',map:mapImage,photo:{width:1,height:1,bytes:new Uint8Array([255,216,255,217])},lines:[],source:'Providers'}],{cover:false});
    const packed=zip.zipSync(Object.fromEntries(Object.entries(parts).map(([key,value])=>[key,typeof value==='string'?zip.strToU8(value):value]))),unpacked=zip.unzipSync(packed);
    assert.deepEqual(unpacked['word/media/image1.png'],bytes,'Word embeds exact PNG, metadata included');assert.ok(parts['[Content_Types].xml'].includes('ContentType="image/png"'));assert.ok(parts['word/_rels/document.xml.rels'].includes('media/image1.png'));assert.equal(readMetadata(unpacked['word/media/image1.png']).SourcePhoto,'żółć.jpg');
  }
  assert.equal(crossOrigin,'anonymous');assert.equal(removed,fail||abort?1:2);assert.equal(hostsRemoved,removed);
}
(async()=>{await scenario();await scenario({width:1200,hideMainRoute:true});await scenario({fail:true});await scenario({abort:true});console.log('PASS: export casing/opacity/width, matching dash geometry with gaps, unchanged polygon fill/markers, full overview route, single combined credit, PNG metadata and exact PNG bytes in DOCX, abort/cleanup (mocked Leaflet/canvas).');})().catch(error=>{console.error(error);process.exitCode=1;});
