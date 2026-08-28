import { contributionProfile,decideMediaAccess,mergeContributionSettings,normalizeContributionSettings } from "./contribution.js";

const settingsFromRow=(row)=>normalizeContributionSettings(row||{});

export async function getContributionSettings(client,userId=null){
  const global=settingsFromRow((await client.query("SELECT * FROM contribution_settings WHERE id=1")).rows[0]);
  if(!userId)return global;
  const user=(await client.query("SELECT contribution_use_defaults FROM users WHERE id=$1",[userId])).rows[0];
  if(!user||user.contribution_use_defaults)return global;
  const override=(await client.query("SELECT * FROM user_contribution_overrides WHERE user_id=$1",[userId])).rows[0];
  return override?mergeContributionSettings(global,override):global;
}

export async function getContributionCounts(client,userId){
  const row=(await client.query(`SELECT
    count(*) FILTER(WHERE a.status='complete' AND a.completed_by=$1)::int completed,
    count(*) FILTER(WHERE a.status='complete' AND a.completed_by=$1 AND a.verified_at IS NOT NULL)::int verified,
    (SELECT count(*)::int FROM user_photo_access x WHERE x.user_id=$1 AND x.counts_against_allowance) browsed
    FROM photo_annotations a`,[userId])).rows[0];
  return{completed:Number(row?.completed||0),verified:Number(row?.verified||0),browsed:Number(row?.browsed||0)};
}

export async function refreshContribution(client,user){
  const settings=await getContributionSettings(client,user.id),counts=await getContributionCounts(client,user.id),profile=contributionProfile({user,...counts,settings});
  await client.query(`INSERT INTO contribution_stats(user_id,completed_annotations,verified_annotations,browsed_photos,recalculated_at)
    VALUES($1,$2,$3,$4,now()) ON CONFLICT(user_id) DO UPDATE SET completed_annotations=EXCLUDED.completed_annotations,verified_annotations=EXCLUDED.verified_annotations,browsed_photos=EXCLUDED.browsed_photos,recalculated_at=now()`,[user.id,counts.completed,counts.verified,counts.browsed]);
  const reached=[["fieldHelper",settings.bestPicturesThreshold],["fullContributor",settings.fullAccessThreshold],["acknowledgedContributor",settings.acknowledgementThreshold],["scientificContributor",settings.scientificThreshold]];
  for(const [key,threshold] of reached)if(counts.completed>=threshold)await client.query("INSERT INTO contribution_milestones(user_id,milestone_key,completed_at_reach) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[user.id,key,counts.completed]);
  if(user.restricted_contributor&&settings.autoPromoteFullAccess&&counts.completed>=settings.fullAccessThreshold){
    await client.query("UPDATE users SET restricted_contributor=false,updated_at=now() WHERE id=$1",[user.id]);profile.restricted=false;profile.fullAccess=true;profile.browseAllowance=null;profile.browseRemaining=null;profile.browseLimitReached=false;profile.autoPromoted=true;
  }
  return profile;
}

export async function contributionForUser(client,user){
  const profile=await refreshContribution(client,user),milestones=(await client.query("SELECT milestone_key,reached_at,completed_at_reach FROM contribution_milestones WHERE user_id=$1 ORDER BY reached_at",[user.id])).rows;
  return{...profile,milestones:milestones.map((row)=>({key:row.milestone_key,reachedAt:row.reached_at,completedAtReach:Number(row.completed_at_reach)}))};
}

export async function hasPhotoGrant(client,userId,photoId){
  return!!(await client.query("SELECT 1 FROM user_photo_access WHERE user_id=$1 AND photo_id=$2",[userId,photoId])).rows[0];
}

export async function ensurePhotoAccess(client,user,photoId,{purpose="browse"}={}){
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`media:${user.id}`]);
  const photo=(await client.query("SELECT id,individual_id FROM photos WHERE id=$1",[photoId])).rows[0];
  if(!photo)return{allowed:false,http:404,error:"photo_not_found"};
  const hasGrant=await hasPhotoGrant(client,user.id,photoId),profile=await refreshContribution(client,user),decision=decideMediaAccess({profile,hasGrant,purpose});
  if(!decision.allowed)return{allowed:false,http:403,error:"browsing_limit_reached",profile,photo};
  if(!hasGrant&&(decision.consume||purpose==="annotation"))await client.query(`INSERT INTO user_photo_access(user_id,photo_id,access_source,counts_against_allowance)
    VALUES($1,$2,$3,$4) ON CONFLICT(user_id,photo_id) DO UPDATE SET last_accessed_at=now()`,[user.id,photoId,purpose==="annotation"?"annotation":"browse",!!decision.consume]);
  else if(hasGrant)await client.query("UPDATE user_photo_access SET last_accessed_at=now() WHERE user_id=$1 AND photo_id=$2",[user.id,photoId]);
  return{allowed:true,profile:decision.consume?await refreshContribution(client,user):profile,photo,decision};
}
