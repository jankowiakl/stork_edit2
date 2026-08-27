import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { normalizeImportRelativePath } from "../src/admin-import.js";

test("normalizes a safe Bird/FileName upload path",()=>{
  assert.equal(normalizeImportRelativePath("archive/1d00000978/photo.jpg"),["archive","1d00000978","photo.jpg"].join(path.sep));
});

test("rejects traversal and absolute upload paths",()=>{
  for(const value of ["../photo.jpg","bird/../../photo.jpg","/etc/passwd","C:\\temp\\photo.jpg"]){
    assert.throws(()=>normalizeImportRelativePath(value),/invalid_upload_path/);
  }
});
