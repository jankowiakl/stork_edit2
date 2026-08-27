export function parsePhotoFilename(filename){
  const match=String(filename||"").match(/^([A-Za-z0-9]+)_(\d{8})_(\d{6})(?:_|\.)/);
  if(!match)return{bird:null,captureTime:null};
  const [,bird,date,time]=match,captureTime=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(4,6))-1,Number(date.slice(6,8)),Number(time.slice(0,2)),Number(time.slice(2,4)),Number(time.slice(4,6))));
  return{bird,captureTime:Number.isNaN(captureTime.getTime())?null:captureTime};
}
