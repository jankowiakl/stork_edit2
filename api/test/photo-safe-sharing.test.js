import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET="photo-safe-sharing-test-secret-at-least-48-characters-long";

const schema=await readFile(new URL("../src/schema.sql",import.meta.url),"utf8");
const server=await readFile(new URL("../src/server.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../index.html",import.meta.url),"utf8");
const worker=await readFile(new URL("../../sw.js",import.meta.url),"utf8");

test("shared Photo Safe media tokens are short-lived and bound to share and photo",async()=>{
  const {signSharedSafeMediaToken,signSharedSafeViewerToken}=await import(`../src/auth.js?photo-safe-share=${Date.now()}`);
  const media=jwt.verify(signSharedSafeMediaToken({shareId:"share-a",photoId:"photo-1",shareType:"public"}),process.env.JWT_SECRET);
  assert.equal(media.scope,"shared-photo-safe-media");
  assert.equal(media.shareId,"share-a");
  assert.equal(media.photoId,"photo-1");
  assert.equal(media.shareType,"public");
  assert.ok(media.exp-media.iat<=5*60);
  assert.notEqual(media.photoId,"photo-2");
  const viewer=jwt.verify(signSharedSafeViewerToken({shareId:"share-a",shareType:"public"}),process.env.JWT_SECRET);
  assert.equal(viewer.scope,"shared-photo-safe-viewer");
  assert.ok(viewer.exp-viewer.iat<=15*60);
});

