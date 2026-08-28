import test from "node:test";
import assert from "node:assert/strict";
import { browseAllowance,contributionLevel,contributionProfile,decideMediaAccess,normalizeContributionSettings } from "../src/contribution.js";
import { ensurePhotoAccess } from "../src/contribution-store.js";

const settings=normalizeContributionSettings({});
const restricted={id:"restricted-user",role:"annotator",restricted_contributor:true};

test("default browsing allowance grows by five for every completed annotation",()=>{
  assert.equal(browseAllowance(0,settings),30);
  assert.equal(browseAllowance(1,settings),35);
  assert.equal(browseAllowance(10,settings),80);
  assert.equal(browseAllowance(50,settings),280);
});

test("only current complete counts supplied to the profile affect access and levels",()=>{
  assert.equal(contributionLevel(49,settings).key,"nestling");
  assert.equal(contributionLevel(50,settings).key,"fieldHelper");
  assert.equal(contributionLevel(400,settings).key,"fullContributor");
  assert.equal(contributionLevel(600,settings).key,"acknowledgedContributor");
  assert.equal(contributionLevel(1000,settings).key,"scientificContributor");
});

test("restricted direct media access is denied after the allowance is consumed",()=>{
  const profile=contributionProfile({user:restricted,completed:0,verified:0,browsed:30,settings});
  assert.deepEqual(decideMediaAccess({profile,hasGrant:false,purpose:"browse"}),{allowed:false,consume:false,source:"limit_reached"});
  assert.equal(decideMediaAccess({profile,hasGrant:true,purpose:"browse"}).allowed,true,"a token for another ID is insufficient; only a database grant for this photo allows it");
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

test("the direct media authorization path rejects an ungranted photo after the restricted allowance is exhausted",async()=>{
  const queries=[];
  const client={query:async(sql,params=[])=>{
    queries.push({sql,params});
    if(sql.includes("SELECT id,individual_id FROM photos"))return{rows:[{id:"outside-limit",individual_id:"bird-1"}]};
    if(sql.includes("SELECT 1 FROM user_photo_access"))return{rows:[]};
    if(sql.includes("SELECT * FROM contribution_settings"))return{rows:[]};
    if(sql.includes("SELECT contribution_use_defaults"))return{rows:[{contribution_use_defaults:true}]};
    if(sql.includes("count(*) FILTER"))return{rows:[{completed:0,verified:0,browsed:30}]};
    if(sql.includes("pg_advisory_xact_lock")||sql.includes("INSERT INTO contribution_stats"))return{rows:[]};
    throw new Error(`Unexpected query in direct-media test: ${sql}`);
  }};
  const result=await ensurePhotoAccess(client,restricted,"outside-limit",{purpose:"browse"});
  assert.equal(result.allowed,false);
  assert.equal(result.http,403);
  assert.equal(result.error,"browsing_limit_reached");
  assert.equal(queries.some(({sql})=>sql.includes("INSERT INTO user_photo_access")),false,"a denied direct URL must not create a grant");
});
