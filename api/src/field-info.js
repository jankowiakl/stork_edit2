export const FIELD_INFO=Object.freeze({
  Quality_selected:{dataType:"Categorical text",unit:"yes",sourceRole:"Selection/QC",definition:"Indicates that the photograph was retained in the selected analytical dataset."},
  Pheno_period:{dataType:"Categorical text",unit:"phenological phase",sourceRole:"Biological period",definition:"Phenological or annual-cycle period assigned to the observation."},
  Residence:{dataType:"Categorical text",unit:"yes/no",sourceRole:"Movement-state annotation",definition:"Binary assignment to a residence/stopover segment versus a non-residence/transit segment."},
  Feather_perc:{dataType:"Numeric",unit:"% of image",sourceRole:"Image QC",definition:"Estimated percentage of the photograph obscured or occupied by feathers."},
  Feather_occ:{dataType:"Categorical text",unit:"yes/no",sourceRole:"Image QC",definition:"Whether feathers occur in or obscure the camera field of view."},
  Ciconia_num:{dataType:"Integer",unit:"visible individuals",sourceRole:"Social observation",definition:"Number of visible White Stork conspecifics in the photograph."},
  Env_desc_en:{dataType:"Categorical/free text",unit:"English habitat phrase",sourceRole:"Photo annotation",definition:"English description of the visible environment or substrate, translated/standardized from the original annotation."},
  Remarks:{dataType:"Free text",unit:"English note",sourceRole:"Photo annotation",definition:"Translated observational notes about image content, behavior, habitat, objects, or data quality."},
  Altitude:{dataType:"Ordinal text",unit:"low/medium/high",sourceRole:"Flight descriptor",definition:"Qualitative altitude category assigned to airborne observations."},
  Fly_ground:{dataType:"Categorical text",unit:"flight state",sourceRole:"Behavior from image",definition:"Whether the individual was airborne, on/near the ground, or could not be classified confidently."},
  Above_ground:{dataType:"Numeric",unit:"m above ground level",sourceRole:"Derived height",definition:"Estimated height above local ground level."},
  Height_class_100m:{dataType:"Integer",unit:"nominal 100-m AGL class",sourceRole:"Derived height class",definition:"Nominal 100-m class of Above_ground; values represent class labels in metres."},
  Thermal_updraft:{dataType:"Categorical text",unit:"yes/no/?",sourceRole:"Flight behavior",definition:"Whether the image or annotation indicates use of a thermal updraft/soaring behavior."},
  Activity_class:{dataType:"Categorical text",unit:"behavioral class",sourceRole:"Derived photo classification",definition:"Primary behavioral/activity class assigned to the image."},
  Agriculture_type:{dataType:"Categorical text",unit:"agricultural habitat class",sourceRole:"Derived photo classification",definition:"Type of agriculture or non-agricultural context visible in the photograph."},
  Foraging_habitat_group:{dataType:"Categorical text",unit:"broad habitat class",sourceRole:"Derived photo classification",definition:"Broad habitat used for foraging observations."},
  Roost_site_group:{dataType:"Categorical text",unit:"roost substrate class",sourceRole:"Derived photo classification",definition:"Grouped substrate or setting of roosting and night-roosting observations."},
  Period_day:{dataType:"Categorical text",unit:"day/night",sourceRole:"Temporal class",definition:"Broad day-versus-night category assigned to the observation."},
  Artificial_lights:{dataType:"Categorical text",unit:"yes",sourceRole:"Night environment",definition:"Presence of visible artificial lighting at the photographed overnight site."},
  Water_presence_class:{dataType:"Categorical text",unit:"water-size class",sourceRole:"Derived photo classification",definition:"Presence and approximate scale of water visible or directly represented in the photographed habitat."},
  Spec1_abund:{dataType:"Integer",unit:"visible individuals",sourceRole:"Co-occurrence observation",definition:"Minimum visible abundance of the first co-occurring taxon named in Spec1_name."},
  Spec1_name:{dataType:"Taxon text",unit:"scientific or higher-taxon label",sourceRole:"Co-occurrence observation",definition:"Name of the first co-occurring taxon or taxonomic group visible in the photograph."},
  Spec2_abund:{dataType:"Integer",unit:"visible individuals",sourceRole:"Co-occurrence observation",definition:"Minimum visible abundance of the second co-occurring taxon named in Spec2_name."},
  Spec2_name:{dataType:"Taxon text",unit:"scientific or higher-taxon label",sourceRole:"Co-occurrence observation",definition:"Name of the second co-occurring taxon or taxonomic group visible in the photograph."},
  Elevation_m:{dataType:"Numeric",unit:"m",sourceRole:"Terrain attribute",definition:"Estimated ground-surface elevation at the observation coordinates."}
});

export function fieldInfoHelp(info,fallback=""){
  if(!info)return fallback;
  return [`Definition: ${info.definition}`,`Data type: ${info.dataType}`,`Unit / format: ${info.unit}`,`Source / role: ${info.sourceRole}`].join("\n");
}
