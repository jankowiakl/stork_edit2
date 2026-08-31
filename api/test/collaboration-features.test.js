import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema=await readFile(new URL("../src/schema.sql",import.meta.url),"utf8");
const server=await readFile(new URL("../src/server.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../index.html",import.meta.url),"utf8");
const manifest=JSON.parse(await readFile(new URL("../../manifest.webmanifest",import.meta.url),"utf8"));
const serviceWorker=await readFile(new URL("../../sw.js",import.meta.url),"utf8");
const invitationTemplate=await readFile(new URL("../src/invitation-template.js",import.meta.url),"utf8");

test("user photo collections are server-side and cascade with photos",()=>{
  assert.match(schema,/CREATE TABLE IF NOT EXISTS user_photo_favorites/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS photo_ratings/);
  assert.match(schema,/photo_id TEXT NOT NULL REFERENCES photos\(id\) ON DELETE CASCADE/);
  assert.match(server,/\/api\/me\/photo-collection/);
  assert.match(server,/app\.delete\("\/api\/photos\/:id\/rating"/);
  assert.match(schema,/ALTER TABLE user_photo_favorites ADD COLUMN IF NOT EXISTS sort_order INTEGER/);
  assert.match(schema,/idx_favorites_user_order/);
  assert.match(server,/\/api\/me\/photo-collection\/favorites\/order/);
});

test("manual invitations provide a Gmail compose link and role permissions",()=>{
  assert.match(invitationTemplate,/https:\/\/mail\.google\.com\/mail\//);
  assert.match(invitationTemplate,/Uprawnienia:/);
  assert.match(server,/gmailUrl/);
  assert.match(server,/Tryb konta: Restricted Contributor/);
  assert.match(server,/Ukończenie jednego rekordu jako complete rozpoczyna nowy cykl/);
  assert.match(server,/Prywatny sejf zdjęć odblokuje się po/);
  assert.match(server,/Pełny dostęp do kolekcji odblokuje się po/);
});

test("the private photo safe and top rated reuse the main viewer and offer a table",()=>{
  assert.match(ui,/collectionBrowseState/);
  assert.match(ui,/openPhotoCollection/);
  assert.match(ui,/collectionTableMode/);
  assert.match(ui,/class="ratedTable"/);
  assert.match(ui,/method:"DELETE"/);
});

test("the GitHub Pages application is installable as a PWA",()=>{
  assert.equal(manifest.display,"standalone");
  assert.match(ui,/rel="manifest" href="manifest\.webmanifest"/);
  assert.match(ui,/serviceWorker\.register\("\.\/sw\.js"\)/);
  assert.match(serviceWorker,/APP_SHELL/);
});

test("a user cannot create a second active draft",()=>{
  assert.match(server,/pg_advisory_xact_lock/);
  assert.match(server,/a\.updated_by=\$1 AND a\.status='draft' AND a\.photo_id<>\$2/);
  assert.match(server,/active_draft_exists/);
});

test("editor panel switcher is outside the form panel and offers all three views",()=>{
  const switcher=ui.match(/<div class="editorMobileTabs" id="editorModeSwitcher"[\s\S]*?<\/div>/)?.[0]||"";
  assert.match(switcher,/data-editor-tab="map"/);
  assert.match(switcher,/data-editor-tab="form"/);
  assert.match(switcher,/data-editor-tab="photo"/);
  assert.equal((ui.match(/id="editorModeSwitcher"/g)||[]).length,1);
});

test("category proposals and review requests keep an audit workflow",()=>{
  assert.match(schema,/status TEXT NOT NULL DEFAULT 'pending' CHECK \(status IN \('pending','resolved','rejected'\)\)/);
  assert.match(server,/category_reason_required/);
  assert.match(server,/\/api\/review-requests/);
});

test("photo media is private and restricted access is bound to the active browsing cycle",()=>{
  assert.match(server,/app\.get\("\/api\/public\/photos\/:id\/image",authenticateMediaUser,authorizeMediaAndServe\)/);
  assert.match(server,/app\.get\("\/api\/photos\/:id\/image",authenticateUser,authorizeMediaAndServe\)/);
  assert.match(server,/app\.get\("\/api\/public\/individuals\/:id\/photos",\(_req,res\)=>res\.status\(401\)/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS user_photo_access/);
  assert.match(schema,/PRIMARY KEY\(user_id,photo_id\)/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS user_browse_cycle_state/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS user_browse_cycle_photos/);
  assert.match(server,/user_browse_cycle_state cycle JOIN user_browse_cycle_photos unlocked/);
});

test("restricted tables do not preload media that has not been unlocked",()=>{
  assert.match(ui,/restricted&&!photo\.mediaGranted\?`<button class="secondary tiny tablePreviewUnlock"/);
  assert.match(ui,/restricted&&!photo\.mediaGranted\?`<button class="secondary tiny collectionOpenPhoto"/);
  assert.match(ui,/deferInitialAccess:true/);
  assert.match(ui,/if\(!deferInitialAccess\)void showPhotoAtIndex\(0\)/);
});

test("restricted annotation escape hatch is limited to five editable focused photos",()=>{
  assert.match(schema,/CREATE TABLE IF NOT EXISTS restricted_annotation_focus/);
  assert.match(schema,/PRIMARY KEY\(user_id,photo_id\)/);
  assert.match(server,/INSERT INTO restricted_annotation_focus\(user_id,photo_id,granted_at\)/);
  assert.match(server,/profile\.restricted&&profile\.browseLimitReached&&!taskAssigned&&!focusActive/);
  assert.match(server,/DELETE FROM restricted_annotation_focus WHERE user_id=\$1 AND photo_id=\$2/);
  assert.match(server,/p\.latitude IS NOT NULL","p\.longitude IS NOT NULL/);
  assert.match(server,/DELETE FROM restricted_annotation_focus f WHERE f\.user_id=\$1 AND NOT EXISTS/);
  assert.match(server,/LIMIT 5/);
  assert.match(ui,/queue=result\.photos\?\.length/);
  assert.match(ui,/activateTrack\(focusedTrack\)/);
});

test("collections provide jump playback, compact tables and authenticated downloads",()=>{
  const tableRenderer=ui.match(/const loadCollectionPhotosPanel=[\s\S]*?const loadRatedPhotosPanel/)?.[0]||"";
  assert.match(ui,/showCollectionSequencePhoto/);
  assert.match(ui,/id="collectionPlay"/);
  assert.match(ui,/Download matching photos \(ZIP\)/);
  assert.match(tableRenderer,/<th>Average<\/th>/);
  assert.doesNotMatch(tableRenderer,/<th>Filename<\/th>/);
  assert.match(server,/\/api\/photos\/:id\/download/);
  assert.match(server,/\/api\/me\/photo-collection\/download/);
  assert.match(server,/collection==="favorites"/);
  assert.match(server,/FROM user_photo_favorites f JOIN photos p/);
  assert.match(server,/sendZip\(res,rows,\[\],photoDir,downloadName\)/);
  assert.match(ui,/Download my photo safe \(ZIP\)/);
  assert.match(ui,/photoSafeMode/);
  assert.match(ui,/photoRatingEl\.hidden=photoSafeMode/);
  assert.match(tableRenderer,/if\(isSafe\)return/);
});

test("photo safe navigation follows the complete cross-bird collection",()=>{
  assert.match(ui,/classList\.contains\("collectionMode"\)&&collectionSequence\.length/);
  assert.match(ui,/canStep=collectionSequence\.length>1/);
  assert.match(ui,/prevPhotoBtn\.disabled=!canStep/);
  assert.match(ui,/nextPhotoBtn\.disabled=!canStep/);
  assert.match(ui,/showCollectionSequencePhoto\(collectionSequenceIndex\+direction\)/);
  assert.match(ui,/navigatePhotoSequenceBy\(-1\)/);
  assert.match(ui,/navigatePhotoSequenceBy\(1\)/);
});

test("all Photo Safe modes reuse the main photo and map transition engine",()=>{
  assert.equal((ui.match(/const renderPhotoTransitionFrame=/g)||[]).length,1);
  assert.match(ui,/const renderFrame = \(i, t, ts\) => \{[\s\S]*?renderPhotoTransitionFrame\(a,b,t,ts\)/);
  assert.match(ui,/const animateCollectionTransition=[\s\S]*?renderPhotoTransitionFrame\(fromPoint,toPoint,t,ts,\{trail:null,moveMap:false\}\)/);
  assert.match(ui,/lat=lerp\(a\.lat,b\.lat,t\),lon=lerpLonShortest\(a\.lon,b\.lon,t\)/);
  assert.match(ui,/imgA\.style\.opacity=\(1-t\)\.toFixed\(3\)/);
  assert.match(ui,/imgB\.style\.opacity=t\.toFixed\(3\)/);
  assert.match(ui,/followMap\.setView\(latlng,followMap\.getZoom\(\),\{animate:true,duration:/);
  assert.match(ui,/await loadTrackFor\(selected\.bird,\{autoplay:false,deferInitialAccess:true,preserveVisualState:!!previousPoint\}\)/);
  assert.match(ui,/scheduleCollectionPlayback=[\s\S]*?showCollectionSequencePhoto\(collectionSequenceIndex\+1\)/);
  assert.match(ui,/navigatePhotoSequenceBy=[\s\S]*?showCollectionSequencePhoto\(collectionSequenceIndex\+direction\)/);
});

test("all photo viewers use keyboard arrows and shared presentation controls",()=>{
  assert.match(ui,/\["ArrowLeft","ArrowRight"\]\.includes\(event\.key\)/);
  assert.match(ui,/navigatePhotoSequenceBy\(event\.key==="ArrowLeft"\?-1:1\)/);
  assert.match(ui,/id="collectionInterval" type="number" min="1" max="120"/);
  assert.match(ui,/id="collectionOrder" aria-label="Photo safe presentation order"/);
  assert.match(ui,/const orderCollectionSequence=/);
  assert.match(ui,/String\(a\.bird\|\|""\)\.localeCompare/);
  assert.match(ui,/collectionOrderPreference="custom"/);
  assert.match(ui,/topPicturesOrderPreference="rating_desc"/);
  assert.match(ui,/storkTopPicturesOrderV1/);
  assert.match(ui,/\["rating_desc","Rating"\],\["bird_time","Bird, then time"\],\["date_asc","Date and time"\]/);
  assert.match(ui,/if\(order==="rating_desc"\)/);
  assert.match(ui,/collectionSequence=surveyMode\?usable:orderCollectionSequence\(usable,activeCollectionOrder\(\)\)/);
  assert.match(ui,/class="secondary tiny safeMove"/);
  assert.match(server,/sort==="custom"\?"f\.sort_order NULLS LAST/);
});

test("the shared collection viewer keeps a compact map-bound floating toolbar",()=>{
  assert.match(ui,/id="collectionModeLabel" aria-label="Photo collection position">🔐 0 \/ 0/);
  assert.match(ui,/collectionModeLabelEl\.textContent=`\$\{survey\?"✦":safe\?"🔐":"☆"\} \$\{position\}`/);
  assert.match(ui,/label=survey\?"Survey":safe\?"My photo safe":"Top rated"/);
  assert.match(ui,/<div class="card mapStack">[\s\S]*?<div class="collectionModeBar" id="collectionModeBar" hidden>[\s\S]*?<div class="mapControlDock"/);
  assert.match(ui,/\.collectionModeBar \{ position:absolute; top:10px; left:50%; bottom:auto; transform:translateX\(-50%\)/);
  assert.match(ui,/\.collectionModeBar \{ top:max\(7px,env\(safe-area-inset-top\)\); right:auto; bottom:auto; left:50%;[^}]*max-width:calc\(100% - 92px\)/);
  assert.match(ui,/min-width:42px; min-height:42px/);
  assert.match(ui,/flex-wrap:nowrap/);
  assert.match(ui,/@keyframes collectionBarMobileEnter/);
  assert.match(ui,/collectionToolbarIdleTimer=setTimeout\(\(\)=>setCollectionToolbarCollapsed\(true\),collectionPlaying\?3000:4500\)/);
  assert.match(ui,/collectionToolbarCollapsed #collectionDetailsToggle/);
  assert.match(ui,/wrapEl\.addEventListener\("pointermove",\(\)=>\{if\(document\.body\.classList\.contains\("collectionMode"\)\)revealCollectionToolbar\(\);\}\)/);
});

test("responsive defaults and mobile editor controls remain compact",()=>{
  assert.match(ui,/<option value="1\.25" selected>125%/);
  assert.match(ui,/@media\(max-width:700px\)\{:root\{--ui-font-scale:1;/);
  assert.match(ui,/recommendedScale=isMobile\(\)\?"1":"1\.25"/);
  assert.match(ui,/if\(validFontScales\.has\(savedFontScale\)\)fontScaleEl\.value=savedFontScale/);
  assert.match(ui,/id="adminRecoveryDetails"[^>]*hidden aria-hidden="true"/);
  assert.match(ui,/<select id="editorEnvDesc" data-field="Env_desc_en">/);
});

test("all Photo Safe viewer modes share compact collapsible presentation details",()=>{
  assert.match(ui,/id="collectionDetailsToggle"[^>]*aria-expanded="false"/);
  assert.match(ui,/id="collectionDetails"[^>]*hidden/);
  assert.match(ui,/const setCollectionDetailsOpen=/);
  assert.match(ui,/setCollectionDetailsOpen\(false\)/);
  assert.match(ui,/id="collectionInterval"/);
  assert.match(ui,/id="collectionOrder"/);
  assert.match(ui,/id="collectionTableMode"/);
  assert.match(ui,/id="collectionShare"/);
  assert.match(ui,/--slideshow-font:clamp\(12px,var\(--ui-font-control\),14px\)/);
  assert.match(ui,/body\.collectionMode #sliderOverlay \{ display:none!important; \}/);
  assert.match(ui,/\.collectionDetails \{ position:absolute; top:calc\(100% \+ 7px\); right:auto; bottom:auto; left:50%; transform:translateX\(-50%\)/);
  assert.match(ui,/\.collectionModeBar \.collectionDetails \{ top:calc\(100% \+ 6px\);[^}]*width:min\(310px,calc\(100vw - 18px\)\);[^}]*max-height:min\(calc\(var\(--mobile-map-height\) - 74px\),32dvh,240px\)/);
  assert.match(ui,/document\.body\.classList\.toggle\("collectionDetailsOpen",visible\)/);
  assert.doesNotMatch(ui,/mapStackEl\.appendChild\(collectionDetailsEl\)/);
  assert.match(ui,/collectionDetailsEl\.contains\(event\.target\)/);
  assert.equal((ui.match(/id="collectionDetails"/g)||[]).length,1);
});

test("one thumbnail basemap switcher and map-settings panel serve every map viewer",()=>{
  assert.equal((ui.match(/id="mapControlDock"/g)||[]).length,1);
  assert.match(ui,/id="mapBasemapToggle"[^>]*aria-controls="mapBasemapPanel"/);
  assert.match(ui,/id="mapSettingsToggle"[^>]*aria-controls="mapSettingsPanel"/);
  assert.match(ui,/class="basemapGrid" id="basemapGrid"/);
  assert.match(ui,/const baseShortLabels=\{osmStd:"OSM Standard",osmDE:"OSM DE",cartoPos:"Positron",cartoVoy:"Voyager",opentopo:"OpenTopo",plOrtho:"PL Ortho",esriImageryLabels:"Esri \+ Labels",esriImagery:"Esri Imagery"\}/);
  assert.match(ui,/const renderBasemapChoices=/);
  assert.match(ui,/button\.addEventListener\("click",\(\)=>\{applyBasemap\(key\);closeMapControlPanels\(\);\}\)/);
  assert.match(ui,/document\.addEventListener\("pointerdown",\(event\)=>\{if\(!mapControlDockEl\.contains\(event\.target\)\)closeMapControlPanels\(\);\}\)/);
  assert.match(ui,/mapSettingsContentEl\.append\(mapFollowRow,showGpsTrackEl\.closest\("\.checkRow"\),backgroundDataStatusEl,lineStyleDetailsEl\)/);
  assert.match(ui,/const MAP_PREFERENCES_KEY="storkMapPreferencesV1"/);
  assert.match(ui,/showGpsTrack:showGpsTrackEl\.checked/);
  assert.match(ui,/showPhotoGpsSegment:showPhotoGpsSegmentEl\.checked/);
  assert.match(ui,/showStopovers:showStopoversEl\.checked/);
  assert.match(ui,/\.mapControlDock \{[\s\S]*?right:12px;[\s\S]*?bottom:32px;[\s\S]*?left:12px;/);
  assert.match(ui,/\.mapControlPanel \{[\s\S]*?width:min\(360px,100%\);[\s\S]*?overflow:auto;/);
});

test("contribution dashboard reveals only earned badges and progress to the next one",()=>{
  const renderer=ui.match(/const renderContributionDashboard=[\s\S]*?const loadContributionDashboard/)?.[0]||"";
  assert.match(renderer,/Your current badge/);
  assert.match(renderer,/levels\.slice\(0,currentIndex\+1\)/);
  assert.match(renderer,/Progress to the next badge/);
  assert.match(renderer,/c-currentLevel\.threshold/);
  assert.doesNotMatch(renderer,/class="levelBox locked/);
});

test("the browsing lock explains configurable rewards and links to personal progress",()=>{
  assert.match(ui,/id="browseLockRewards"/);
  assert.match(ui,/Private photo safe/);
  assert.match(ui,/Full photo collection/);
  assert.match(ui,/Publication acknowledgements/);
  assert.match(ui,/Scientific Contributor/);
  assert.match(ui,/settings\.fullAccessThreshold\?\?400/);
  assert.match(ui,/id="browseLockAccount"/);
  assert.match(ui,/browseLockAccountBtn\.addEventListener\("click",openAccountWorkspace\)/);
  assert.match(ui,/complete progress are available in your personal account/);
});

test("photo information remains enabled across manual and playback navigation",()=>{
  assert.match(ui,/let currentPhotoDetails=null,photoInfoEnabled=false/);
  assert.match(ui,/setPhotoInfoEnabled\(!photoInfoEnabled\)/);
  assert.match(ui,/framePhotoId&&framePhotoId!==socialPhotoId/);
  assert.doesNotMatch(ui,/Geographical description not recorded/);
  assert.doesNotMatch(ui,/No descriptive information for this photo/);
  assert.doesNotMatch(ui,/photoInfoOverlayEl\.hidden=true/);
  assert.match(ui,/\.photoInfoToggle \{ right:12px; bottom:calc\(92px/);
  assert.match(ui,/const photoAboveGround=/);
  assert.match(ui,/Number\(altitude\)-Number\(elevation\)/);
  assert.match(ui,/>GPS altitude \(m\):<\/b>/);
  assert.match(ui,/>Above ground \(m\):<\/b>/);
});

test("navigation tiles and panel grids scale with the selected font",()=>{
  assert.match(ui,/\.appNavDrawer \{ width:min\(22em/);
  assert.match(ui,/\.appNavTiles \{ grid-template-columns:1fr/);
  assert.match(ui,/\.appNavTile \{ min-height:3\.65em; height:auto/);
  assert.match(ui,/\.userGrid,\.importGrid \{ grid-template-columns:repeat\(auto-fit/);
  assert.match(ui,/\.contributionMetric,\.nextRewardBox,\.progressCard,\.userCard,\.importCard,\.optionsSection,\.appNavTile \{ height:auto/);
});

test("individual progress cards render a visible blue completion bar",()=>{
  assert.match(ui,/class="individualProgressBar" role="progressbar"/);
  assert.match(ui,/aria-valuenow="\$\{percent\}"/);
  assert.match(ui,/class="individualProgressFill" style="--progress:\$\{percent\}%;width:\$\{percent\}%"/);
  assert.match(ui,/position:absolute; inset:0 auto 0 0/);
  assert.match(ui,/background:linear-gradient\(90deg,#168cff,#77d1ff\)/);
});

test("progress continue opens the first unfinished photo using the public bird field",()=>{
  assert.match(ui,/result\.photo\.bird\|\|button\.dataset\.bird,true,"progress"/);
  assert.doesNotMatch(ui,/result\.photo\.individual_id,true,"progress"/);
});

test("managers can review completed photos grouped by contributor in the regular editor",()=>{
  assert.match(ui,/data-app-nav="user-photos" data-role="coordinator,admin"/);
  assert.match(schema,/idx_annotations_completed_by_status ON photo_annotations\(completed_by,status,completed_at DESC\)/);
  assert.match(server,/app\.get\("\/api\/manager\/contributors",authenticateUser,requireRole\("admin","coordinator"\)/);
  assert.match(server,/app\.get\("\/api\/manager\/contributors\/:id\/photos",authenticateUser,requireRole\("admin","coordinator"\)/);
  assert.match(server,/a\.completed_by=\$1 AND a\.status='complete'/);
  assert.match(server,/photos:rows\.map\(\(row\)=>photoPublic\(row,null\)\)/);
  assert.match(server,/req\.query\.media==="lazy"&&\["admin","coordinator"\]\.includes\(req\.user\.role\)/);
  assert.match(ui,/id="contributorReviewUser" aria-label="Select contributor"/);
  assert.match(ui,/const openContributorReviewMode=/);
  assert.match(ui,/const selectContributorForReview=/);
  assert.match(ui,/api\/manager\/contributors\/\$\{encodeURIComponent\(userId\)\}\/photos/);
  assert.match(ui,/const activeEditorSequence=/);
  assert.match(ui,/const point=activeEditorSequence\(\)\[editorPhotoIndex\]/);
  assert.match(ui,/const scheduleContributorReviewPlayback=/);
  assert.match(ui,/lazyMedia:!!editorContributorReview/);
  assert.match(ui,/preservePlayback:!!editorContributorReview&&playing/);
  assert.match(ui,/if\(editorContributorReview\)stopAnim\(\)/);
  assert.match(ui,/body\.editorOpen\.contributorReviewMode \.wrap/);
  assert.doesNotMatch(ui,/loadContributorPhotoReviewRows/);
  assert.doesNotMatch(ui,/api\/photos\?page=\$\{page\}&pageSize=500/);
});

test("desktop navigation mirrors the mobile list and introduces itself once per user",()=>{
  assert.match(ui,/class="appNavHandleLabel">Menu</);
  assert.match(ui,/id="appNavWelcome" hidden/);
  assert.match(ui,/All sections are available in this menu/);
  assert.match(ui,/NAV_INTRO_STORAGE_PREFIX = "stork-nav-intro-v1:"/);
  assert.match(ui,/localStorage\.setItem\(key,"shown"\)/);
  assert.match(ui,/appNavWelcomeEl\.hidden=false;openAppNavigation\(\)/);
  assert.match(ui,/setTimeout\(maybeShowNavigationIntro,250\)/);
  assert.match(ui,/appNavWelcomeEditBtn\.addEventListener/);
});

test("the shared photo editor downloads the current original through protected access",()=>{
  assert.match(ui,/id="editorDownloadPhoto"[^>]*>Download photo<\/button>/);
  assert.match(ui,/const point=activeEditorSequence\(\)\[editorPhotoIndex\]/);
  assert.match(ui,/downloadApiFile\(`\/api\/photos\/\$\{encodeURIComponent\(point\.photoId\)\}\/download`/);
  assert.match(ui,/photoSafeViewerContext\?\.readOnly/);
  assert.match(ui,/body\.sharedPhotoSafeReadOnly #editorDownloadPhoto/);
  assert.match(server,/app\.get\("\/api\/photos\/:id\/download",authenticateUser/);
  assert.match(server,/ensurePhotoAccess\(client,req\.user,req\.params\.id,\{purpose:"browse"\}\)/);
  assert.match(server,/res\.download\(file,path\.basename\(photo\.filename\)/);
});
