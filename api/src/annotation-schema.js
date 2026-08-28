import { FIELD_INFO,fieldInfoHelp } from "./field-info.js";

export const ANNOTATION_FIELDS = Object.freeze([
  { key:"Quality_selected", db:"quality_selected", label:"Quality selected", type:"select", options:["yes","no"], required:true, help:"Whether the photograph is retained in the analytical dataset." },
  { key:"Pheno_period", db:"pheno_period", label:"Phenological period", type:"select", options:["fledging","pre-migratory","A_migration","Wintering"], extensible:true, help:"Phenological or annual-cycle phase assigned to the observation." },
  { key:"Residence", db:"residence", label:"Residence", type:"select", options:["yes","no"], help:"Residence or stopover segment versus transit." },
  { key:"Feather_perc", db:"feather_perc", label:"Feather coverage (%)", type:"number", min:0, max:100, help:"Estimated percentage of the image obscured by feathers." },
  { key:"Feather_occ", db:"feather_occ", label:"Feathers visible", type:"select", options:["yes","no"], help:"Whether feathers occur in the camera field of view." },
  { key:"Ciconia_num", db:"ciconia_num", label:"Visible White Storks", type:"integer", min:0, help:"Number of visible White Storks." },
  { key:"Env_desc_en", db:"env_desc_en", label:"Environment description", type:"text", help:"English description of the visible environment." },
  { key:"Remarks", db:"remarks", label:"Remarks", type:"textarea", help:"Notes about image content, behaviour, habitat or quality." },
  { key:"Altitude", db:"altitude", label:"Altitude class", type:"select", options:["low","medium","high"], extensible:true, help:"Qualitative altitude category for airborne observations." },
  { key:"Fly_ground", db:"fly_ground", label:"Flight state", type:"select", options:["ground","fly","uncertain"], help:"Whether the bird was airborne, on the ground, or uncertain." },
  { key:"Above_ground", db:"above_ground", label:"Above ground (m)", type:"number", help:"Height above ground entered or confirmed by the user; ground observations are zero." },
  { key:"Height_class_100m", db:"height_class_100m", label:"100-m height class", type:"integer", min:0, help:"Preliminary 100-m class derived from height above ground and confirmable by the user." },
  { key:"Thermal_updraft", db:"thermal_updraft", label:"Thermal updraft", type:"select", options:["yes","no","?"], help:"Evidence of thermal soaring or updraft use." },
  { key:"Activity_class", db:"activity_class", label:"Activity class", type:"select", options:["foraging","roosting","night_roosting","death","fly"], extensible:true, help:"Primary behaviour visible in the photograph." },
  { key:"Agriculture_type", db:"agriculture_type", label:"Agriculture type", type:"select", options:["non_agricultural","arable_unspecified","mixed_cropping_or_agricultural_mosaic","meadow_or_pasture","flooded_or_water_managed_field","teff_cultivation","maize_cultivation","not_determinable"], extensible:true, help:"Agricultural habitat or non-agricultural context." },
  { key:"Foraging_habitat_group", db:"foraging_habitat_group", label:"Foraging habitat", type:"select", options:["agricultural_land","waste_disposal_site","wetland_or_waterbody","natural_or_seminatural_open_habitat","built_or_industrial_area"], extensible:true, help:"Broad habitat used for foraging." },
  { key:"Roost_site_group", db:"roost_site_group", label:"Roost site", type:"select", options:["artificial_structure","ground_open_site","tree_or_shrub","nest","wetland_or_water_site"], extensible:true, help:"Substrate or setting of roosting observations." },
  { key:"Period_day", db:"period_day", label:"Period of day", type:"select", options:["day","night"], help:"Broad day-versus-night category." },
  { key:"Artificial_lights", db:"artificial_lights", label:"Artificial lights visible", type:"select", options:["yes","no"], help:"Visible artificial lighting at a night site." },
  { key:"Water_presence_class", db:"water_presence_class", label:"Water presence", type:"select", options:["no_water_visible","small_water","large_waterbody"], extensible:true, help:"Presence and approximate scale of visible water." },
  { key:"Spec1_abund", db:"spec1_abund", label:"Species 1 abundance", type:"integer", min:1, help:"Visible abundance of the first co-occurring taxon." },
  { key:"Spec1_name", db:"spec1_name", label:"Species 1", type:"text", help:"Scientific or higher-taxon name." },
  { key:"Spec2_abund", db:"spec2_abund", label:"Species 2 abundance", type:"integer", min:1, help:"Visible abundance of the second co-occurring taxon." },
  { key:"Spec2_name", db:"spec2_name", label:"Species 2", type:"text", help:"Scientific or higher-taxon name." },
  { key:"Elevation_m", db:"elevation_m", table:"photos", label:"Ground elevation (m)", type:"number", help:"Estimated ground-surface elevation at the coordinates." }
]);

export const ANNOTATION_DB_COLUMNS = ANNOTATION_FIELDS.filter((field) => field.table !== "photos").map((field) => field.db);
export const EXTENSIBLE_ANNOTATION_FIELDS=Object.freeze(ANNOTATION_FIELDS.filter((field)=>field.extensible).map((field)=>field.key));
export function normalizeReviewField(value){
  const raw=String(value||"").replaceAll("\0","").trim();
  if(!raw)return null;
  const comparable=raw.toLowerCase().replace(/[\s-]+/g,"_");
  const known=ANNOTATION_FIELDS.find((field)=>[field.key,field.db,field.label].some((candidate)=>String(candidate).toLowerCase().replace(/[\s-]+/g,"_")===comparable));
  return known?.key||raw.slice(0,100);
}
export function publicAnnotationSchema(customOptions={}) {
  return {
    version: 1,
    fields: ANNOTATION_FIELDS.map(({ db:_db, table:_table, ...field }) => ({...field,options:field.options?[...new Set([...field.options,...(customOptions[field.key]||[])])]:undefined,...(FIELD_INFO[field.key]||{}),help:fieldInfoHelp(FIELD_INFO[field.key],field.help)})),
    statuses: ["unstarted","draft","complete","needs_review"]
  };
}
