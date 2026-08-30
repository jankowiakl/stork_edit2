import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema=await readFile(new URL("../src/schema.sql",import.meta.url),"utf8");
const server=await readFile(new URL("../src/server.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../index.html",import.meta.url),"utf8");

test("permanent account deletion preserves durable scientific attribution",()=>{
  assert.match(schema,/CREATE TABLE IF NOT EXISTS user_attributions/);
  assert.match(schema,/CREATE TRIGGER trg_mark_deleted_user_attribution BEFORE DELETE ON users/);
  for(const reference of [
    "photo_annotations_created_by_fkey","photo_annotations_updated_by_fkey","photo_annotations_completed_by_fkey","photo_annotations_verified_by_fkey",
    "photo_ratings_user_id_fkey","annotation_review_requests_created_by_fkey","annotation_review_requests_resolved_by_fkey",
    "annotation_history_changed_by_fkey","import_batches_created_by_fkey","audit_log_user_id_fkey"
  ])assert.match(schema,new RegExp(reference));
  assert.match(schema,/REFERENCES user_attributions\(user_id\) ON DELETE RESTRICT/);
  assert.match(schema,/user_photo_favorites[\s\S]*?REFERENCES users\(id\) ON DELETE CASCADE/);
});

test("only an administrator can permanently delete a different account after typing DELETE",()=>{
  assert.match(server,/app\.delete\("\/api\/admin\/users\/:id",authenticateUser,requireRole\("admin"\),writeLimiter/);
  assert.match(server,/req\.body\.confirmation!=="DELETE"/);
  assert.match(server,/cannot_delete_own_account/);
  assert.match(server,/last_active_admin/);
  assert.match(server,/UPDATE annotation_tasks SET status='cancelled'/);
  assert.match(server,/user_permanently_deleted/);
  assert.match(server,/scientificAttributionPreserved:true/);
  assert.match(ui,/class="danger tiny deleteUserPermanently"/);
  assert.match(ui,/Type DELETE to continue/);
  assert.match(ui,/annotations, verification history, ratings and audit attribution will remain/);
});

test("administrator e-mail changes validate uniqueness and retain the user id",()=>{
  assert.match(server,/app\.patch\("\/api\/admin\/users\/:id\/email",authenticateUser,requireRole\("admin"\),writeLimiter/);
  assert.match(server,/if\(!isValidEmail\(email\)\)/);
  assert.match(server,/lower\(email\)=lower\(\$1\) AND id<>\$2/);
  assert.match(server,/UPDATE users SET email=\$1,updated_at=now\(\) WHERE id=\$2/);
  assert.match(server,/user_email_changed/);
  assert.match(server,/previousEmail:user\.email,newEmail:email/);
  assert.match(ui,/class="secondary tiny changeUserEmail"/);
  assert.match(ui,/The new address can be used to log in immediately/);
});
