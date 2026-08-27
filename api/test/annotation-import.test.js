import test from "node:test";
import assert from "node:assert/strict";
import { isImportMarkedComplete,isBlankStoredAnnotation,hasImportAnnotationData } from "../src/annotation-import.js";

test("recognizes the Excel Analysed completion flag",()=>{
  assert.equal(isImportMarkedComplete("yes"),true);
  assert.equal(isImportMarkedComplete(" YES "),true);
  assert.equal(isImportMarkedComplete("no"),false);
});

test("allows Excel to fill only an empty unstarted placeholder",()=>{
  assert.equal(isBlankStoredAnnotation({has_annotation:true,annotation_status:"unstarted"}),true);
  assert.equal(isBlankStoredAnnotation({has_annotation:true,annotation_status:"unstarted",remarks:"entered text"}),false);
  assert.equal(isBlankStoredAnnotation({has_annotation:true,annotation_status:"draft"}),false);
});

test("detects whether an Excel row has an annotation to import",()=>{
  assert.equal(hasImportAnnotationData({Analysed:"yes"}),true);
  assert.equal(hasImportAnnotationData({Analysed:"no",Remarks:"observation"}),true);
  assert.equal(hasImportAnnotationData({Analysed:"no",Address:"place only"}),false);
});