test("public share tokens use a hash for authorization and encrypted recovery for the owner",async()=>{
  assert.match(server,/crypto\.randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(server,/createHash\("sha256"\)/);
  assert.match(server,/INSERT INTO photo_safe_public_shares\(id,owner_user_id,token_hash,token_ciphertext,expires_at\)/);
  assert.match(schema,/photo_safe_public_shares[\s\S]*?token_ciphertext TEXT/);
  assert.doesNotMatch(schema,/public_token\s+TEXT/i);
  assert.match(server,/expires_at>now\(\)/);
  assert.match(server,/revoked_at IS NULL/);
  assert.match(server,/res\.status\(201\)\.json\(\{share:\{id:share\.id,link/);
  const sample=crypto.randomBytes(32).toString("base64url"),hash=crypto.createHash("sha256").update(sample).digest("hex");
  assert.notEqual(sample,hash);
  assert.equal(hash.length,64);
  const {encryptPhotoSafeToken,decryptPhotoSafeToken}=await import(`../src/photo-safe-share.js?photo-safe-token=${Date.now()}`),encrypted=encryptPhotoSafeToken(sample);
  assert.notEqual(encrypted,sample);
  assert.equal(encrypted.includes(sample),false);
  assert.equal(decryptPhotoSafeToken(encrypted),sample);
  assert.equal(decryptPhotoSafeToken(`${encrypted}broken`),null);
});

test("the owner's Share window lists and can copy every recoverable public link",()=>{
  assert.match(server,/publicShares:publicShares\.map/);
  assert.match(server,/decryptPhotoSafeToken\(row\.token_ciphertext\)/);
  assert.match(server,/legacyUnavailable:!token/);
  assert.match(ui,/copySavedPublicSafeLink/);
  assert.match(ui,/saved in the list below and can be copied again later/);
  assert.match(ui,/older link cannot be recovered/);
});

test("sharing tables keep the owner's favourites live and enforce constraints",()=>{
  assert.match(schema,/CREATE TABLE IF NOT EXISTS photo_safe_user_shares/);
  assert.match(schema,/UNIQUE\(owner_user_id,shared_with_user_id\)/);
  assert.match(schema,/CHECK\(owner_user_id<>shared_with_user_id\)/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS photo_safe_public_shares/);
  assert.match(schema,/token_hash TEXT NOT NULL UNIQUE/);
  assert.match(schema,/owner_user_id TEXT NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(server,/FROM user_photo_favorites favorite JOIN photos p ON p\.id=favorite\.photo_id/);
  assert.doesNotMatch(schema,/photo_safe_(?:user|public)_share_photos/);
});

test("every shared media request rechecks share state and current safe membership",()=>{
  const middleware=server.match(/async function authorizeSharedSafeMedia[\s\S]*?\n\}/)?.[0]||"";
  assert.match(middleware,/shared-photo-safe-media/);
  assert.match(middleware,/activePhotoSafeShare/);
  assert.match(middleware,/user_photo_favorites WHERE user_id=\$1 AND photo_id=\$2/);
  assert.match(middleware,/photo_not_in_shared_safe/);
  assert.match(server,/UPDATE photo_safe_user_shares SET revoked_at=now\(\)/);
  assert.match(server,/UPDATE photo_safe_public_shares SET revoked_at=now\(\)/);
  assert.match(server,/photo_safe_share_inactive/);
});

test("recipient is read-only and cannot re-share or mutate the owner's safe",()=>{
  assert.match(server,/WHERE share\.id=\$1 AND share\.revoked_at IS NULL AND share\.shared_with_user_id=\$2/);
  assert.match(server,/app\.post\("\/api\/me\/photo-safe\/shares\/users",authenticateUser/);
  assert.match(server,/WHERE id=\$1 AND owner_user_id=\$2/);
  assert.match(ui,/mode:"SHARED_READONLY"/);
  assert.match(ui,/body\.sharedPhotoSafeReadOnly \.photoSocialControls/);
  assert.match(ui,/const readOnly=!!photoSafeViewerContext\?\.readOnly/);
  assert.match(ui,/orderActions=isSafe&&!readOnly/);
  assert.match(ui,/collectionShareBtn\.hidden=readOnly/);
});

test("owner, recipient and public modes reuse one map-synchronised Photo Safe viewer",()=>{
  assert.equal((ui.match(/const openPhotoCollection=/g)||[]).length,1);
  assert.match(ui,/\["SHARED_READONLY","PUBLIC_READONLY","SURVEY","SURVEY_REWARD"\]/);
  assert.match(ui,/const showCollectionSequencePhoto=/);
  assert.match(ui,/await loadTrackFor\(selected\.bird/);
  assert.match(ui,/followMap\.setView/);
  assert.match(ui,/scheduleCollectionPlayback/);
  assert.match(ui,/navigatePhotoSequenceBy/);
  assert.match(ui,/id="collectionInterval"/);
  assert.match(ui,/id="collectionOrder"/);
  assert.match(ui,/openCollectionTableView/);
  assert.match(ui,/skipAccess:!!photoSafeViewerContext\?\.readOnly/);
  assert.doesNotMatch(ui,/sharedPhotoSafeViewer|publicPhotoSafeViewer/);
});

test("shared routes and public isolation expose only birds represented in the safe",()=>{
  assert.match(server,/photo-safe-shares\/:shareId\/individuals\/:id\/route/);
  assert.match(server,/photo-safe-shares\/:shareId\/individuals\/:id\/stopovers/);
  assert.match(server,/favorite\.user_id=\$1 AND p\.individual_id=\$2 LIMIT 1/);
  assert.match(ui,/body\.publicSharedSafeMode \.appNavDrawer/);
  assert.match(ui,/PUBLIC_READONLY/);
  assert.match(ui,/publicParams=new URLSearchParams[\s\S]*?publicSafeToken=publicParams\.get\("photo_safe"\)/);
  assert.match(ui,/publicProjectIntro/);
  assert.match(ui,/PROJECT_CONTACT_NAME|Contact the project/);
});

test("shared viewing bypasses normal browse grants and refreshes short-lived URLs",()=>{
  assert.match(ui,/showPhotoAtIndex\(trackIndex,\{skipAccess:!!photoSafeViewerContext\?\.readOnly,transitionFrom:animateFrom/);
  assert.match(ui,/if\(!skipAccess&&!await grantTrackPhotoAccess/);
  assert.match(ui,/scheduleSharedSafeRefresh/);
  assert.match(ui,/4\*60\*1000/);
  assert.doesNotMatch(server,/photo-safe-shares[\s\S]{0,200}user_browse_cycle_photos/);
});

test("share actions are audited without storing the raw public token",()=>{
  for(const event of ["photo_safe_shared_with_user","photo_safe_user_share_revoked","photo_safe_public_link_created","photo_safe_public_link_revoked"])assert.match(server,new RegExp(event));
  const createRoute=server.match(/app\.post\("\/api\/me\/photo-safe\/shares\/public"[\s\S]*?\}\}\);/)?.[0]||"";
  assert.match(createRoute,/expiresAt/);
  assert.doesNotMatch(createRoute,/audit\([^\n]*\{token/);
});

test("the service worker cache remains newer than the Photo Safe sharing release",()=>{
  assert.match(worker,/stork-edit2-shell-v2026-09-01-49/);
});
