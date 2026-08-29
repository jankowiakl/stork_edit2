import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browseAllowance,contributionLevel,contributionProfile,decideMediaAccess,normalizeContributionSettings } from "../src/contribution.js";
import { ensurePhotoAccess } from "../src/contribution-store.js";

const settings=normalizeContributionSettings({});
const restricted={id:"restricted-user",role:"annotator",restricted_contributor:true};

test("browsing allowance is a fixed renewable cycle, not a cumulative reward",()=>{
  assert.equal(browseAllowance(0,settings),30);
  assert.equal(browseAllowance(1,settings),30);
  assert.equal(browseAllowance(10,settings),30);
  assert.equal(browseAllowance(50,settings),30);
});

test("only current complete counts supplied to the profile affect access and levels",()=>{
  assert.equal(contributionLevel(49,settings).key,"nestling");
  assert.equal(contributionLevel(50,settings).key,"fieldHelper");
  assert.equal(contributionLevel(400,settings).key,"fullContributor");
  assert.equal(contributionLevel(600,settings).key,"acknowledgedContributor");
  assert.equal(contributionLevel(1999,settings).key,"acknowledgedContributor");
  assert.equal(contributionLevel(2000,settings).key,"scientificContributor");
});

test("restricted direct media access is denied after the current cycle is consumed",()=>{
  const profile=contributionProfile({user:restricted,completed:0,verified:0,browsed:30,browseCycleNo:4,settings});
  assert.equal(profile.browseAllowance,30);
  assert.equal(profile.browseCycleNo,4);
  assert.deepEqual(decideMediaAccess({profile,hasGrant:false,purpose:"browse"}),{allowed:false,consume:false,source:"limit_reached"});
  assert.equal(decideMediaAccess({profile,hasGrant:true,purpose:"browse"}).allowed,true);
});

test("an editable annotation photo remains available without consuming browsing allowance",()=>{
  const profile=contributionProfile({user:restricted,completed:0,verified:0,browsed:30,settings});
  assert.deepEqual(decideMediaAccess({profile,hasGrant:false,purpose:"annotation"}),{allowed:true,consume:false,source:"annotation"});
});

test("standard users and restricted contributors at full-access threshold can browse all media",()=>{
  assert.equal(contributionProfile({user:{...restricted,restricted_contributor:false},completed:0,browsed:500,settings}).fullAccess,true);
  assert.equal(contributionProfile({user:restricted,completed:400,browsed:5000,settings}).fullAccess,true);
});

test("custom thresholds must be strictly increasing",()=>{
  assert.throws(()=>normalizeContributionSettings({bestPicturesThreshold:50,fullAccessThreshold:50}),/contribution_thresholds_must_increase/);
});

function restrictedAccessClient({grant=null,browsed=30}={}){
  const queries=[];
  return{queries,query:async(sql,params=[])=>{
    queries.push({sql,params});
    if(sql.includes("SELECT id,individual_id FROM photos"))return{rows:[{id:params[0],individual_id:"bird-1"}]};
    if(sql.includes("SELECT * FROM contribution_settings"))return{rows:[]};
    if(sql.includes("SELECT contribution_use_defaults"))return{rows:[{contribution_use_defaults:true}]};
    if(sql.includes("INSERT INTO user_browse_cycle_state"))return{rows:[]};
    if(sql.includes("SELECT cycle_no,started_at"))return{rows:[{cycle_no:1,started_at:"2026-08-29T00:00:00Z"}]};
    if(sql.includes("count(*)::int browsed FROM user_browse_cycle_photos"))return{rows:[{browsed}]};
    if(sql.includes("count(*) FILTER"))return{rows:[{completed:0,verified:0}]};
    if(sql.includes("FROM photos p LEFT JOIN user_photo_access"))return{rows:[{access_source:grant?.access_source||null,counts_against_allowance:!!grant?.counts_against_allowance,current_cycle_active:!!grant?.current_cycle_active,own_completed:!!grant?.own_completed,focus_active:!!grant?.focus_active,task_active:!!grant?.task_active}]};
    if(sql.includes("pg_advisory_xact_lock")||sql.includes("INSERT INTO contribution_stats")||sql.includes("UPDATE user_photo_access"))return{rows:[]};
    throw new Error(`Unexpected query in restricted access test: ${sql}`);
  }};
}

test("the direct media authorization path rejects an ungranted photo after the cycle is exhausted",async()=>{
  const client=restrictedAccessClient();
  const result=await ensurePhotoAccess(client,restricted,"outside-limit",{purpose:"browse"});
  assert.equal(result.allowed,false);
  assert.equal(result.http,403);
  assert.equal(result.error,"browsing_limit_reached");
  assert.equal(client.queries.some(({sql})=>sql.includes("INSERT INTO user_photo_access")),false,"a denied direct URL must not create a grant");
  assert.equal(client.queries.some(({sql})=>sql.includes("INSERT INTO user_browse_cycle_photos")),false,"a denied direct URL must not enter the active cycle");
});

test("a historical user_photo_access row cannot unlock a photo from an earlier cycle",async()=>{
  const client=restrictedAccessClient({grant:{access_source:"browse",counts_against_allowance:true}});
  const result=await ensurePhotoAccess(client,restricted,"old-cycle-photo",{purpose:"browse"});
  assert.equal(result.allowed,false);
  assert.equal(result.error,"browsing_limit_reached");
});

test("a photo completed by the same user remains available and does not consume the new cycle",async()=>{
  const client=restrictedAccessClient({grant:{own_completed:true}});
  const result=await ensurePhotoAccess(client,restricted,"own-completed",{purpose:"browse"});
  assert.equal(result.allowed,true);
  assert.equal(result.decision.consume,false);
  assert.equal(client.queries.some(({sql})=>sql.includes("INSERT INTO user_browse_cycle_photos")),false);
});

test("server applies active-cycle grants to lists and advances one cycle only on a new completion",async()=>{
  const source=await readFile(new URL("../src/server.js",import.meta.url),"utf8");
  assert.match(source,/user_browse_cycle_state cycle JOIN user_browse_cycle_photos unlocked/);
  assert.match(source,/startsNewBrowseCycle=req\.user\.role==="annotator"&&req\.user\.restricted_contributor&&status==="complete"&&current\?\.status!=="complete"&&annotation\.completed_by===req\.user\.id/);
  assert.match(source,/await advanceBrowseCycle\(client,req\.user\.id,photo\.id\)/);
  assert.match(source,/DELETE FROM restricted_annotation_focus WHERE user_id=\$1"/);
  assert.match(source,/LIMIT 5/);
  assert.match(source,/ensurePhotoAccess\(client,req\.user,row\.id,\{purpose:"annotation"\}\)/);
});
