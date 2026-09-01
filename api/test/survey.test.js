import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { SURVEY_DEMOGRAPHIC_LIBRARY,decryptSurveyToken,encryptSurveyToken,normalizeSurveyCampaign,surveyLanguage,surveyMediaUrl,surveyQualityFlags,surveyToken,surveyTokenHash,validateSurveyStart } from "../src/survey.js";
import { SURVEY_LONG_HEADERS,SURVEY_SUMMARY_HEADERS,surveyLongRows } from "../src/survey-export.js";

const root=path.resolve(import.meta.dirname,"../..");
const schema=fs.readFileSync(path.join(root,"api/src/schema.sql"),"utf8");
const routes=fs.readFileSync(path.join(root,"api/src/survey-routes.js"),"utf8");
const server=fs.readFileSync(path.join(root,"api/src/server.js"),"utf8");
const auth=fs.readFileSync(path.join(root,"api/src/auth.js"),"utf8");
const ui=fs.readFileSync(path.join(root,"index.html"),"utf8");
const worker=fs.readFileSync(path.join(root,"sw.js"),"utf8");

const campaign=(overrides={})=>({name:"Stork survey",photoCount:30,linkType:"reusable",permanent:true,contactName:"Research team",contactEmail:"team@example.org",introPl:"Wstęp",introEn:"Introduction",thanksPl:"Dziękujemy",thanksEn:"Thank you",...overrides});

test("campaign validation provides 30 photos by default and validates pool configuration",()=>{
  const result=normalizeSurveyCampaign(campaign({photoCount:undefined}));
  assert.equal(result.photoCount,30);
  assert.equal(result.expiresAt,null);
  assert.throws(()=>normalizeSurveyCampaign(campaign({photoCount:0})),/invalid_survey_photo_count/);
  assert.throws(()=>normalizeSurveyCampaign(campaign({dateFrom:"2026-02-01",dateTo:"2026-01-01"})),/invalid_survey_date_range/);
  assert.match(routes,/survey_photo_pool_too_small/);
  assert.match(routes,/p\.capture_time>=\$/);
  assert.match(routes,/p\.capture_time<=\$/);
});

test("demographics, adult confirmation and participation consent are mandatory",()=>{
  const configured={demographic_fields:["sex","year_of_birth"]};
  assert.throws(()=>validateSurveyStart({campaign:configured,ageConfirmed:false,consentAccepted:true,demographics:{sex:"female",year_of_birth:1990}}),/survey_age_confirmation_required/);
  assert.throws(()=>validateSurveyStart({campaign:configured,ageConfirmed:true,consentAccepted:false,demographics:{sex:"female",year_of_birth:1990}}),/survey_participation_consent_required/);
  assert.throws(()=>validateSurveyStart({campaign:configured,ageConfirmed:true,consentAccepted:true,demographics:{sex:"female"}}),/survey_demographic_required:year_of_birth/);
  assert.deepEqual(validateSurveyStart({campaign:configured,ageConfirmed:true,consentAccepted:true,demographics:{sex:"female",year_of_birth:1990,ignored:"x"}}),{sex:"female",year_of_birth:1990});
  assert.deepEqual(SURVEY_DEMOGRAPHIC_LIBRARY.sex.options.map(([id])=>id),["female","male","prefer_not_to_disclose"]);
  assert.equal(validateSurveyStart({campaign:{demographic_fields:["sex"]},ageConfirmed:true,consentAccepted:true,demographics:{sex:"prefer_not_to_disclose"}}).sex,"prefer_not_to_disclose");
});

test("language selection uses Polish for pl variants and English otherwise",()=>{
  assert.equal(surveyLanguage(["pl"]),"pl");
  assert.equal(surveyLanguage(["pl-PL","en"]),"pl");
  assert.equal(surveyLanguage(["de-DE","en-US"]),"en");
  assert.match(ui,/navigator\.languages/);
  assert.match(ui,/data-survey-lang="pl"/);
  assert.match(ui,/data-survey-lang="en"/);
  assert.match(ui,/storkSurveyLanguageV1/);
});

