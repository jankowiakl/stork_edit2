import test from "node:test";
import assert from "node:assert/strict";
import { parseExifGpsTime } from "../src/photo-exif.js";

test("combines EXIF GPS date and time as UTC",()=>{
  assert.equal(parseExifGpsTime("2025:07:07","20:0:0").toISOString(),"2025-07-07T20:00:00.000Z");
});

test("does not invent GPS time when EXIF GPS tags are absent",()=>{
  assert.equal(parseExifGpsTime(null,null),null);
});
