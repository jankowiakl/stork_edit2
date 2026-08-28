import { ANNOTATION_FIELDS } from "./annotation-schema.js";
import { deriveHeightValues } from "./height.js";

const empty = (value) => value === null || value === undefined || value === "";

function normalizeScalar(field, raw) {
  if (empty(raw)) return null;
  if (["number","derived","integer"].includes(field.type)) {
    const number = Number(raw);
    return Number.isFinite(number) ? number : raw;
  }
  const text = String(raw).trim();
  return text || null;
}

export function normalizeAnnotationInput(input = {}, photo = {}) {
  const values = {};
  for (const field of ANNOTATION_FIELDS) values[field.key] = normalizeScalar(field, input[field.key]);
  for (const key of ["Quality_selected","Residence","Feather_occ","Artificial_lights"]) {
    if (values[key]) values[key] = String(values[key]).toLowerCase();
  }
  if (values.Feather_occ === "no") values.Feather_perc = 0;
  if (values.Period_day !== "night") values.Artificial_lights = null;
  if (values.Fly_ground === "fly") {
    values.Activity_class = "fly";
    values.Agriculture_type = null;
    values.Foraging_habitat_group = null;
    values.Roost_site_group = null;
  } else if (values.Fly_ground === "ground") {
    values.Altitude = null;
    values.Thermal_updraft = null;
    if (values.Activity_class === "foraging") values.Roost_site_group = null;
    else if (["roosting","night_roosting"].includes(values.Activity_class)) values.Foraging_habitat_group = null;
    else { values.Foraging_habitat_group = null; values.Roost_site_group = null; }
  } else if (values.Fly_ground !== "uncertain") {
    values.Altitude = null;
    values.Thermal_updraft = null;
  }
  const height=deriveHeightValues({altitudeM:photo.altitude_m??photo.Altitude_m,elevationM:values.Elevation_m??photo.elevation_m??photo.Elevation_m,aboveGround:values.Above_ground,heightClass:values.Height_class_100m,flyGround:values.Fly_ground});
  values.Elevation_m=height.elevationM;values.Above_ground=height.aboveGround;values.Height_class_100m=height.heightClass;
  return values;
}

export function validateAnnotation(values, status = "draft") {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  const required = (field, message) => empty(values[field]) && add(field, message);
  for (const field of ANNOTATION_FIELDS) {
    const value = values[field.key];
    if (empty(value)) continue;
    if (field.options && !field.extensible && !field.options.includes(value)) add(field.key, `${field.label} has an unsupported value.`);
    if (["number","derived"].includes(field.type) && !Number.isFinite(value)) add(field.key, `${field.label} must be a number.`);
    if (field.type === "integer" && !Number.isInteger(value)) add(field.key, `${field.label} must be a whole number.`);
    if (field.min !== undefined && Number(value) < field.min) add(field.key, `${field.label} must be at least ${field.min}.`);
    if (field.max !== undefined && Number(value) > field.max) add(field.key, `${field.label} must be at most ${field.max}.`);
  }
  for (const [name, abundance, label] of [["Spec1_name","Spec1_abund","Species 1"],["Spec2_name","Spec2_abund","Species 2"]]) {
    if (empty(values[name]) !== empty(values[abundance])) add(empty(values[name]) ? name : abundance, `${label} name and abundance must be completed together.`);
  }
  if(!empty(values.Height_class_100m)&&(!Number.isInteger(values.Height_class_100m)||values.Height_class_100m<0||values.Height_class_100m%100!==0))add("Height_class_100m","100-m height class must be 0 or a non-negative multiple of 100.");
  if (status !== "complete") return errors;
  required("Quality_selected", "Quality selected is required.");
  if (values.Quality_selected === "no") return errors;
  for (const [field, message] of [
    ["Pheno_period","Phenological period is required."], ["Residence","Residence is required."],
    ["Period_day","Period of day is required."], ["Feather_occ","Feathers visible is required."],
    ["Water_presence_class","Water presence is required."], ["Fly_ground","Flight state is required."]
  ]) required(field, message);
  if (values.Fly_ground !== "fly") required("Env_desc_en", "Environment description is required unless the bird is flying.");
  if (!Number.isInteger(values.Ciconia_num) || values.Ciconia_num < 0) add("Ciconia_num", "Visible White Storks must be a whole number of at least 0.");
  if (values.Feather_occ === "yes") required("Feather_perc", "Feather coverage is required when feathers are visible.");
  if (values.Fly_ground === "fly") required("Altitude", "Altitude class is required for flight.");
  if (values.Fly_ground === "ground") {
    required("Activity_class", "Activity class is required for ground observations.");
    required("Agriculture_type", "Agriculture type is required for ground observations.");
    if (values.Activity_class === "foraging") required("Foraging_habitat_group", "Foraging habitat is required.");
    if (["roosting","night_roosting"].includes(values.Activity_class)) required("Roost_site_group", "Roost site is required.");
  }
  return errors;
}

export function toDbAnnotation(values) {
  return Object.fromEntries(ANNOTATION_FIELDS.filter((field) => field.table !== "photos").map((field) => [field.db, values[field.key] ?? null]));
}

export function fromDbAnnotation(row = {}) {
  const values = Object.fromEntries(ANNOTATION_FIELDS.map((field) => [field.key, row[field.db] ?? null]));
  values.Analysed = row.status === "complete" ? "yes" : "no";
  return values;
}