test("survey tokens are random and only their SHA-256 representation is queried",()=>{
  const first=surveyToken(),second=surveyToken();
  assert.notEqual(first,second);
  assert.ok(first.length>=32);
  assert.equal(surveyTokenHash(first).length,64);
  assert.match(routes,/WHERE link\.token_hash=\$1/);
  assert.match(routes,/surveyTokenHash\(token\)/);
  assert.doesNotMatch(schema,/raw_token/);
});

test("saved survey links are encrypted, recoverable and never stored as plaintext",()=>{
  const previous=process.env.SURVEY_LINK_ENCRYPTION_KEY;
  process.env.SURVEY_LINK_ENCRYPTION_KEY="survey-link-test-secret-with-at-least-32-characters";
  try{
    const token=surveyToken(),ciphertext=encryptSurveyToken(token);
    assert.notEqual(ciphertext,token);
    assert.doesNotMatch(ciphertext,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
    assert.equal(decryptSurveyToken(ciphertext),token);
    assert.equal(decryptSurveyToken(null),null);
  }finally{
    if(previous===undefined)delete process.env.SURVEY_LINK_ENCRYPTION_KEY;
    else process.env.SURVEY_LINK_ENCRYPTION_KEY=previous;
  }
  assert.match(schema,/token_ciphertext TEXT/);
  assert.match(routes,/GET|router\.get\("\/api\/surveys\/:id\/links"/);
  assert.match(routes,/decryptSurveyToken\(row\.token_ciphertext\)/);
});

test("survey media URLs resolve at the configured API origin for images, previews and Top 10",()=>{
  const base="https://api.example.test:18444",normal=surveyMediaUrl(base,{responseId:"response 1",photoId:"photo/1",mediaToken:"signed token"}),preview=surveyMediaUrl(base,{responseId:"response 1",photoId:"photo/1",mediaToken:"signed token",preview:true}),top=surveyMediaUrl(base,{responseId:"response 1",photoId:"photo/1",mediaToken:"top token",top:true});
  for(const url of [normal,preview,top]){assert.equal(new URL(url).origin,base);assert.doesNotMatch(url,/jankowiakl\.github\.io/);}
  assert.equal(new URL(preview).searchParams.get("kind"),"preview");
  assert.match(new URL(top).pathname,/\/top\/photo%2F1\/image$/);
  assert.throws(()=>surveyMediaUrl("",{responseId:"r",photoId:"p",mediaToken:"t"}),/survey_public_api_url_required/);
  assert.match(server,/createSurveyRouter\(\{db,transaction,publicApiUrl,publicAppUrl/);
});

test("survey storage is separate from internal photo ratings and fixes response order",()=>{
  for(const table of ["survey_campaigns","survey_links","survey_responses","survey_response_photos","survey_photo_ratings"])assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema,/PRIMARY KEY\(response_id,position\)/);
  assert.match(schema,/UNIQUE\(response_id,photo_id\)/);
  assert.match(routes,/INSERT INTO survey_response_photos\(response_id,photo_id,position\)/);
  assert.match(routes,/ORDER BY assigned\.position/);
  assert.doesNotMatch(routes,/(?<!survey_)photo_ratings/);
});

test("role policy permits managers to create while public participation needs no login",()=>{
  assert.match(routes,/router\.post\("\/api\/surveys",authenticateUser,requireRole\("admin","coordinator"\)/);
  assert.match(routes,/router\.get\("\/api\/survey-results\/photos",authenticateUser/);
  assert.match(routes,/router\.get\("\/api\/public\/surveys\/:token",publicLimiter/);
  assert.doesNotMatch(routes,/router\.get\("\/api\/public\/surveys\/:token",authenticateUser/);
  assert.match(server,/createSurveyRouter/);
});

test("rating and completion endpoints enforce assigned photos, 1-5 and immutability",()=>{
  assert.match(routes,/rating<1\|\|rating>5/);
  assert.match(routes,/photo_not_assigned_to_survey_response/);
  assert.match(routes,/if\(response\.status==="completed"\)return res\.status\(409\)/);
  assert.match(routes,/rows\.length!==total/);
  assert.match(routes,/survey_photos_not_all_rated/);
  assert.match(routes,/status='completed',completed_at/);
});

test("reusable and single-use sessions cannot silently replace their fixed response",()=>{
  assert.match(routes,/link\.link_type==="single_use"/);
  assert.match(schema,/idx_survey_single_response_per_link/);
  assert.match(routes,/respondent_token_hash=\$2/);
  assert.match(ui,/storkSurveyResponse:/);
  assert.match(ui,/respondentToken/);
  assert.match(routes,/if\(existing\)return\{link,response:existing/);
});

test("public media is scoped to response and photo and map data is scoped to represented birds",()=>{
  assert.match(auth,/scope="survey-media"/);
  assert.match(routes,/payload\.responseId/);
  assert.match(routes,/payload\.photoId/);
  assert.match(routes,/photo_not_assigned_to_survey_response/);
  assert.match(routes,/surveyBirdAllowed/);
  assert.match(routes,/bird_not_in_survey_response/);
  assert.match(ui,/mode:"SURVEY"/);
  assert.match(ui,/loadGpsDataset/);
  assert.match(ui,/loadStopoverDataset/);
  assert.match(ui,/scheduleSharedSafeRefresh/);
});

test("global Top 10 uses completed included survey responses and minimum five ratings",()=>{
  const top=routes.match(/const topRows=[\s\S]*?LIMIT 10/)?.[0]||"";
  assert.match(top,/survey_photo_ratings/);
  assert.match(top,/response\.status='completed'/);
  assert.match(top,/response\.included=true/);
  assert.match(top,/HAVING count\(\*\)>=5/);
  assert.match(top,/average_rating DESC,rating_count DESC,p\.id/);
  assert.doesNotMatch(top,/(?<!survey_)photo_ratings/);
  assert.match(ui,/minimum 5 independent ratings|co najmniej 5 niezależnych ocen/);
});

test("quality flags cover identical, low variance and unusually fast responses",()=>{
  assert.ok(surveyQualityFlags([3,3,3],"2026-01-01T00:00:00Z","2026-01-01T00:10:00Z").includes("all_ratings_identical"));
  assert.ok(surveyQualityFlags([3,3,3,4],"2026-01-01T00:00:00Z","2026-01-01T00:10:00Z").includes("very_low_rating_variance"));
  assert.ok(surveyQualityFlags([1,2,3,4,5],"2026-01-01T00:00:00Z","2026-01-01T00:00:05Z").includes("completed_unusually_fast"));
  assert.match(routes,/"incomplete"/);
});

test("long and summary exports expose the intended research columns",()=>{
  assert.deepEqual(SURVEY_LONG_HEADERS.slice(0,4),["survey_id","response_id","photo_id","rating"]);
  assert.ok(SURVEY_LONG_HEADERS.includes("white_stork_knowledge"));
  assert.ok(SURVEY_LONG_HEADERS.includes("quality_flags"));
  assert.ok(SURVEY_SUMMARY_HEADERS.includes("completion_rate_percent"));
  const [row]=surveyLongRows([{survey_id:"s",response_id:"r",photo_id:"p",rating:5,demographics:{sex:"female"}}]);
  assert.equal(row.sex,"female");
  assert.equal(row.rating,5);
  assert.match(routes,/\/api\/survey-results\/export-summary/);
  assert.match(routes,/\/api\/survey-results\/export-long/);
});

test("frontend reuses one collection viewer, omits Play in survey mode and preserves local drafts",()=>{
  assert.match(ui,/openPhotoCollection\("survey"/);
  assert.match(ui,/body\.surveyMode/);
  assert.match(ui,/storkSurveyDraft:/);
  assert.match(ui,/Rating kept locally/);
  assert.match(ui,/body\.surveyMode #collectionPlay/);
  assert.match(ui,/renderSurveyRatingDock/);
});

test("survey UI is bilingual, responsive and service worker cache is bumped",()=>{
  for(const width of [700])assert.match(ui,new RegExp(`max-width:${width}px`));
  assert.match(ui,/Potwierdzam, że mam ukończone 18 lat/);
  assert.match(ui,/I confirm that I am at least 18 years old/);
  assert.match(ui,/Submit survey/);
  assert.match(ui,/Wyślij ankietę/);
  assert.match(ui,/\["PUBLIC_READONLY","SURVEY","SURVEY_REWARD"\]\.includes\(photoSafeViewerContext\?\.mode\)/);
  assert.match(ui,/body\.surveyMode \.photoNav \{[^}]*opacity:\.86!important;[^}]*pointer-events:auto!important/);
  assert.match(ui,/body\.surveyMode \.photoNav:disabled \{[^}]*opacity:\.28!important/);
  assert.match(ui,/requestAnimationFrame\(\(\)=>requestAnimationFrame\(refreshMapSizes\)\)/);
  assert.match(worker,/stork-edit2-shell-v2026-09-01-49/);
});

test("mobile Survey keeps a compact rating row between photo and map",()=>{
  assert.match(ui,/syncSurveyRatingDockPlacement[\s\S]*?wrapEl\.appendChild\(surveyRatingDockEl\)/);
  assert.match(ui,/body\.surveyMode \.wrap\{[^}]*grid-template-rows:minmax\(0,3fr\) auto minmax\(0,2fr\)/);
  assert.match(ui,/body\.surveyMode \.side\{[^}]*grid-row:1/);
  assert.match(ui,/body\.surveyMode \.wrap>\.surveyRatingDock\{[^}]*grid-row:2[^}]*display:flex[^}]*flex-wrap:nowrap/);
  assert.match(ui,/body\.surveyMode \.mapStack\{[^}]*grid-row:3/);
  assert.match(ui,/ResizeObserver[\s\S]*refreshMapSizes/);
  assert.match(ui,/orientationchange/);
  assert.match(ui,/surveyCoachTargets[\s\S]*target:surveyStarsEl[\s\S]*target:nextPhotoBtn[\s\S]*target:mapStackEl/);
});

test("Survey campaign UI supports persisted link QR PDFs and demographic bulk selection",()=>{
  assert.match(ui,/src="vendor\/qrcode\.min\.js"/);
  assert.match(ui,/src="vendor\/jspdf\.umd\.min\.js"/);
  assert.match(ui,/generateSurveyQrPdf/);
  assert.match(ui,/Single-use survey code/);
  assert.match(ui,/Jednorazowy kod do ankiety/);
  assert.doesNotMatch(ui,/window\.print\(/);
  assert.match(ui,/\/api\/surveys\/\$\{encodeURIComponent\(campaign\.id\)\}\/links/);
  assert.match(ui,/bindSurveySelectAll\("surveyCreateSelectAll"/);
  assert.match(ui,/bindSurveySelectAll\("surveyEditSelectAll"/);
  assert.match(ui,/toggle\.indeterminate/);
  assert.match(ui,/surveyCountrySearch/);
  assert.match(ui,/normalize\("NFD"\)/);
  assert.match(ui,/rank:code==="PL"\?0:code==="DE"\?1/);
});

test("Survey country picker covers the world, prioritizes Poland and Germany and searches both languages",()=>{
  const codes=ui.match(/const surveyCountryCodes="([A-Z ]+)"\.split\(" "\)/)?.[1].split(" ")||[];
  assert.ok(codes.length>=190,"the picker must not be limited to Europe");
  assert.equal(new Set(codes).size,codes.length);
  const european=new Set((ui.match(/const surveyEuropeanCountries=new Set\("([A-Z ]+)"\.split/)?.[1]||"").split(" "));
  const normalize=(value)=>String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const pl=new Intl.DisplayNames(["pl"],{type:"region"}),en=new Intl.DisplayNames(["en"],{type:"region"});
  const items=codes.map((code)=>({code,pl:pl.of(code),en:en.of(code),rank:code==="PL"?0:code==="DE"?1:european.has(code)?2:3})).sort((a,b)=>a.rank-b.rank||a.pl.localeCompare(b.pl,"pl"));
  assert.deepEqual(items.slice(0,2).map((item)=>item.code),["PL","DE"]);
  const search=(query)=>items.filter((item)=>[item.pl,item.en,item.code].some((value)=>normalize(value).includes(normalize(query)))).map((item)=>item.code);
  assert.ok(search("pol").includes("PL"));assert.ok(search("niem").includes("DE"));assert.ok(search("germ").includes("DE"));assert.ok(search("fran").includes("FR"));
});

test("survey research results expose paginated photos, campaign comparison and real media metadata",()=>{
  assert.match(routes,/\/api\/survey-results\/photos/);
  assert.match(routes,/pageSize=Math\.max\(10,Math\.min\(100/);
  assert.match(routes,/\/api\/survey-results\/comparison/);
  assert.match(routes,/globalAverage/);
  assert.match(routes,/overallRatingCount/);
  assert.match(routes,/photos:photoResults\.map\(\(row\)=>\(\{\.\.\.photoPublic/);
  assert.match(routes,/SELECT assigned\.position,p\.\*,rating\.rating/);
  assert.match(ui,/Global campaign comparison/);
  assert.match(ui,/Average survey rating|Overall average rating/);
  assert.match(ui,/surveyResultsSearch/);
  assert.match(ui,/surveyResultsSort/);
  assert.match(ui,/const SURVEY_RESULTS_PAGE_SIZE=20/);
  assert.match(ui,/pageSize:String\(SURVEY_RESULTS_PAGE_SIZE\)/);
  assert.match(ui,/surveyCollapsibleTableHtml/);
  assert.match(ui,/comparisonPhotos\.slice\(comparisonStart,comparisonStart\+SURVEY_RESULTS_PAGE_SIZE\)/);
  assert.match(ui,/photos\.slice\(photoStart,photoStart\+SURVEY_RESULTS_PAGE_SIZE\)/);
  assert.match(ui,/admin=role==="admin"/);
  assert.match(ui,/admin\?apiFetch\("\/api\/surveys"\)/);
  assert.match(ui,/dataPanelEl\.innerHTML=`\$\{adminCampaigns\}<h3>Survey results/);
});

test("manager UI renders demographic groups and anonymous response details without debug alerts",()=>{
  assert.match(ui,/surveyDemographicGroupsHtml/);
  assert.match(ui,/N &lt; 5 — result hidden/);
  assert.match(ui,/showSurveyResponseDetails/);
  assert.match(ui,/Anonymous response/);
  assert.match(ui,/Quality flags/);
  assert.doesNotMatch(ui,/alert\(JSON\.stringify\(detail\.response/);
  assert.match(ui,/All ratings identical/);
  assert.match(ui,/Completed unusually fast/);
});

test("campaign editor exposes structure before responses and previews restored bilingual defaults",()=>{
  assert.match(ui,/surveyEditPhotoCount/);
  assert.match(ui,/surveyEditDateFrom/);
  assert.match(ui,/surveyEditDateTo/);
  assert.match(ui,/surveyEditField/);
  assert.match(ui,/nobody has started this campaign/);
  assert.match(ui,/Defaults restored in the form\. Click Save to persist them/);
  assert.match(routes,/survey_structure_locked_after_start/);
  assert.match(routes,/Object\.prototype\.hasOwnProperty\.call\(req\.body,key\)/);
});

test("first-photo tutorial uses anchored bilingual coach marks and remains restartable",()=>{
  assert.match(ui,/surveyCoachTargets/);
  assert.match(ui,/target:surveyStarsEl/);
  assert.match(ui,/target:nextPhotoBtn/);
  assert.match(ui,/target:mapStackEl/);
  assert.match(ui,/surveyCoachTarget/);
  assert.match(ui,/Rate the photo here/);
  assert.match(ui,/Tutaj oceń zdjęcie/);
  assert.match(ui,/surveyHelpBtn\.addEventListener\("click",\(\)=>showSurveyTutorial\(0\)\)/);
});
