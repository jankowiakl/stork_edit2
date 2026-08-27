import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTextFields } from "../src/text-sanitize.js";
import { normalizeAnnotationInput,toDbAnnotation } from "../src/validation.js";

test("removes only NUL from Pheno_period and another text field",()=>{
  const removals=[];
  const source=sanitizeTextFields({Pheno_period:"A_\u0000migration",Remarks:"żółć\u0000 i gęś",Country:"POL"},(issue)=>removals.push(issue)).value;
  const normalized=sanitizeTextFields(normalizeAnnotationInput(source)).value;
  const database=sanitizeTextFields(toDbAnnotation(normalized)).value;
  assert.equal(database.pheno_period,"A_migration");
  assert.equal(database.remarks,"żółć i gęś");
  assert.equal(source.Country,"POL");
  assert.deepEqual(removals.map((item)=>item.field),["Pheno_period","Remarks"]);
});

test("leaves ordinary text unchanged",()=>{
  const source={Pheno_period:"pre-migratory",Remarks:"Łąka — żurawie"};
  const result=sanitizeTextFields(source);
  assert.deepEqual(result.value,source);
  assert.equal(result.removed,0);
});
