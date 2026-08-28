import test from "node:test";
import assert from "node:assert/strict";
import { publicAnnotationSchema } from "../src/annotation-schema.js";

test("question-mark help exposes the info-sheet metadata",()=>{
  const schema=publicAnnotationSchema(),field=schema.fields.find((item)=>item.key==="Pheno_period");
  assert.equal(field.dataType,"Categorical text");
  assert.equal(field.unit,"phenological phase");
  assert.equal(field.sourceRole,"Biological period");
  assert.match(field.help,/Phenological or annual-cycle period/);
  assert.match(field.help,/Unit \/ format: phenological phase/);
  assert.deepEqual(schema.fields.filter((item)=>!item.definition||!item.dataType||!item.unit||!item.sourceRole).map((item)=>item.key),[]);
});

test("shared custom categories are merged into extensible selectors",()=>{
  const schema=publicAnnotationSchema({Pheno_period:["post-breeding"]}),pheno=schema.fields.find((item)=>item.key==="Pheno_period"),residence=schema.fields.find((item)=>item.key==="Residence");
  assert.equal(pheno.extensible,true);assert.ok(pheno.options.includes("post-breeding"));assert.equal(residence.extensible,undefined);
});
