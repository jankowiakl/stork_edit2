// Small renderer contract check. Real provider CORS is still enforced by the browser.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const atlas=require('../atlas.js');
async function scenario(fail=false){
  let removed=0,hostsRemoved=0,draws=0,polygons=0,arcs=0,crossOrigin,requestedPhoto;
  const context={fillRect(){},fillText(){},beginPath(){},moveTo(){},lineTo(){},closePath(){polygons++;},fill(){},stroke(){},setLineDash(){},arc(){arcs++;},drawImage(){draws++;}};
  const host={style:{},setAttribute(){},getBoundingClientRect:()=>({left:-10000,top:0}),remove(){hostsRemoved++;}};
  const canvas={getContext:()=>context,toBlob:cb=>cb(new Blob(['png'],{type:'image/png'}))};
  const document={body:{append(){}},createElement(tag){return tag==='canvas'?canvas:tag==='div'?host:{set innerHTML(value){this.textContent=value;},textContent:''};}};
  class TileLayer{
    constructor(){this.options={maxZoom:19};this.events={};}
    on(name,cb){this.events[name]=cb;}
    off(name){delete this.events[name];}
    isLoading(){return false;}
    getContainer(){return{querySelectorAll:()=>[{complete:true,naturalWidth:256,getBoundingClientRect:()=>({left:-10000,top:0,width:256,height:256})}]};}
    getAttribution(){return 'Map provider';}
    addTo(){crossOrigin=this.options.crossOrigin;if(fail)this.events.tileerror();else this.events.load();}
  }
  const map={fitBounds(){},setView(coords){requestedPhoto=coords;},latLngToContainerPoint:([lat,lon])=>({x:lon*10,y:lat*10}),remove(){removed++;}};
  const sandbox={document,Blob,DOMException,AbortController,setTimeout,clearTimeout,StorkAtlas:atlas,L:{TileLayer,map:()=>map,latLngBounds:x=>x}};sandbox.globalThis=sandbox;
  vm.runInNewContext(fs.readFileSync(require.resolve('../atlas-map.js'),'utf8'),sandbox);
  const signal=new AbortController().signal;
  const options={photo:{filename:'bird.jpg',bird:'A',lat:52,lon:20},route:{points:[{lat:51,lon:19},{lat:52,lon:20}]},stopovers:{features:[{geometry:{type:'Polygon',coordinates:[[[19,51],[20,51],[20,52],[19,51]]]}}]},settings:{extent:'photo',basemap:'existing',zoom:8,viewportWidth:800},createBaseLayer:()=>new TileLayer(),signal,t:key=>key};
  if(fail){await assert.rejects(sandbox.StorkAtlasMap.render(options),/mapTileError/);assert.equal(draws,0);}
  else{const blob=await sandbox.StorkAtlasMap.render(options);assert.equal(blob.type,'image/png');assert.equal(canvas.width,2400);assert.equal(canvas.height,1800);assert.deepEqual(Array.from(requestedPhoto),[52,20]);assert.equal(draws,1);assert.equal(arcs,1);assert.equal(polygons,1);}
  assert.equal(crossOrigin,'anonymous');assert.equal(removed,1);assert.equal(hostsRemoved,1);
}
(async()=>{await scenario();await scenario(true);console.log('PASS: PNG dimensions, photo position, route/stopover rendering, CORS mode, tile-error rejection and temporary map cleanup.');})().catch(error=>{console.error(error);process.exitCode=1;});
