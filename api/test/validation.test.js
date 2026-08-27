import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnnotationInput, validateAnnotation } from "../src/validation.js";

const completeGround = {
  Quality_selected:"yes", Pheno_period:"fledging", Residence:"yes", Period_day:"day",
  Feather_occ:"no", Ciconia_num:1, Water_presence_class:"no_water_visible", Fly_ground:"ground",
  Activity_class:"foraging", Agriculture_type:"meadow_or_pasture", Foraging_habitat_group:"agricultural_land"
};
test("complete ground-foraging record passes", () => assert.deepEqual(validateAnnotation(normalizeAnnotationInput(completeGround), "complete"), []));
test("rejected photo only requires quality", () => assert.deepEqual(validateAnnotation(normalizeAnnotationInput({Quality_selected:"no"}), "complete"), []));
test("flight requires altitude", () => assert.ok(validateAnnotation(normalizeAnnotationInput({...completeGround,Fly_ground:"fly"}), "complete").some((e)=>e.field==="Altitude")));
test("height is derived", () => assert.equal(normalizeAnnotationInput({Elevation_m:120},{altitude_m:345}).Above_ground,225));
test("species pair is enforced", () => assert.ok(validateAnnotation(normalizeAnnotationInput({Spec1_name:"Ardea cinerea"}), "draft").some((e)=>e.field==="Spec1_abund")));

