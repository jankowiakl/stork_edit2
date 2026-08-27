import test from "node:test";
import assert from "node:assert/strict";
import { parsePhotoFilename } from "../src/photo-filename.js";

test("reads Bird and UTC capture time from a stork camera filename",()=>{
  const parsed=parsePhotoFilename("1d0000097a_20250707_200000_Delay+4s_1024x768_Cam00_00.jpg");
  assert.equal(parsed.bird,"1d0000097a");
  assert.equal(parsed.captureTime.toISOString(),"2025-07-07T20:00:00.000Z");
});

test("does not mistake a repository folder name for a bird",()=>{
  assert.deepEqual(parsePhotoFilename("stork-log-photos-main"),{bird:null,captureTime:null});
});
