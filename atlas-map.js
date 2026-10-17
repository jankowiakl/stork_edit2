(function(root){
  "use strict";
  // Export using a separate Leaflet instance: the live viewer never pans or changes size.
  async function render({photo,route,stopovers,settings,createBaseLayer,signal,t}){
    if(!root.StorkAtlas.located(photo))throw Error(`${photo.filename}: ${t("noLocation")}`);
    const L=root.L,width=2400,height=1800,host=document.createElement("div");
    host.setAttribute("aria-hidden","true");Object.assign(host.style,{position:"fixed",left:"-10000px",top:"0",width:`${width}px`,height:`${height}px`,pointerEvents:"none"});document.body.append(host);
    let map;
    const check=()=>{if(signal?.aborted)throw new DOMException("Cancelled","AbortError");};
    try{
      check();map=L.map(host,{zoomControl:false,attributionControl:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,dragging:false,keyboard:false,scrollWheelZoom:false,trackResize:false});
      const layers=[],base=createBaseLayer(settings.basemap,map);
      const collect=layer=>{if(layer instanceof L.TileLayer){Object.assign(layer.options,{crossOrigin:"anonymous",keepBuffer:0,updateWhenIdle:true});layers.push(layer);}else if(layer.eachLayer)layer.eachLayer(collect);};collect(base);
      const maxZoom=Math.min(...layers.map(l=>l.options.maxZoom||19)),points=(route?.points||[]).filter(root.StorkAtlas.located);
      if(settings.extent==="route"&&points.length)map.fitBounds(L.latLngBounds([...points.map(p=>[Number(p.lat),Number(p.lon)]),[Number(photo.lat),Number(photo.lon)]]),{padding:[100,110],maxZoom});
      else map.setView([Number(photo.lat),Number(photo.lon)],Math.min(maxZoom,Math.max(1,Math.round(settings.zoom+Math.log2(width/Math.max(300,settings.viewportWidth))))));
      await new Promise((resolve,reject)=>{
        let done=false,added=false;const timer=setTimeout(()=>finish(Error(t("mapTileError"))),30000);
        const finish=error=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener("abort",abort);for(const layer of layers){layer.off("load",loaded);layer.off("tileerror",failed);}error?reject(error):resolve();};
        const abort=()=>finish(new DOMException("Cancelled","AbortError")),loaded=()=>{if(added&&layers.every(l=>!l.isLoading()))finish();},failed=()=>finish(Error(t("mapTileError")));
        signal?.addEventListener("abort",abort,{once:true});for(const layer of layers){layer.on("load",loaded);layer.on("tileerror",failed);}base.addTo(map);added=true;loaded();
      });
      check();const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d"),box=host.getBoundingClientRect();ctx.fillStyle="#e7edf0";ctx.fillRect(0,0,width,height);
      for(const layer of layers){
        const tiles=[...layer.getContainer().querySelectorAll("img.leaflet-tile")];if(!tiles.length)throw Error(t("mapTileError"));ctx.globalAlpha=layer.options.opacity??1;
        for(const tile of tiles){const rect=tile.getBoundingClientRect(),x=rect.left-box.left,y=rect.top-box.top;if(x>=width||y>=height||x+rect.width<=0||y+rect.height<=0)continue;if(!tile.complete||!tile.naturalWidth)throw Error(t("mapTileError"));ctx.drawImage(tile,x,y,rect.width,rect.height);}
      }
      ctx.globalAlpha=1;
      const xy=p=>map.latLngToContainerPoint([Number(p.lat),Number(p.lon)]);
      const scale=2;
      for(const feature of stopovers?.features||[]){const geometry=feature.geometry,polygons=geometry?.type==="Polygon"?[geometry.coordinates]:geometry?.type==="MultiPolygon"?geometry.coordinates:[];for(const polygon of polygons){ctx.beginPath();for(const ring of polygon){ring.forEach(([lon,lat],i)=>{const p=xy({lon,lat});i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();}ctx.fillStyle="#ff9f4329";ctx.strokeStyle="#ff9f43";ctx.lineWidth=4;ctx.fill("evenodd");ctx.stroke();}}
      if(points.length){const style=settings.routeStyle||{};ctx.beginPath();let previous=null;for(const point of points){const p=xy(point);if(!previous||Math.abs(p.x-previous.x)>width*2)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);previous=p;}ctx.strokeStyle=style.color||"#73e0c1";ctx.globalAlpha=style.opacity??.58;ctx.lineWidth=Math.max(2,(style.weight||2)*scale);ctx.lineJoin="round";ctx.setLineDash(String(style.dashArray||"5 6").split(/[ ,]+/).map(Number).map(x=>x*scale));ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}
      const marker=xy(photo);ctx.beginPath();ctx.arc(marker.x,marker.y,16,0,Math.PI*2);ctx.fillStyle="#3388ff";ctx.fill();ctx.strokeStyle="white";ctx.lineWidth=5;ctx.stroke();
      // Attribution is part of the raster, not an external sidecar that can be lost.
      const text=document.createElement("span");text.innerHTML=layers.map(l=>l.getAttribution?.()||"").filter(Boolean).join(" • ");
      const warnings=[!points.length?t("noRoute"):"",route?.simplified?t("simplified"):""].filter(Boolean).join(" • ");
      ctx.fillStyle="rgba(8,20,31,.82)";ctx.fillRect(0,height-112,width,112);ctx.fillStyle="white";ctx.font="26px sans-serif";
      ctx.fillText(`${photo.bird} • ${photo.filename} • ${Number(photo.lat).toFixed(5)}, ${Number(photo.lon).toFixed(5)}`,24,height-76,width-48);
      ctx.font="22px sans-serif";ctx.fillText(`${text.textContent} • GPS: Ciconia Flight Photo Viewer`,24,height-43,width-48);if(warnings)ctx.fillText(warnings,24,height-13,width-48);
      check();const blob=await new Promise((resolve,reject)=>{try{canvas.toBlob(value=>value?resolve(value):reject(Error(t("mapTileError"))),"image/png");}catch(_){reject(Error(t("mapTileError")));}});check();return blob;
    }finally{map?.remove();host.remove();}
  }
  root.StorkAtlasMap={render};
})(typeof globalThis==="object"?globalThis:this);
