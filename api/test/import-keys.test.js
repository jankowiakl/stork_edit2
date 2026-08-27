import test from "node:test";
import assert from "node:assert/strict";
import { internalPhotoKey,reportPhotoKey,sanitizeImportIssue } from "../src/import-keys.js";

test("keeps NUL only in an internal photo key",()=>{
  assert.equal(internalPhotoKey("bird","photo.jpg"),"bird\u0000photo.jpg");
  assert.equal(reportPhotoKey("bird","photo.jpg"),"bird | photo.jpg");
});

test("deep-sanitizes import issue sourceKey and JSON details",()=>{
  const issue=sanitizeImportIssue({type:"duplicate_workbook_row",sourceKey:"bird\u0000photo.jpg",nested:{value:"before\u0000after"}});
  assert.equal(issue.sourceKey,"birdphoto.jpg");
  assert.equal(issue.nested.value,"beforeafter");
  assert.equal(JSON.stringify(issue).includes("\\u0000"),false);
  assert.equal(JSON.stringify(issue).includes("\u0000"),false);
});
