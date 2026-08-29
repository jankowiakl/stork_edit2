import test from "node:test";
import assert from "node:assert/strict";
import { advanceBrowseCycle,getBrowseCycleUsage,grantCurrentBrowsePhoto,hasCurrentBrowseGrant } from "../src/browse-cycle.js";
import { contributionProfile,decideMediaAccess,normalizeContributionSettings } from "../src/contribution.js";

function cycleClient(){
  const state={cycleNo:1,startedAt:"2026-08-29T00:00:00Z",lastCompletedPhotoId:null,lastCompletedAt:null,photos:new Map([[1,new Set()]])};
  return{state,query:async(sql,params=[])=>{
    if(sql.includes("INSERT INTO user_browse_cycle_state(user_id) VALUES"))return{rows:[]};
    if(sql.includes("SELECT cycle_no,started_at,last_completed_photo_id"))return{rows:[{cycle_no:state.cycleNo,started_at:state.startedAt,last_completed_photo_id:state.lastCompletedPhotoId,last_completed_at:state.lastCompletedAt}]};
    if(sql.includes("count(*)::int browsed FROM user_browse_cycle_photos"))return{rows:[{browsed:(state.photos.get(Number(params[1]))||new Set()).size}]};
    if(sql.includes("SELECT 1 FROM user_browse_cycle_photos"))return{rows:(state.photos.get(Number(params[1]))||new Set()).has(params[2])?[{"?column?":1}]:[]};
    if(sql.includes("INSERT INTO user_browse_cycle_photos")){
      const cycle=Number(params[1]),photos=state.photos.get(cycle)||new Set(),inserted=!photos.has(params[2]);photos.add(params[2]);state.photos.set(cycle,photos);return{rows:[{inserted}]};
    }
    if(sql.includes("pg_advisory_xact_lock"))return{rows:[]};
    if(sql.includes("INSERT INTO user_browse_cycle_state(user_id,cycle_no")){
      state.cycleNo+=1;state.startedAt=`2026-08-29T00:0${state.cycleNo}:00Z`;state.lastCompletedPhotoId=params[1];state.lastCompletedAt=state.startedAt;state.photos.set(state.cycleNo,new Set());return{rows:[{cycle_no:state.cycleNo,started_at:state.startedAt,last_completed_photo_id:state.lastCompletedPhotoId,last_completed_at:state.lastCompletedAt}]};
    }
    throw new Error(`Unexpected cycle query: ${sql}`);
  }};
}

test("restricted browsing renews exactly one fixed pool after a completed annotation",async()=>{
  const client=cycleClient(),user={id:"restricted",role:"annotator",restricted_contributor:true},settings=normalizeContributionSettings({initialBrowsingAllowance:30});
  assert.equal((await getBrowseCycleUsage(client,"restricted")).browsed,0);

  for(let number=1;number<=30;number++)await grantCurrentBrowsePhoto(client,"restricted",`photo-${number}`);
  assert.equal((await getBrowseCycleUsage(client,"restricted")).browsed,30);

  await grantCurrentBrowsePhoto(client,"restricted","photo-1");
  assert.equal((await getBrowseCycleUsage(client,"restricted")).browsed,30,"reopening the same photo in one cycle must not consume another slot");
  const exhausted=contributionProfile({user,completed:0,browsed:30,browseCycleNo:1,settings});
  assert.equal(decideMediaAccess({profile:exhausted,hasGrant:false,purpose:"browse"}).allowed,false,"photo 31 must be blocked");
  assert.equal(decideMediaAccess({profile:exhausted,hasGrant:false,purpose:"annotation"}).allowed,true,"a protected annotation target stays available");

  await advanceBrowseCycle(client,"restricted","completed-by-user");
  const fresh=await getBrowseCycleUsage(client,"restricted");
  assert.equal(fresh.cycleNo,2);
  assert.equal(fresh.browsed,0);
  assert.equal((await hasCurrentBrowseGrant(client,"restricted","photo-1")).granted,false,"ordinary grants from the previous cycle must expire");

  for(let number=31;number<=60;number++)await grantCurrentBrowsePhoto(client,"restricted",`photo-${number}`);
  assert.equal((await getBrowseCycleUsage(client,"restricted")).browsed,30);
  const exhaustedAgain=contributionProfile({user,completed:1,browsed:30,browseCycleNo:2,settings});
  assert.equal(exhaustedAgain.browseAllowance,30,"completed annotations must not accumulate allowance");
  assert.equal(decideMediaAccess({profile:exhaustedAgain,hasGrant:false,purpose:"browse"}).allowed,false,"the lock must return after the next 30 unique photos");
});
