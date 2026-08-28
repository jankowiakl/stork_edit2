export const DEFAULT_PHOTO_GPS_MAX_OFFSET_MINUTES=90;

export function shouldUpgradePhotoMedia(existingLocationSource,incomingLocationSource){
  return incomingLocationSource==="exif"&&existingLocationSource!=="exif";
}

export function nearestTrackPoint(points,captureTime,maxOffsetMinutes=DEFAULT_PHOTO_GPS_MAX_OFFSET_MINUTES){
  const target=captureTime instanceof Date?captureTime:new Date(captureTime);
  if(!Array.isArray(points)||!points.length||Number.isNaN(target.getTime()))return null;
  let low=0,high=points.length;
  while(low<high){const middle=(low+high)>>1,time=new Date(points[middle].observedAt).getTime();if(time<target.getTime())low=middle+1;else high=middle;}
  const candidates=[points[low-1],points[low]].filter(Boolean),best=candidates.sort((a,b)=>Math.abs(new Date(a.observedAt)-target)-Math.abs(new Date(b.observedAt)-target))[0];
  if(!best)return null;
  const offsetMs=Math.abs(new Date(best.observedAt)-target);
  return offsetMs<=Math.max(1,Number(maxOffsetMinutes)||DEFAULT_PHOTO_GPS_MAX_OFFSET_MINUTES)*60000?{...best,offsetSeconds:Math.round(offsetMs/1000)}:null;
}

export async function backfillPhotoLocationsFromTrack(client,maxOffsetMinutes=DEFAULT_PHOTO_GPS_MAX_OFFSET_MINUTES){
  const seconds=Math.max(1,Number(maxOffsetMinutes)||DEFAULT_PHOTO_GPS_MAX_OFFSET_MINUTES)*60;
  const result=await client.query(`WITH matches AS (
    SELECT p.id,g.observed_at,g.latitude,g.longitude,g.altitude_m
    FROM photos p
    CROSS JOIN LATERAL (
      SELECT observed_at,latitude,longitude,altitude_m
      FROM gps_points
      WHERE individual_id=p.individual_id AND observed_at IS NOT NULL
        AND observed_at BETWEEN p.capture_time-($1::double precision*interval '1 second') AND p.capture_time+($1::double precision*interval '1 second')
      ORDER BY abs(extract(epoch FROM observed_at-p.capture_time))
      LIMIT 1
    ) g
    WHERE p.capture_time IS NOT NULL AND COALESCE(p.location_source,'missing') IN ('missing','import')
  )
  UPDATE photos p SET latitude=m.latitude,longitude=m.longitude,gps_time=m.observed_at,
    altitude_m=COALESCE(p.altitude_m,m.altitude_m),location_source='track',updated_at=now()
  FROM matches m WHERE p.id=m.id`,[seconds]);
  return result.rowCount||0;
}
