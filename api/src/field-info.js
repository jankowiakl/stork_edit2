const info=(technical,guidance)=>Object.freeze({...technical,...guidance});

export const FIELD_INFO=Object.freeze({
  Quality_selected:info(
    {dataType:"Categorical text",unit:"yes/no",sourceRole:"Selection/QC",definition:"Indicates whether the photograph was retained in the selected analytical dataset."},
    {plainDefinition:"Whether the photograph is suitable for the selected analytical dataset.",howToRecord:"Choose yes when the photograph can be analysed reliably. Choose no to reject an unusable photograph; the remaining scientific fields then do not need to be completed.",optionHelp:{yes:"Retain and use the photograph.",no:"The photograph cannot be analysed reliably."}}
  ),
  Pheno_period:info(
    {dataType:"Categorical text",unit:"phenological phase",sourceRole:"Biological period",definition:"Phenological or annual-cycle period assigned to the observation."},
    {plainDefinition:"Annual-cycle or phenological period assigned to the observation.",howToRecord:"Select the period assigned to this observation from the available movement and seasonal context.",optionHelp:{fledging:"Fledging period — the period associated with the nest, including the time when the young bird is still in the nest and the early stage after leaving it, when it makes its first flights and may still return to the nest.","pre-migratory":"Period before autumn departure.",S_migration:"Spring migration — the period when the bird is migrating northwards from the wintering/non-breeding area towards the breeding area.",A_migration:"Autumn migration.",Wintering:"Wintering or non-breeding period."}}
  ),
  Residence:info(
    {dataType:"Categorical text",unit:"yes/no",sourceRole:"Movement-state annotation",definition:"Binary assignment to an extended local residence area versus continued movement."},
    {plainDefinition:"Whether the bird remains within the same local area for an extended period that includes more than one overnight stay.",howToRecord:"Use the stopover areas outlined on the map as the primary guide. If the current location falls within such an outlined stopover area, classify it as residence. Stopover areas may not always be available, for example for recently fledged juveniles. In such cases, use the sequence of telemetry locations, photographs and the bird's behaviour to determine whether it is remaining locally for an extended period.",optionHelp:{yes:"The bird remains within the same local area for an extended period that includes more than one overnight stay.",no:"The bird is not remaining within such a longer-term residence area and continues moving."}}
  ),
  Feather_perc:info(
    {dataType:"Numeric",unit:"% of image",sourceRole:"Image QC",definition:"Estimated percentage of the photograph obscured or occupied by feathers."},
    {plainDefinition:"Estimated percentage of the photograph obscured or occupied by feathers.",howToRecord:"Enter a visual estimate from 0 to 100 based on the area of this frame covered by feathers.",important:"This is a visual estimate, not a measured surface area."}
  ),
  Feather_occ:info(
    {dataType:"Categorical text",unit:"yes/no",sourceRole:"Image QC",definition:"Whether feathers occur in or obscure the camera field of view."},
    {plainDefinition:"Whether feathers are visible in, or obscure, the camera image.",howToRecord:"Assess only the current frame.",optionHelp:{yes:"Feathers are visible in or obscure the image.",no:"Feathers are not visible in the image."}}
  ),
  Ciconia_num:info(
    {dataType:"Integer",unit:"visible individuals",sourceRole:"Social observation",definition:"Number of visible White Stork conspecifics in the photograph."},
    {plainDefinition:"Number of White Storks visibly present in the photograph.",howToRecord:"Count the minimum number of White Storks that can be seen in this single frame.",important:"Do not automatically count the camera-carrying bird if it is not visible."}
  ),
  Env_desc_en:info(
    {dataType:"Free text",unit:"short English phrase",sourceRole:"Photo annotation",definition:"English description of the visible environment or substrate."},
    {plainDefinition:"A short English free-text description of the environment or substrate visible in the photograph.",howToRecord:"Type any concise description supported by the image. Suggestions include field, landfill, tree, building, meadow/urban area and riverbank.",important:"This is a detailed visible description, not the broad analytical habitat classification."}
  ),
  Remarks:info(
    {dataType:"Free text",unit:"observation note",sourceRole:"Photo annotation",definition:"Observational notes about image content, behaviour, habitat, objects or data quality."},
    {plainDefinition:"Free-text space for important information not adequately represented by another structured field.",howToRecord:"Record useful details about objects, behaviour, habitat, image quality or another visible feature. Leave it blank when no additional note is needed.",important:"A blank remark does not mean that a feature is absent."}
  ),
  Altitude:info(
    {dataType:"Ordinal text",unit:"low/medium/high",sourceRole:"Flight descriptor",definition:"Qualitative altitude category assigned to airborne observations."},
    {plainDefinition:"Qualitative altitude class for flight.",howToRecord:"For an airborne bird, choose the qualitative class best supported by the photograph and telemetry.",optionHelp:{low:"Low flight.",medium:"Medium-altitude flight.",high:"High flight."},important:"Do not apply undocumented numeric cut-offs; no numeric thresholds are defined for these categories."}
  ),
  Fly_ground:info(
    {dataType:"Categorical text",unit:"flight state",sourceRole:"Behaviour from image",definition:"Whether the individual was airborne, on or near the ground, or could not be classified confidently."},
    {plainDefinition:"Whether the bird is airborne or on/near a substrate.",howToRecord:"Classify the current photograph from visible evidence.",optionHelp:{ground:"The bird is on or near the ground, or perched on a structure or substrate.",fly:"The bird is airborne.",uncertain:"The state cannot be classified confidently."}}
  ),
  Above_ground:info(
    {dataType:"Numeric",unit:"m above ground level",sourceRole:"Height input",definition:"Estimated height above local ground level; ground observations are forced to 0."},
    {plainDefinition:"Estimated height above local ground level in metres.",howToRecord:"Review the value calculated from altitude and terrain information; correct it only when justified by the available data.",important:"GPS altitude and terrain data can contain error."}
  ),
  Height_class_100m:info(
    {dataType:"Integer",unit:"non-negative multiples of 100 m",sourceRole:"Preliminary derived class with user confirmation",definition:"Preliminary class of Above_ground: ground or values through 50 m map to 0; values above 50 m are assigned upward in 100 m bands."},
    {plainDefinition:"Preliminary 100-m height class derived from Above_ground.",howToRecord:"Verify the class proposed by the application. The current rule assigns ground or values up to 50 m to 0, then >50–150 m to 100, >150–250 m to 200, and so on.",important:"The application proposes this value; the user should verify it against the photograph and telemetry."}
  ),
  Thermal_updraft:info(
    {dataType:"Categorical text",unit:"yes/no/?",sourceRole:"Flight behaviour",definition:"Whether the image or annotation indicates use of a thermal updraft or soaring behaviour."},
    {plainDefinition:"Whether there is evidence of thermal soaring or updraft use.",howToRecord:"Assess this for flight photographs when the image or associated annotation provides sufficient evidence.",optionHelp:{yes:"Evidence indicates thermal soaring or updraft use.",no:"No thermal use is identified in an assessed flight photograph.","?":"Uncertain."}}
  ),
  Activity_class:info(
    {dataType:"Categorical text",unit:"behavioural class",sourceRole:"Derived photo classification",definition:"Primary behavioural or activity class assigned to the image."},
    {plainDefinition:"Primary activity represented by the observation.",howToRecord:"Choose the single class that best describes the visible and documented context.",optionHelp:{foraging:"Stationary use of a feeding habitat, or a feeding/foraging context.",roosting:"Resting, perching or roost-site record without explicit night-roost context.",night_roosting:"Explicit overnight or night-roost context.",fly:"Airborne.",death:"Mortality or dead-individual record."}}
  ),
  Agriculture_type:info(
    {dataType:"Categorical text",unit:"agricultural habitat class",sourceRole:"Derived photo classification",definition:"Type of agriculture or non-agricultural context visible in the photograph."},
    {plainDefinition:"Agricultural setting visible in the photograph.",howToRecord:"Classify the visible land use; use not_determinable rather than guessing.",optionHelp:{non_agricultural:"No agricultural habitat is visible, or the setting is clearly non-agricultural.",arable_unspecified:"General arable-field category. Use it when the agricultural setting should be recorded simply as arable land at this classification level. It does not mean that the crop could not be identified. More detailed habitat/crop information may be recorded in the appropriate descriptive/habitat field.",mixed_cropping_or_agricultural_mosaic:"Mixed crops or a fine agricultural mosaic, including combinations with meadow, pasture, fallow, woody cover or built land.",meadow_or_pasture:"Grass-dominated meadow, pasture or grazing land.",flooded_or_water_managed_field:"Agricultural field visibly flooded, waterlogged, drained, diked, drying or otherwise visibly managed in relation to water.",maize_cultivation:"Maize field, stubble, stalks or crop stack visibly identified.",teff_cultivation:"Teff field, stubble, hay or crop material visibly identified.",not_determinable:"Agricultural type cannot be determined reliably from the image."}}
  ),
  Foraging_habitat_group:info(
    {dataType:"Categorical text",unit:"broad habitat class",sourceRole:"Derived photo classification",definition:"Broad habitat used for foraging observations."},
    {plainDefinition:"Broad habitat group used for a foraging observation.",howToRecord:"Complete this normally only when Activity class is foraging, using what is visible in the image.",optionHelp:{agricultural_land:"Arable fields, meadows, pastures, crop-related sites and farmyards.",waste_disposal_site:"Landfills, dump slopes and other waste-disposal areas.",wetland_or_waterbody:"Rivers, banks or islands, ponds, reservoirs, mud, dikes, flooded areas and wastewater-treatment waters.",natural_or_seminatural_open_habitat:"Savanna, desert or semi-desert, scrub, fallow and other natural or semi-natural open habitat.",built_or_industrial_area:"Urban, construction, quarry or another strongly modified non-waste habitat."}}
  ),
  Roost_site_group:info(
    {dataType:"Categorical text",unit:"roost substrate class",sourceRole:"Derived photo classification",definition:"Grouped substrate or setting of roosting and night-roosting observations."},
    {plainDefinition:"Broad substrate or setting used for roosting.",howToRecord:"Complete this normally only for roosting or night_roosting observations.",optionHelp:{artificial_structure:"Building, roof, wall, fence, power infrastructure or another built structure.",tree_or_shrub:"Tree, shrub or other woody vegetation.",ground_open_site:"Ground-level roost in open habitat such as field, desert, savanna or landfill slope.",wetland_or_water_site:"Roost associated with a river, island, dike, pond, reservoir or another aquatic setting.",nest:"An existing nest used as the site."}}
  ),
  Period_day:info(
    {dataType:"Categorical text",unit:"day/night",sourceRole:"Temporal class",definition:"Broad day-versus-night category assigned to the observation."},
    {plainDefinition:"Whether the observation occurred during day or night.",howToRecord:"Choose the category supported by the photograph time and light context.",optionHelp:{day:"Daytime observation.",night:"Nighttime observation."}}
  ),
  Artificial_lights:info(
    {dataType:"Categorical text",unit:"yes/no",sourceRole:"Night environment",definition:"Presence of visible artificial lighting in the photographed night environment."},
    {plainDefinition:"Whether artificial lighting is visible in the photographed night environment.",howToRecord:"For a night observation, assess visible light in this frame.",optionHelp:{yes:"Artificial lighting is visible.",no:"Artificial lighting is not visible."},important:"No means not visible or detected in the frame, not proof that no artificial lighting exists in the surrounding landscape."}
  ),
  Water_presence_class:info(
    {dataType:"Categorical text",unit:"water-size class",sourceRole:"Derived photo classification",definition:"Presence and approximate scale of water visible or directly represented in the photographed habitat."},
    {plainDefinition:"Presence and approximate scale of water visible in the photograph.",howToRecord:"Classify only water visible or directly represented in the current frame.",optionHelp:{no_water_visible:"No water is visible or directly represented in the photograph.",small_water:"A small or temporary water feature such as a pond, puddle, wet patch, flooded field or small treatment/settling basin.",large_waterbody:"A river, sea, reservoir, dam reservoir, quarry lake or another larger landscape-scale waterbody."},important:"No water visible does not mean that there is no water near the location."}
  ),
  Spec1_abund:info(
    {dataType:"Integer",unit:"visible individuals",sourceRole:"Co-occurrence observation",definition:"Minimum visible abundance of the first co-occurring taxon named in Spec1_name."},
    {plainDefinition:"Minimum number of visibly identifiable individuals of the first other taxon in the frame.",howToRecord:"Enter a visible minimum count together with Spec1 name.",important:"Name and abundance must be entered together. This is not a standardized abundance or density estimate."}
  ),
  Spec1_name:info(
    {dataType:"Taxon text",unit:"scientific or higher-taxon label",sourceRole:"Co-occurrence observation",definition:"Name of the first co-occurring taxon or taxonomic group visible in the photograph."},
    {plainDefinition:"Scientific or higher-taxon label of the first other taxon visible in the image.",howToRecord:"Use the most specific identification that is visually defensible and enter its visible minimum count in Spec1 abundance.",important:"Name and abundance must be entered together."}
  ),
  Spec2_abund:info(
    {dataType:"Integer",unit:"visible individuals",sourceRole:"Co-occurrence observation",definition:"Minimum visible abundance of the second co-occurring taxon named in Spec2_name."},
    {plainDefinition:"Minimum number of visibly identifiable individuals of the second other taxon in the frame.",howToRecord:"Enter a visible minimum count together with Spec2 name.",important:"Name and abundance must be entered together. This is not a standardized abundance or density estimate."}
  ),
  Spec2_name:info(
    {dataType:"Taxon text",unit:"scientific or higher-taxon label",sourceRole:"Co-occurrence observation",definition:"Name of the second co-occurring taxon or taxonomic group visible in the photograph."},
    {plainDefinition:"Scientific or higher-taxon label of the second other taxon visible in the image.",howToRecord:"Use the most specific identification that is visually defensible and enter its visible minimum count in Spec2 abundance.",important:"Name and abundance must be entered together."}
  ),
  Elevation_m:info(
    {dataType:"Numeric",unit:"m",sourceRole:"Calculated terrain attribute",definition:"Ground-surface elevation used for the height calculation."},
    {plainDefinition:"Local ground-surface elevation used for the height calculation.",howToRecord:"Normally review this as system-calculated metadata rather than interpreting it as a biological field.",important:"Terrain data may contain local error."}
  )
});

export function fieldInfoHelp(info,fallback=""){
  if(!info)return fallback;
  const categories=info.optionHelp?Object.entries(info.optionHelp).map(([value,description])=>`${value}: ${description}`).join(" "):"";
  return [info.plainDefinition,info.howToRecord&&`How to record it: ${info.howToRecord}`,categories&&`Categories: ${categories}`,info.important&&`Important: ${info.important}`].filter(Boolean).join("\n");
}
