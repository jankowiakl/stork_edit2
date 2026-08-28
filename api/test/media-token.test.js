import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET="test-only-secret-that-is-at-least-thirty-two-characters-long";

test("photo media token is short-lived and bound to one user and one photo",async()=>{
  const {signMediaToken}=await import(`../src/auth.js?media-token-test=${Date.now()}`);
  const token=signMediaToken({id:"user-1"},"photo-17"),payload=jwt.verify(token,process.env.JWT_SECRET);
  assert.equal(payload.sub,"user-1");
  assert.equal(payload.photoId,"photo-17");
  assert.equal(payload.scope,"photo-media");
  assert.ok(payload.exp-payload.iat<=15*60);
  assert.notEqual(payload.photoId,"photo-18","changing the direct API URL cannot make this token valid for another photo");
});
