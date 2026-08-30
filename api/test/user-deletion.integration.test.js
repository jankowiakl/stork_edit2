import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";

const execFileAsync=promisify(execFile),testDatabaseUrl=process.env.TEST_DATABASE_URL||"",here=path.dirname(fileURLToPath(import.meta.url)),src=path.resolve(here,"../src");
const schemaConnection=(base,schema)=>{const url=new URL(base);url.searchParams.set("options",`-csearch_path=${schema}`);return url.toString();};

test("deleting a login account keeps annotations, ratings, reviews, imports and audit attribution",{skip:!testDatabaseUrl,timeout:120000},async()=>{
  const schemaName=`stork_user_delete_${Date.now()}_${Math.random().toString(16).slice(2,10)}`,rootClient=new pg.Client({connectionString:testDatabaseUrl});
  await rootClient.connect();
  try{
    await rootClient.query(`CREATE SCHEMA "${schemaName}"`);
    const databaseUrl=schemaConnection(testDatabaseUrl,schemaName),client=new pg.Client({connectionString:databaseUrl});
    await execFileAsync(process.execPath,[path.join(src,"migrate.js")],{env:{...process.env,DATABASE_URL:databaseUrl}});
    await client.connect();
    try{
      await client.query("INSERT INTO users(id,email,name,role,password_hash) VALUES('admin','admin@example.org','Admin','admin','hash'),('author','author@example.org','Original Author','annotator','hash')");
      await client.query("INSERT INTO individuals(id) VALUES('bird-1')");
      await client.query("INSERT INTO photos(id,individual_id,filename) VALUES('photo-1','bird-1','photo-1.jpg')");
      await client.query("INSERT INTO photo_annotations(photo_id,status,created_by,updated_by,completed_by,verified_by,completed_at,verified_at) VALUES('photo-1','complete','author','author','author','admin',now(),now())");
      await client.query("INSERT INTO annotation_history(photo_id,version,status,changed_by,snapshot) VALUES('photo-1',1,'complete','author','{}')");
      await client.query("INSERT INTO photo_ratings(user_id,photo_id,rating) VALUES('author','photo-1',5)");
      await client.query("INSERT INTO annotation_review_requests(id,photo_id,reason,status,created_by,resolved_by) VALUES('review-1','photo-1','Verify','resolved','author','admin')");
      await client.query("INSERT INTO annotation_tasks(id,photo_id,assigned_to,created_by,reason,status) VALUES('task-1','photo-1','author','admin','Task','assigned')");
      await client.query("INSERT INTO import_batches(id,source_name,status,created_by) VALUES('import-1','test.xlsx','completed','author')");
      await client.query("INSERT INTO audit_log(user_id,action,entity_type,entity_id) VALUES('author','annotation_saved','photo','photo-1')");
      await client.query("INSERT INTO user_photo_favorites(user_id,photo_id) VALUES('author','photo-1')");
      await client.query("UPDATE annotation_tasks SET status='cancelled',cancelled_at=now() WHERE assigned_to='author' AND status='assigned'");
      await client.query("DELETE FROM users WHERE id='author'");
      assert.equal(Number((await client.query("SELECT count(*) count FROM users WHERE id='author'")).rows[0].count),0);
      const attribution=(await client.query("SELECT * FROM user_attributions WHERE user_id='author'")).rows[0];
      assert.equal(attribution.display_name,"Original Author");assert.ok(attribution.account_deleted_at);
      const annotation=(await client.query("SELECT created_by,updated_by,completed_by,verified_by FROM photo_annotations WHERE photo_id='photo-1'")).rows[0];
      assert.deepEqual(annotation,{created_by:"author",updated_by:"author",completed_by:"author",verified_by:"admin"});
      for(const table of ["annotation_history","photo_ratings","annotation_review_requests","annotation_tasks","import_batches","audit_log"]){assert.equal(Number((await client.query(`SELECT count(*) count FROM ${table}`)).rows[0].count),1,`${table} should remain`);}
      assert.equal(Number((await client.query("SELECT count(*) count FROM user_photo_favorites WHERE user_id='author'")).rows[0].count),0);
      assert.equal((await client.query("SELECT user_id FROM photo_ratings WHERE photo_id='photo-1'")).rows[0].user_id,"author");
      assert.equal((await client.query("SELECT user_id FROM audit_log WHERE action='annotation_saved'")).rows[0].user_id,"author");
    }finally{await client.end();}
  }finally{await rootClient.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(()=>{});await rootClient.end();}
});
