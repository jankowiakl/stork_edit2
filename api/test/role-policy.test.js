import test from "node:test";
import assert from "node:assert/strict";
import { canEditAnnotation,roleCapabilities } from "../src/role-policy.js";

const annotator={id:"user-1",role:"annotator"};
const coordinator={id:"coord-1",role:"coordinator"};
const admin={id:"admin-1",role:"admin"};

test("annotator may start an assigned unstarted record",()=>{
  assert.equal(canEditAnnotation({user:annotator,current:null,assigned:true}),true);
  assert.equal(canEditAnnotation({user:annotator,current:{status:"unstarted",created_by:null,updated_by:null},assigned:true}),true);
});

test("annotator may edit own records but only view records entered by others",()=>{
  assert.equal(canEditAnnotation({user:annotator,current:{status:"complete",created_by:"user-1",updated_by:"coord-1"},assigned:false}),true);
  assert.equal(canEditAnnotation({user:annotator,current:{status:"draft",created_by:"other",updated_by:"other"},assigned:true}),false);
  assert.equal(canEditAnnotation({user:annotator,current:null,assigned:false}),false);
});

test("a coordinator or administrator can explicitly release another record to an annotator as a task",()=>{
  const otherRecord={status:"complete",created_by:"other",updated_by:"other"};
  assert.equal(canEditAnnotation({user:annotator,current:otherRecord,assigned:false,taskAssigned:true}),true);
});

test("coordinator and administrator may edit every annotation",()=>{
  const otherRecord={status:"complete",created_by:"other",updated_by:"other"};
  assert.equal(canEditAnnotation({user:coordinator,current:otherRecord,assigned:false}),true);
  assert.equal(canEditAnnotation({user:admin,current:otherRecord,assigned:false}),true);
});

test("coordinator cannot import or manage users but can moderate categories",()=>{
  const capabilities=roleCapabilities("coordinator");
  assert.equal(capabilities.importData,false);
  assert.equal(capabilities.manageUsers,false);
  assert.equal(capabilities.moderateCategories,true);
  assert.equal(capabilities.reviewRequests,true);
});
