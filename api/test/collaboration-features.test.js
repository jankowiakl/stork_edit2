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

test("best pictures reuse the main viewer and ratings have a ranking table",()=>{
  assert.match(ui,/collectionBrowseState/);
  assert.match(ui,/loadTrackFor\(ids\[0\],\{autoplay:false\}\)/);
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
