const cycleRow=(row)=>({
  cycleNo:Number(row?.cycle_no||1),
  startedAt:row?.started_at||null,
  lastCompletedPhotoId:row?.last_completed_photo_id||null,
  lastCompletedAt:row?.last_completed_at||null
});

export async function getActiveBrowseCycle(client,userId){
  await client.query("INSERT INTO user_browse_cycle_state(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[userId]);
  const row=(await client.query("SELECT cycle_no,started_at,last_completed_photo_id,last_completed_at FROM user_browse_cycle_state WHERE user_id=$1",[userId])).rows[0];
  return cycleRow(row);
}

export async function getBrowseCycleUsage(client,userId){
  const cycle=await getActiveBrowseCycle(client,userId),row=(await client.query("SELECT count(*)::int browsed FROM user_browse_cycle_photos WHERE user_id=$1 AND cycle_no=$2",[userId,cycle.cycleNo])).rows[0];
  return{...cycle,browsed:Number(row?.browsed||0)};
}

export async function hasCurrentBrowseGrant(client,userId,photoId){
  const cycle=await getActiveBrowseCycle(client,userId),row=(await client.query("SELECT 1 FROM user_browse_cycle_photos WHERE user_id=$1 AND cycle_no=$2 AND photo_id=$3",[userId,cycle.cycleNo,photoId])).rows[0];
  return{...cycle,granted:!!row};
}

export async function grantCurrentBrowsePhoto(client,userId,photoId){
  const cycle=await getActiveBrowseCycle(client,userId),result=await client.query(`INSERT INTO user_browse_cycle_photos(user_id,cycle_no,photo_id)
    VALUES($1,$2,$3) ON CONFLICT(user_id,cycle_no,photo_id) DO UPDATE SET last_accessed_at=now() RETURNING (xmax=0) inserted`,[userId,cycle.cycleNo,photoId]);
  return{...cycle,inserted:!!result.rows[0]?.inserted};
}

export async function advanceBrowseCycle(client,userId,completedPhotoId){
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`browse-cycle:${userId}`]);
  const row=(await client.query(`INSERT INTO user_browse_cycle_state(user_id,cycle_no,started_at,last_completed_photo_id,last_completed_at,updated_at)
    VALUES($1,2,now(),$2,now(),now()) ON CONFLICT(user_id) DO UPDATE SET
      cycle_no=user_browse_cycle_state.cycle_no+1,
      started_at=now(),last_completed_photo_id=EXCLUDED.last_completed_photo_id,last_completed_at=now(),updated_at=now()
    RETURNING cycle_no,started_at,last_completed_photo_id,last_completed_at`,[userId,completedPhotoId])).rows[0];
  return cycleRow(row);
}
