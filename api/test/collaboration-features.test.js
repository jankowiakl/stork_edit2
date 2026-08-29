import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema=await readFile(new URL("../src/schema.sql",import.meta.url),"utf8");
const server=await readFile(new URL("../src/server.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../index.html",import.meta.url),"utf8");
const manifest=JSON.parse(await readFile(new URL("../../manifest.webmanifest",import.meta.url),"utf8"));
const serviceWorker=await readFile(new URL("../../sw.js",import.meta.url),"utf8");

test("user photo collections are server-side and cascade with photos",()=>{
  assert.match(schema,/CREATE TABLE IF NOT EXISTS user_photo_favorites/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS photo_ratings/);
  assert.match(schema,/photo_id TEXT NOT NULL REFERENCES photos\(id\) ON DELETE CASCADE/);
  assert.match(server,/\/api\/me\/photo-collection/);
  assert.match(server,/app\.delete\("\/api\/photos\/:id\/rating"/);
});

test("manual invitations provide a Gmail compose link and role permissions",()=>{
  assert.match(server,/https:\/\/mail\.google\.com\/mail\//);
  assert.match(server,/Uprawnienia:/);
  assert.match(server,/gmailUrl/);
});

test("best pictures and top rated reuse the main viewer and offer a table",()=>{
  assert.match(ui,/collectionBrowseState/);
  assert.match(ui,/openPhotoCollection/);
  assert.match(ui,/collectionTableMode/);
  assert.match(ui,/class="ratedTable"/);
  assert.match(ui,/method:"DELETE"/);
});

test("the GitHub Pages application is installable as a PWA",()=>{
  assert.equal(manifest.display,"standalone");
  assert.match(ui,/rel="manifest" href="manifest\.webmanifest"/);
  assert.match(ui,/serviceWorker\.register\("\.\/sw\.js"\)/);
  assert.match(serviceWorker,/APP_SHELL/);
});

test("a user cannot create a second active draft",()=>{
  assert.match(server,/pg_advisory_xact_lock/);
  assert.match(server,/a\.updated_by=\$1 AND a\.status='draft' AND a\.photo_id<>\$2/);
  assert.match(server,/active_draft_exists/);
});

test("editor panel switcher is outside the form panel and offers all three views",()=>{
  const switcher=ui.match(/<div class="editorMobileTabs" id="editorModeSwitcher"[\s\S]*?<\/div>/)?.[0]||"";
  assert.match(switcher,/data-editor-tab="map"/);
  assert.match(switcher,/data-editor-tab="form"/);
  assert.match(switcher,/data-editor-tab="photo"/);
  assert.equal((ui.match(/id="editorModeSwitcher"/g)||[]).length,1);
});

test("category proposals and review requests keep an audit workflow",()=>{
  assert.match(schema,/status TEXT NOT NULL DEFAULT 'pending' CHECK \(status IN \('pending','resolved','rejected'\)\)/);
  assert.match(server,/category_reason_required/);
  assert.match(server,/\/api\/review-requests/);
});

test("photo media is private and restricted access is bound to the active browsing cycle",()=>{
  assert.match(server,/app\.get\("\/api\/public\/photos\/:id\/image",authenticateMediaUser,authorizeMediaAndServe\)/);
  assert.match(server,/app\.get\("\/api\/photos\/:id\/image",authenticateUser,authorizeMediaAndServe\)/);
  assert.match(server,/app\.get\("\/api\/public\/individuals\/:id\/photos",\(_req,res\)=>res\.status\(401\)/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS user_photo_access/);
  assert.match(schema,/PRIMARY KEY\(user_id,photo_id\)/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS user_browse_cycle_state/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS user_browse_cycle_photos/);
  assert.match(server,/user_browse_cycle_state cycle JOIN user_browse_cycle_photos unlocked/);
});

test("restricted tables do not preload media that has not been unlocked",()=>{
  assert.match(ui,/restricted&&!photo\.mediaGranted\?`<button class="secondary tiny tablePreviewUnlock"/);
  assert.match(ui,/restricted&&!photo\.mediaGranted\?`<button class="secondary tiny collectionOpenPhoto"/);
  assert.match(ui,/deferInitialAccess:true/);
  assert.match(ui,/if\(!deferInitialAccess\)void showPhotoAtIndex\(0\)/);
});

test("restricted annotation escape hatch is limited to five editable focused photos",()=>{
  assert.match(schema,/CREATE TABLE IF NOT EXISTS restricted_annotation_focus/);
  assert.match(schema,/PRIMARY KEY\(user_id,photo_id\)/);
  assert.match(server,/INSERT INTO restricted_annotation_focus\(user_id,photo_id,granted_at\)/);
  assert.match(server,/profile\.restricted&&profile\.browseLimitReached&&!taskAssigned&&!focusActive/);
  assert.match(server,/DELETE FROM restricted_annotation_focus WHERE user_id=\$1 AND photo_id=\$2/);
  assert.match(server,/p\.latitude IS NOT NULL","p\.longitude IS NOT NULL/);
  assert.match(server,/DELETE FROM restricted_annotation_focus f WHERE f\.user_id=\$1 AND NOT EXISTS/);
  assert.match(server,/LIMIT 5/);
  assert.match(ui,/queue=result\.photos\?\.length/);
  assert.match(ui,/activateTrack\(focusedTrack\)/);
});

test("collections provide jump playback, compact tables and authenticated downloads",()=>{
  const tableRenderer=ui.match(/const loadCollectionPhotosPanel=[\s\S]*?const loadRatedPhotosPanel/)?.[0]||"";
  assert.match(ui,/showCollectionSequencePhoto/);
  assert.match(ui,/id="collectionPlay"/);
  assert.match(ui,/Download matching photos \(ZIP\)/);
  assert.match(tableRenderer,/<th>Average<\/th>/);
  assert.doesNotMatch(tableRenderer,/<th>Filename<\/th>/);
  assert.match(server,/\/api\/photos\/:id\/download/);
  assert.match(server,/\/api\/me\/photo-collection\/download/);
});

test("responsive defaults and mobile editor controls remain compact",()=>{
  assert.match(ui,/<option value="1\.25" selected>125%/);
  assert.match(ui,/@media\(max-width:700px\)\{:root\{--ui-font-scale:1\.25;/);
  assert.match(ui,/id="adminRecoveryDetails"[^>]*hidden aria-hidden="true"/);
  assert.match(ui,/<select id="editorEnvDesc" data-field="Env_desc_en">/);
});

test("contribution dashboard reveals only earned badges and progress to the next one",()=>{
  const renderer=ui.match(/const renderContributionDashboard=[\s\S]*?const loadContributionDashboard/)?.[0]||"";
  assert.match(renderer,/Your current badge/);
  assert.match(renderer,/levels\.slice\(0,currentIndex\+1\)/);
  assert.match(renderer,/Progress to the next badge/);
  assert.match(renderer,/c-currentLevel\.threshold/);
  assert.doesNotMatch(renderer,/class="levelBox locked/);
});

test("photo information remains enabled across manual and playback navigation",()=>{
  assert.match(ui,/let currentPhotoDetails=null,photoInfoEnabled=false/);
  assert.match(ui,/setPhotoInfoEnabled\(!photoInfoEnabled\)/);
  assert.match(ui,/framePhotoId&&framePhotoId!==socialPhotoId/);
  assert.doesNotMatch(ui,/Geographical description not recorded/);
  assert.doesNotMatch(ui,/No descriptive information for this photo/);
  assert.doesNotMatch(ui,/photoInfoOverlayEl\.hidden=true/);
  assert.match(ui,/\.photoInfoToggle \{ right:12px; bottom:calc\(92px/);
});

test("navigation tiles and panel grids scale with the selected font",()=>{
  assert.match(ui,/\.appNavDrawer \{ width:min\(20em/);
  assert.match(ui,/\.appNavTiles \{ grid-template-columns:repeat\(auto-fit/);
  assert.match(ui,/\.appNavTile \{ min-height:4em; height:auto/);
  assert.match(ui,/\.userGrid,\.importGrid \{ grid-template-columns:repeat\(auto-fit/);
  assert.match(ui,/\.contributionMetric,\.nextRewardBox,\.progressCard,\.userCard,\.importCard,\.optionsSection,\.appNavTile \{ height:auto/);
});
