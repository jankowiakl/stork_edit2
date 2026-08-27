import exifr from "exifr";

export function parseExifGpsTime(dateStamp,timeStamp){
  const dateMatch=String(dateStamp||"").match(/^(\d{4}):(\d{1,2}):(\d{1,2})$/),timeMatch=String(timeStamp||"").match(/^(\d{1,2}):(\d{1,2}):([\d.]+)$/);
  if(!dateMatch||!timeMatch)return null;
  const milliseconds=Math.round((Number(timeMatch[3])%1)*1000),date=new Date(Date.UTC(Number(dateMatch[1]),Number(dateMatch[2])-1,Number(dateMatch[3]),Number(timeMatch[1]),Number(timeMatch[2]),Math.floor(Number(timeMatch[3])),milliseconds));
  return Number.isNaN(date.getTime())?null:date;
}

export async function readPhotoExifGps(file){
  const tags=await exifr.parse(file,{gps:true,tiff:false,exif:false,icc:false,iptc:false,xmp:false});
  const latitude=Number(tags?.latitude),longitude=Number(tags?.longitude),valid=Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180;
  if(!valid)return{hasGps:false,latitude:null,longitude:null,altitudeM:null,gpsTime:null};
  let altitudeM=Number(tags.GPSAltitude);if(!Number.isFinite(altitudeM))altitudeM=null;else if(Number(tags.GPSAltitudeRef)===1)altitudeM=-Math.abs(altitudeM);
  return{hasGps:true,latitude,longitude,altitudeM,gpsTime:parseExifGpsTime(tags.GPSDateStamp,tags.GPSTimeStamp)};
}
