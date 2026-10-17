(function(root){
  "use strict";
  const encoder=new TextEncoder();
  // Standard uncompressed PNG iTXt; keep IDAT image bytes unchanged.
  async function metadata(blob,values){
    const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
    if(bytes.length<20||view.getUint32(0)!==0x89504e47||view.getUint32(4)!==0x0d0a1a0a)throw Error("Invalid PNG");
    let end=8;while(end+12<=bytes.length&&view.getUint32(end+4)!==0x49454e44)end+=view.getUint32(end)+12;
    if(end+12>bytes.length)throw Error("Missing PNG IEND");
    const chunks=[];
    for(const [key,value] of Object.entries(values)){
      const data=encoder.encode(`${key}\0\0\0\0\0${value??""}`),chunk=new Uint8Array(data.length+12),dv=new DataView(chunk.buffer);
      dv.setUint32(0,data.length);chunk.set(encoder.encode("iTXt"),4);chunk.set(data,8);
      let crc=0xffffffff;for(const byte of chunk.subarray(4,-4)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}dv.setUint32(chunk.length-4,(crc^0xffffffff)>>>0);chunks.push(chunk);
    }
    return new Blob([bytes.subarray(0,end),...chunks,bytes.subarray(end)],{type:"image/png"});
  }
  const plain=html=>{const el=document.createElement("span");el.innerHTML=html;return el.textContent;};
  async function render({photo,route,stopovers,settings,createBaseLayer,signal,t}){
    if(!root.StorkAtlas.located(photo))throw Error(`${photo.filename}: ${t("noLocation")}`);
    const L=root.L,width=[1200,1800,2400,3200].includes(settings.width)?settings.width:2400,height=width*3/4,scale=width/Math.max(300,Number(settings.viewportWidth)||1200);
    const points=(route?.points||[]).filter(root.StorkAtlas.located),photoTrack=(settings.photoTrack||[]).filter(root.StorkAtlas.located),credits=[];
    const styles=settings.styles||{},pathDefaults=L.Path?.prototype.options||{};
    const styleFor=key=>({...pathDefaults,...styles[key]});
    const check=()=>{if(signal?.aborted)throw new DOMException("Cancelled","AbortError");};
    // Independent maps at export resolution; never change the live viewer.
    async function scene(w,h,key,overview){
      const host=document.createElement("div");host.setAttribute("aria-hidden","true");Object.assign(host.style,{position:"fixed",left:"-20000px",top:"0",width:`${w}px`,height:`${h}px`,pointerEvents:"none"});document.body.append(host);let map;
      try{
        check();map=L.map(host,{zoomControl:false,attributionControl:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,dragging:false,keyboard:false,scrollWheelZoom:false,trackResize:false,zoomSnap:0});
        const base=createBaseLayer(key,map),layers=[];
        const collect=layer=>{if(layer instanceof L.TileLayer){Object.assign(layer.options,{crossOrigin:"anonymous",keepBuffer:0,updateWhenIdle:true});layers.push(layer);}else if(layer.eachLayer)layer.eachLayer(collect);};collect(base);
        if(!layers.length)throw Error(t("mapTileError"));
        const maxZoom=Math.min(...layers.map(l=>l.options.maxZoom||19));
        if((overview||settings.extent==="route")&&(points.length||photoTrack.length))map.fitBounds(L.latLngBounds([...points,...photoTrack,photo].map(p=>[Number(p.lat),Number(p.lon)])),{padding:[12*scale,12*scale],maxZoom});
        else map.setView([Number(photo.lat),Number(photo.lon)],Math.min(maxZoom,Math.max(1,(Number(settings.zoom)||13)+Math.log2(w/Math.max(300,Number(settings.viewportWidth)||800)))));
        await new Promise((resolve,reject)=>{
          let done=false,added=false;const timer=setTimeout(()=>finish(Error(t("mapTileError"))),30000);
          const finish=error=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener("abort",abort);for(const layer of layers){layer.off("load",loaded);layer.off("tileerror",failed);}error?reject(error):resolve();};
          const abort=()=>finish(new DOMException("Cancelled","AbortError")),loaded=()=>{if(added&&layers.every(l=>!l.isLoading()))finish();},failed=()=>finish(Error(t("mapTileError")));
          signal?.addEventListener("abort",abort,{once:true});for(const layer of layers){layer.on("load",loaded);layer.on("tileerror",failed);}try{base.addTo(map);added=true;check();loaded();}catch(error){finish(error);}
        });
        check();const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d"),box=host.getBoundingClientRect();
        for(const layer of layers){
          const tiles=[...layer.getContainer().querySelectorAll("img.leaflet-tile")];let visible=0;ctx.globalAlpha=layer.options.opacity??1;
          for(const tile of tiles){const rect=tile.getBoundingClientRect(),x=rect.left-box.left,y=rect.top-box.top;if(x>=w||y>=h||x+rect.width<=0||y+rect.height<=0)continue;if(!tile.complete||!tile.naturalWidth)throw Error(t("mapTileError"));ctx.drawImage(tile,x,y,rect.width,rect.height);visible++;}
          if(!visible)throw Error(t("mapTileError"));
        }
        ctx.globalAlpha=1;const xy=p=>map.latLngToContainerPoint([Number(p.lat),Number(p.lon)]);
        const paint=style=>{
          ctx.lineWidth=style.weight*scale;ctx.lineCap=style.lineCap;ctx.lineJoin=style.lineJoin;
          const dash=Array.isArray(style.dashArray)?style.dashArray:String(style.dashArray||"").split(/[ ,]+/).filter(Boolean);
          ctx.setLineDash(dash.map(value=>Number(value)*scale));ctx.lineDashOffset=(Number(style.dashOffset)||0)*scale;
          if(style.fill){ctx.fillStyle=style.fillColor||style.color;ctx.globalAlpha=style.fillOpacity;ctx.fill(style.fillRule||"evenodd");}
          if(style.stroke!==false){ctx.strokeStyle=style.color;ctx.globalAlpha=style.opacity;ctx.stroke();}
          ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.globalAlpha=1;
        };
        const line=(list,style)=>{
          if(list.length<2)return;ctx.beginPath();
          list.forEach((point,i)=>{const p=xy(point);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});
          paint({...style,fill:false});
        };
        // Same pane order as the viewer: stopovers 395, GPS 397, segment 399,
        // photo track and marker 400. Styles are snapshots of the live Leaflet layers.
        if(settings.stopovers!==false)for(const feature of stopovers?.features||[]){
          const g=feature.geometry,polygons=g?.type==="Polygon"?[g.coordinates]:g?.type==="MultiPolygon"?g.coordinates:[];
          for(const polygon of polygons){ctx.beginPath();for(const ring of polygon){ring.forEach(([lon,lat],i)=>{const p=xy({lon,lat});i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();}paint(styleFor(overview?"stopOverview":"stopFollow"));}
        }
        // renderBackgroundLayers always keeps the complete GPS path on overviewMap.
        if(overview||settings.route!==false)line(points,styleFor(overview?"gpsOverview":"gpsFollow"));
        if(settings.segment&&settings.segmentStart&&settings.segmentEnd){
          const a=Date.parse(settings.segmentStart),b=Date.parse(settings.segmentEnd),lo=Math.min(a,b),hi=Math.max(a,b);
          const segment=points.filter(p=>{const stamp=Date.parse(p.time);return stamp>=lo&&stamp<=hi;})
            .filter((p,i,arr)=>!i||Number(p.lat)!==Number(arr[i-1].lat)||Number(p.lon)!==Number(arr[i-1].lon));
          line(segment,styleFor(overview?"segmentOverview":"segmentFollow"));
        }
        // showCollectionSequencePhoto resets followLine to the current point.
        // overviewLine retains all photo locations for the selected individual.
        line(overview?photoTrack:[photo],styleFor(overview?"overview":"follow"));
        const marker=xy(photo),markerStyle=styleFor(overview?"markerOverview":"markerFollow");
        ctx.beginPath();ctx.arc(marker.x,marker.y,markerStyle.radius*scale,0,Math.PI*2);paint(markerStyle);
        // Only required provider credits, no information bar. Full credits also go into metadata.
        let credit=[...new Set(layers.map(l=>plain(l.getAttribution?.()||"")).filter(Boolean))].join(" • ");
        if(/OpenStreetMap/i.test(credit))credit+=" • openstreetmap.org/copyright";
        credits.push(credit);ctx.font=`${10*scale}px sans-serif`;ctx.textAlign="right";ctx.lineWidth=3*scale;ctx.strokeStyle="rgba(255,255,255,.95)";ctx.fillStyle="#17232d";
        const lines=[];let current="";for(const word of credit.split(" ")){if(current&&ctx.measureText(`${current} ${word}`).width>w-20*scale){lines.push(current);current=word;}else current+=(current?" ":"")+word;}if(current)lines.push(current);
        lines.forEach((text,i)=>{const y=h-8*scale-(lines.length-1-i)*12*scale;ctx.strokeText(text,w-10*scale,y);ctx.fillText(text,w-10*scale,y);});return canvas;
      }finally{map?.remove();host.remove();}
    }
    let main,inset;
    try{
      main=await scene(width,height,settings.detailBasemap||settings.basemap,false);check();
      const insetStyle=settings.inset||{},iw=Math.round(width*.32),ih=Math.round(iw/Math.max(1.2,Math.min(2,insetStyle.aspect||280/170))),margin=(insetStyle.margin||12)*scale,x=width-iw-margin,y=margin,radius=(insetStyle.radius||14)*scale;
      inset=await scene(iw,ih,settings.overviewBasemap||settings.basemap,true);check();
      const ctx=main.getContext("2d");ctx.save();ctx.beginPath();ctx.roundRect(x,y,iw,ih,radius);ctx.shadowColor="#0008";ctx.shadowBlur=10*scale;ctx.fillStyle=insetStyle.background||"transparent";ctx.fill();ctx.shadowBlur=0;ctx.clip();ctx.drawImage(inset,x,y);ctx.restore();ctx.beginPath();ctx.roundRect(x,y,iw,ih,radius);ctx.strokeStyle=insetStyle.borderColor||"transparent";ctx.lineWidth=(insetStyle.borderWidth||1)*scale;ctx.stroke();
      const blob=await new Promise((resolve,reject)=>{try{main.toBlob(value=>value?resolve(value):reject(Error(t("mapTileError"))),"image/png");}catch(_){reject(Error(t("mapTileError")));}});check();
      return await metadata(blob,{Bird:photo.bird,SourcePhoto:photo.filename,CaptureTime:photo.captureTime,Latitude:photo.lat,Longitude:photo.lon,CRS:"WGS84 / EPSG:4326",MapSource:[...new Set(credits)].join(" | "),DetailBasemap:settings.detailBasemap||settings.basemap,OverviewBasemap:settings.overviewBasemap||settings.basemap,GPS:"Ciconia Flight Photo Viewer",GPSNote:!points.length?t("noRoute"):route?.simplified?t("simplified"):""});
    }catch(error){if(error.name==="SecurityError")throw Error(t("mapTileError"));throw error;}finally{if(main)main.width=main.height=0;if(inset)inset.width=inset.height=0;}
  }
  root.StorkAtlasMap={render,metadata};
})(typeof globalThis==="object"?globalThis:this);
