import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import pg from "pg";

const execFileAsync=promisify(execFile),testDatabaseUrl=process.env.TEST_DATABASE_URL||"",here=path.dirname(fileURLToPath(import.meta.url)),src=path.resolve(here,"../src");
const schemaConnection=(base,schema)=>{const url=new URL(base);url.searchParams.set("options",`-csearch_path=${schema}`);return url.toString();};

test("duplicate workbook issue survives dry run and PostgreSQL apply without NUL",{skip:!testDatabaseUrl,timeout:120000},async()=>{
  const schema=`stork_import_test_${Date.now()}_${Math.random().toString(16).slice(2,10)}`,temp=await fs.mkdtemp(path.join(os.tmpdir(),"stork-import-test-")),client=new pg.Client({connectionString:testDatabaseUrl});
  await client.connect();
  try{
    await client.query(`CREATE SCHEMA "${schema}"`);
    const databaseUrl=schemaConnection(testDatabaseUrl,schema),env={...process.env,DATABASE_URL:databaseUrl,PHOTO_DIR:path.join(temp,"photos")},workbookPath=path.join(temp,"duplicates.xlsx"),dryReport=path.join(temp,"dry.json"),applyReport=path.join(temp,"apply.json"),batchId=`test-${Date.now()}`;
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("photos");sheet.addRow(["Bird","FileName","Analysed"]);sheet.addRow(["1d00000978","1d00000978_20250823_160000_Delay+4s_1024x768_Cam00_00.jpg","no"]);sheet.addRow(["1d00000978","1d00000978_20250823_160000_Delay+4s_1024x768_Cam00_00.jpg","no"]);await workbook.xlsx.writeFile(workbookPath);
    await execFileAsync(process.execPath,[path.join(src,"migrate.js")],{env});
    await execFileAsync(process.execPath,[path.join(src,"import-data.js"),"--workbook",workbookPath,"--report",dryReport],{env});
    const dry=JSON.parse(await fs.readFile(dryReport,"utf8")),duplicate=dry.issues.find((issue)=>issue.type==="duplicate_workbook_row");
    assert.equal(dry.summary.workbookRows,2);assert.equal(dry.summary.uniquePhotoRecords,1);assert.ok(duplicate);assert.equal(duplicate.sourceKey,"1d00000978 | 1d00000978_20250823_160000_Delay+4s_1024x768_Cam00_00.jpg");assert.equal(JSON.stringify(duplicate).includes("\\u0000"),false);
    await execFileAsync(process.execPath,[path.join(src,"import-data.js"),"--workbook",workbookPath,"--report",applyReport,"--apply","--batch-id",batchId],{env});
    const stored=(await client.query(`SELECT source_key,details::text details FROM "${schema}".import_issues WHERE batch_id=$1 AND issue_type='duplicate_workbook_row'`,[batchId])).rows[0],batch=(await client.query(`SELECT status FROM "${schema}".import_batches WHERE id=$1`,[batchId])).rows[0];
    assert.equal(batch.status,"completed");assert.equal(stored.source_key,duplicate.sourceKey);assert.equal(stored.source_key.includes("\u0000"),false);assert.equal(stored.details.includes("\\u0000"),false);assert.equal(stored.details.includes("\u0000"),false);
  }finally{
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});await client.end();await fs.rm(temp,{recursive:true,force:true});
  }
});
