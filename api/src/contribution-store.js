import { contributionProfile,decideMediaAccess,mergeContributionSettings,normalizeContributionSettings } from "./contribution.js";
import { getBrowseCycleUsage,grantCurrentBrowsePhoto } from "./browse-cycle.js";

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
  const cycle=await getBrowseCycleUsage(client,userId),row=(await client.query(`SELECT
    count(*) FILTER(WHERE a.status='complete' AND a.completed_by=$1)::int completed,
    count(*) FILTER(WHERE a.status='complete' AND a.completed_by=$1 AND a.verified_at IS NOT NULL)::int verified
    FROM photo_annotations a`,[userId])).rows[0];
  return{completed:Number(row?.completed||0),verified:Number(row?.verified||0),browsed:cycle.browsed,browseCycleNo:cycle.cycleNo,browseCycleStartedAt:cycle.startedAt};
}

export async function refreshContribution(client,user){
  const settings=await getContributionSettings(client,user.id),counts=await getContributionCounts(client,user.id),profile=contributionProfile({user,...counts,settings});
  await client.query(`INSERT INTO contribution_stats(user_id,completed_annotations,verified_annotations,browsed_photos,browse_cycle_no,browse_cycle_started_at,recalculated_at)
    VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(user_id) DO UPDATE SET completed_annotations=EXCLUDED.completed_annotations,verified_annotations=EXCLUDED.verified_annotations,browsed_photos=EXCLUDED.browsed_photos,browse_cycle_no=EXCLUDED.browse_cycle_no,browse_cycle_started_at=EXCLUDED.browse_cycle_started_at,recalculated_at=now()`,[user.id,counts.completed,counts.verified,counts.browsed,counts.browseCycleNo,counts.browseCycleStartedAt]);
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

export async function getPhotoGrant(client,userId,photoId){
  return(await client.query(`SELECT x.access_source,x.counts_against_allowance,x.first_accessed_at,x.last_accessed_at,
    EXISTS(SELECT 1 FROM user_browse_cycle_state s JOIN user_browse_cycle_photos c ON c.user_id=s.user_id AND c.cycle_no=s.cycle_no WHERE s.user_id=$1 AND c.photo_id=p.id) current_cycle_active,
    EXISTS(SELECT 1 FROM photo_annotations a WHERE a.photo_id=p.id AND a.status='complete' AND a.completed_by=$1) own_completed,
    EXISTS(SELECT 1 FROM restricted_annotation_focus f WHERE f.user_id=$1 AND f.photo_id=p.id) focus_active,
    EXISTS(SELECT 1 FROM annotation_tasks t WHERE t.assigned_to=$1 AND t.photo_id=p.id AND t.status='assigned') task_active
    FROM photos p LEFT JOIN user_photo_access x ON x.user_id=$1 AND x.photo_id=p.id WHERE p.id=$2`,[userId,photoId])).rows[0]||null;
}

export async function hasPhotoGrant(client,userId,photoId){
  const grant=await getPhotoGrant(client,userId,photoId);
  return!!grant&&(grant.current_cycle_active||grant.own_completed||grant.focus_active||grant.task_active);
}

export async function ensurePhotoAccess(client,user,photoId,{purpose="browse"}={}){
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`media:${user.id}`]);
  const photo=(await client.query("SELECT id,individual_id FROM photos WHERE id=$1",[photoId])).rows[0];
  if(!photo)return{allowed:false,http:404,error:"photo_not_found"};
  const profile=await refreshContribution(client,user),grant=await getPhotoGrant(client,user.id,photoId),hasGrant=!!grant&&(grant.current_cycle_active||grant.own_completed||grant.focus_active||grant.task_active),decision=decideMediaAccess({profile,hasGrant,purpose});
  if(!decision.allowed)return{allowed:false,http:403,error:"browsing_limit_reached",profile,photo};
  if(decision.consume){await grantCurrentBrowsePhoto(client,user.id,photoId);await client.query(`INSERT INTO user_photo_access(user_id,photo_id,access_source,counts_against_allowance)
    VALUES($1,$2,$3,$4) ON CONFLICT(user_id,photo_id) DO UPDATE SET
      access_source=CASE WHEN EXCLUDED.counts_against_allowance THEN 'browse' ELSE user_photo_access.access_source END,
      counts_against_allowance=user_photo_access.counts_against_allowance OR EXCLUDED.counts_against_allowance,
      last_accessed_at=now()`,[user.id,photoId,"browse",true]);}
  else if(!hasGrant&&purpose==="annotation")await client.query(`INSERT INTO user_photo_access(user_id,photo_id,access_source,counts_against_allowance) VALUES($1,$2,'annotation',false) ON CONFLICT(user_id,photo_id) DO UPDATE SET last_accessed_at=now()`,[user.id,photoId]);
  else if(hasGrant)await client.query("UPDATE user_photo_access SET last_accessed_at=now() WHERE user_id=$1 AND photo_id=$2",[user.id,photoId]);
  return{allowed:true,profile:decision.consume?await refreshContribution(client,user):profile,photo,decision};
}
