import test from "node:test";
import assert from "node:assert/strict";
import { deriveHeightValues,heightClass100m } from "../src/height.js";

test("rounds height classes around the 50 metre boundary",()=>{
  assert.equal(heightClass100m(-10),0);assert.equal(heightClass100m(50),0);assert.equal(heightClass100m(50.01),100);assert.equal(heightClass100m(150),100);assert.equal(heightClass100m(150.01),200);
});

test("ground forces above-ground height and class to zero",()=>{
  assert.deepEqual(deriveHeightValues({altitudeM:412,aboveGround:90,heightClass:100,flyGround:"ground"}),{elevationM:412,aboveGround:0,heightClass:0});
});

test("derives ground elevation from GPS altitude and above-ground height",()=>{
  assert.deepEqual(deriveHeightValues({altitudeM:412.5,aboveGround:62.5,flyGround:"fly"}),{elevationM:350,aboveGround:62.5,heightClass:100});
});
