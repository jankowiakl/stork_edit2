export function heightClass100m(aboveGround,flyGround=null){
  if(flyGround==="ground")return 0;
  const value=Number(aboveGround);if(!Number.isFinite(value)||value<=50)return 0;
  return Math.max(0,Math.ceil((value-50)/100)*100);
}

export function deriveHeightValues({altitudeM,elevationM,aboveGround,heightClass,flyGround}={}){
  const numeric=(value)=>value===null||value===undefined||value===""?NaN:Number(value),altitude=numeric(altitudeM),providedElevation=numeric(elevationM),providedAbove=numeric(aboveGround),providedClass=numeric(heightClass),hasAltitude=Number.isFinite(altitude),hasElevation=Number.isFinite(providedElevation),hasAbove=Number.isFinite(providedAbove),hasClass=Number.isFinite(providedClass);
  if(flyGround==="ground")return{elevationM:hasAltitude?altitude:(hasElevation?providedElevation:null),aboveGround:0,heightClass:0};
  const resolvedAbove=hasAbove?providedAbove:(hasAltitude&&hasElevation?Math.round((altitude-providedElevation)*100)/100:null),resolvedElevation=hasAltitude&&Number.isFinite(resolvedAbove)?Math.round((altitude-resolvedAbove)*100)/100:(hasElevation?providedElevation:null);
  return{elevationM:resolvedElevation,aboveGround:resolvedAbove,heightClass:hasClass?providedClass:(Number.isFinite(resolvedAbove)?heightClass100m(resolvedAbove,flyGround):null)};
}
