import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_INVITATION_BODY,DEFAULT_INVITATION_SUBJECT,INVITATION_BODY_MAX_LENGTH,
  INVITATION_PLACEHOLDERS,generateInvitationMessage,invitationFallbackUrls,validateInvitationTemplate
} from "../src/invitation-template.js";

const server=await readFile(new URL("../src/server.js",import.meta.url),"utf8");
const schema=await readFile(new URL("../src/schema.sql",import.meta.url),"utf8");
const ui=await readFile(new URL("../../index.html",import.meta.url),"utf8");

test("one plain-text generator replaces every documented invitation placeholder",()=>{
  assert.deepEqual(INVITATION_PLACEHOLDERS,["name","email","role","appUrl","temporaryPassword","permissions","accessDescription"]);
  const message=generateInvitationMessage({subjectTemplate:"Welcome {{name}} — {{role}}",bodyTemplate:"{{email}}\n{{appUrl}}\n{{temporaryPassword}}\n{{permissions}}{{accessDescription}}"},{name:"Łukasz",email:"lukasz@example.org",role:"Użytkownik",appUrl:"https://stork.example/",temporaryPassword:"Temp-42",permissions:"Can annotate",accessDescription:"\nRestricted rules"});
  assert.equal(message.subject,"Welcome Łukasz — Użytkownik");
  assert.match(message.body,/lukasz@example\.org[\s\S]*Temp-42[\s\S]*Restricted rules/);
  assert.doesNotMatch(message.body,/{{|}}/);
});

test("template validation limits content and rejects unknown or malformed placeholders",()=>{
  assert.doesNotThrow(()=>validateInvitationTemplate("{{name}} / {{name}}",DEFAULT_INVITATION_BODY));
  assert.throws(()=>validateInvitationTemplate("Subject {{unknown}}",DEFAULT_INVITATION_BODY),/invalid_invitation_placeholder/);
  assert.throws(()=>validateInvitationTemplate("Subject\nInjected",DEFAULT_INVITATION_BODY),/invalid_invitation_subject_template/);
  assert.throws(()=>validateInvitationTemplate(DEFAULT_INVITATION_SUBJECT,"x".repeat(INVITATION_BODY_MAX_LENGTH+1)),/invalid_invitation_body_template/);
  assert.throws(()=>validateInvitationTemplate(DEFAULT_INVITATION_SUBJECT,"Broken {{name"),/invalid_invitation_placeholder/);
});

test("Gmail and mailto fallbacks encode the same generated subject and full body",()=>{
  const message=generateInvitationMessage({subjectTemplate:DEFAULT_INVITATION_SUBJECT,bodyTemplate:DEFAULT_INVITATION_BODY},{name:"Example",email:"recipient@example.org",role:"Coordinator",appUrl:"https://app.example/",temporaryPassword:"ExampleTemporaryPassword",permissions:"Moderation",accessDescription:""}),urls=invitationFallbackUrls({email:"recipient@example.org",...message}),mailto=new URL(urls.mailtoUrl),gmail=new URL(urls.gmailUrl);
  assert.equal(decodeURIComponent(mailto.pathname),"recipient@example.org");
  assert.equal(mailto.searchParams.get("subject"),message.subject);
  assert.equal(mailto.searchParams.get("body"),message.body);
  assert.equal(gmail.searchParams.get("to"),"recipient@example.org");
  assert.equal(gmail.searchParams.get("su"),message.subject);
  assert.equal(gmail.searchParams.get("body"),message.body);
});

test("administrator template endpoints, storage and audit are protected and explicit",()=>{
  assert.match(schema,/CREATE TABLE IF NOT EXISTS email_invitation_settings/);
  assert.match(schema,/subject_template TEXT NOT NULL CHECK \(char_length\(subject_template\) BETWEEN 1 AND 200\)/);
  assert.match(schema,/body_template TEXT NOT NULL CHECK \(char_length\(body_template\) BETWEEN 1 AND 10000\)/);
  assert.match(server,/app\.get\("\/api\/admin\/invitation-template",authenticateUser,requireRole\("admin"\)/);
  assert.match(server,/app\.patch\("\/api\/admin\/invitation-template",authenticateUser,requireRole\("admin"\),writeLimiter/);
  assert.match(server,/app\.post\("\/api\/admin\/invitation-template\/preview",authenticateUser,requireRole\("admin"\),writeLimiter/);
  assert.match(server,/email_invitation_template_updated/);
  assert.match(server,/ExampleTemporaryPassword/);
  assert.match(server,/message=await inviteMessage\(user,password,profile\)/);
  assert.match(server,/subject:message\.subject,text:message\.body/);
});

test("admin UI edits, restores and safely previews templates",()=>{
  assert.match(ui,/Email invitation template/);
  assert.match(ui,/id="inviteTemplateSubject"/);
  assert.match(ui,/id="inviteTemplateBody"/);
  assert.match(ui,/id="previewInviteTemplate"/);
  assert.match(ui,/id="restoreInviteTemplate"/);
  assert.match(ui,/ExampleTemporaryPassword/);
  assert.match(ui,/inviteTemplatePreview"\)\.textContent/);
});

test("mobile invitation fallback prefers mailto while desktop retains Gmail compose",()=>{
  assert.match(ui,/const preferMailClientFallback=/);
  assert.match(ui,/Android\|iPhone\|iPad\|iPod\|Mobile\|Tablet/);
  assert.match(ui,/fallbackUrl=mobile\?\(invite\?\.mailtoUrl\|\|invite\?\.gmailUrl\)/);
  assert.match(ui,/if\(mobile&&invite\?\.mailtoUrl\)\{window\.location\.assign\(invite\.mailtoUrl\);return;\}/);
  assert.match(ui,/if\(gmail\)\{const opened=window\.open\(invite\.gmailUrl/);
});
