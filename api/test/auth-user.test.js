import test,{after} from "node:test";
import assert from "node:assert/strict";
import { isValidEmail,publicUser } from "../src/auth.js";
import { db } from "../src/db.js";

after(()=>db.end());

test("public user exposes invitation state without password data",()=>{
  const user=publicUser({id:"u1",email:"user@example.com",name:"User",role:"annotator",is_active:true,must_change_password:true,invite_sent_at:"2026-08-28T08:00:00Z",last_login_at:null,created_at:"2026-08-28T07:00:00Z",updated_at:"2026-08-28T08:00:00Z",password_hash:"secret"});
  assert.equal(user.inviteSentAt,"2026-08-28T08:00:00Z");
  assert.equal(user.mustChangePassword,true);
  assert.equal("password_hash" in user,false);
});

test("administrator e-mail changes use normalized format validation",()=>{
  assert.equal(isValidEmail(" New.Address+tag@Example.org "),true);
  assert.equal(isValidEmail("missing-at.example.org"),false);
  assert.equal(isValidEmail("two@@example.org"),false);
  assert.equal(isValidEmail("name@example"),false);
  assert.equal(isValidEmail("name\0@example.org"),false);
});
