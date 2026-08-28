import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReviewField } from "../src/annotation-schema.js";

test("review fields accept keys, database names and labels",()=>{
  assert.equal(normalizeReviewField("Spec1_name"),"Spec1_name");
  assert.equal(normalizeReviewField("spec1_name"),"Spec1_name");
  assert.equal(normalizeReviewField("Species 1"),"Spec1_name");
});

test("review request may describe a custom subject instead of failing",()=>{
  assert.equal(normalizeReviewField("gatunek do sprawdzenia"),"gatunek do sprawdzenia");
  assert.equal(normalizeReviewField("\0Remarks\0"),"Remarks");
  assert.equal(normalizeReviewField(""),null);
});
