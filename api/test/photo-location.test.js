import test from "node:test";
import assert from "node:assert/strict";
import { nearestTrackPoint,shouldUpgradePhotoMedia } from "../src/photo-location.js";

test("selects the nearest GPS point to the photo timestamp",()=>{
  const points=[
    {observedAt:new Date("2025-07-07T19:30:00Z"),lat:50,lon:20},
    {observedAt:new Date("2025-07-07T20:04:00Z"),lat:51,lon:21}
  ];
  const match=nearestTrackPoint(points,new Date("2025-07-07T20:00:00Z"),90);
  assert.equal(match.lat,51);assert.equal(match.lon,21);assert.equal(match.offsetSeconds,240);
});

test("does not assign a distant GPS point",()=>{
  const points=[{observedAt:new Date("2025-07-07T10:00:00Z"),lat:50,lon:20}];
  assert.equal(nearestTrackPoint(points,new Date("2025-07-07T20:00:00Z"),90),null);
});

test("upgrades only a stored non-EXIF photo with an incoming EXIF copy",()=>{
  assert.equal(shouldUpgradePhotoMedia("missing","exif"),true);
  assert.equal(shouldUpgradePhotoMedia("track","exif"),true);
  assert.equal(shouldUpgradePhotoMedia("exif","exif"),false);
  assert.equal(shouldUpgradePhotoMedia("missing","track"),false);
});
