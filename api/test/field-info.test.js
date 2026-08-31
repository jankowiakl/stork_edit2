import test from "node:test";
import assert from "node:assert/strict";
import { publicAnnotationSchema } from "../src/annotation-schema.js";

test("annotation schema exposes practical guidance while retaining technical metadata",()=>{
  const schema=publicAnnotationSchema(),field=schema.fields.find((item)=>item.key==="Pheno_period");
  assert.equal(field.dataType,"Categorical text");
  assert.equal(field.unit,"phenological phase");
  assert.equal(field.sourceRole,"Biological period");
  assert.match(field.help,/Annual-cycle or phenological period/);
  assert.match(field.help,/fledging: Local post-fledging period/);
  assert.equal(field.optionHelp.A_migration,"Autumn migration.");
  assert.deepEqual(schema.fields.filter((item)=>!item.definition||!item.dataType||!item.unit||!item.sourceRole||!item.plainDefinition||!item.howToRecord).map((item)=>item.key),[]);
});

test("scientific interpretation warnings and current options are documented",()=>{
  const fields=new Map(publicAnnotationSchema().fields.map((field)=>[field.key,field]));
  assert.match(fields.get("Water_presence_class").important,/does not mean that there is no water near/);
  assert.match(fields.get("Ciconia_num").important,/camera-carrying bird/);
  assert.match(fields.get("Residence").important,/Do not invent a distance or time threshold/);
  assert.deepEqual(Object.keys(fields.get("Activity_class").optionHelp).sort(),fields.get("Activity_class").options.slice().sort());
  assert.equal(fields.get("Env_desc_en").type,"text");
  for(const field of fields.values())for(const option of field.options||[])assert.ok(field.optionHelp?.[option],`${field.key}.${option} needs category guidance`);
});

test("shared custom categories are merged into extensible selectors",()=>{
  const schema=publicAnnotationSchema({Pheno_period:["post-breeding"]}),pheno=schema.fields.find((item)=>item.key==="Pheno_period"),residence=schema.fields.find((item)=>item.key==="Residence");
  assert.equal(pheno.extensible,true);assert.ok(pheno.options.includes("post-breeding"));assert.equal(residence.extensible,undefined);
});
