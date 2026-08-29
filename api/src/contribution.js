export const DEFAULT_CONTRIBUTION_SETTINGS=Object.freeze({
  initialBrowsingAllowance:30,
  photosPerCompleted:5,
  bestPicturesThreshold:50,
  fullAccessThreshold:400,
  acknowledgementThreshold:600,
  scientificThreshold:2000,
  autoPromoteFullAccess:true,
  scientificMessage:"Your contribution qualifies you for individual consideration for co-authorship in publications substantially using your annotated data.",
  levelNames:{nestling:"Nestling",fieldHelper:"Field Helper",fullContributor:"Full Contributor",acknowledgedContributor:"Acknowledged Contributor",scientificContributor:"Scientific Contributor"}
});

const integer=(value,fallback,min=0)=>Number.isFinite(Number(value))?Math.max(min,Math.trunc(Number(value))):fallback;

export function normalizeContributionSettings(input={}){
  const defaults=DEFAULT_CONTRIBUTION_SETTINGS,names={...defaults.levelNames,...(input.levelNames||input.level_names||{})};
  const settings={
    initialBrowsingAllowance:integer(input.initialBrowsingAllowance??input.initial_browsing_allowance,defaults.initialBrowsingAllowance),
    photosPerCompleted:integer(input.photosPerCompleted??input.photos_per_completed,defaults.photosPerCompleted,1),
    bestPicturesThreshold:integer(input.bestPicturesThreshold??input.best_pictures_threshold,defaults.bestPicturesThreshold,1),
    fullAccessThreshold:integer(input.fullAccessThreshold??input.full_access_threshold,defaults.fullAccessThreshold,1),
    acknowledgementThreshold:integer(input.acknowledgementThreshold??input.acknowledgement_threshold,defaults.acknowledgementThreshold,1),
    scientificThreshold:integer(input.scientificThreshold??input.scientific_threshold,defaults.scientificThreshold,1),
    autoPromoteFullAccess:input.autoPromoteFullAccess??input.auto_promote_full_access??defaults.autoPromoteFullAccess,
    scientificMessage:String(input.scientificMessage??input.scientific_message??defaults.scientificMessage).replaceAll("\0","").trim()||defaults.scientificMessage,
    levelNames:Object.fromEntries(Object.entries(names).map(([key,value])=>[key,String(value||defaults.levelNames[key]||key).replaceAll("\0","").trim()]))
  };
  if(!(settings.bestPicturesThreshold<settings.fullAccessThreshold&&settings.fullAccessThreshold<settings.acknowledgementThreshold&&settings.acknowledgementThreshold<settings.scientificThreshold))throw new Error("contribution_thresholds_must_increase");
  return settings;
}

export function mergeContributionSettings(globalSettings={},override={}){
  const global=normalizeContributionSettings(globalSettings),pick=(camel,snake)=>override[camel]??override[snake]??global[camel];
  return normalizeContributionSettings({
    initialBrowsingAllowance:pick("initialBrowsingAllowance","initial_browsing_allowance"),photosPerCompleted:pick("photosPerCompleted","photos_per_completed"),
    bestPicturesThreshold:pick("bestPicturesThreshold","best_pictures_threshold"),fullAccessThreshold:pick("fullAccessThreshold","full_access_threshold"),
    acknowledgementThreshold:pick("acknowledgementThreshold","acknowledgement_threshold"),scientificThreshold:pick("scientificThreshold","scientific_threshold"),
    autoPromoteFullAccess:pick("autoPromoteFullAccess","auto_promote_full_access"),scientificMessage:pick("scientificMessage","scientific_message"),
    levelNames:{...global.levelNames,...(override.levelNames||override.level_names||{})}
  });
}

export const browseAllowance=(_completed,settings)=>settings.initialBrowsingAllowance;

export function contributionLevel(completed,settings){
  const count=Math.max(0,Number(completed)||0),names=settings.levelNames;
  if(count>=settings.scientificThreshold)return{key:"scientificContributor",name:names.scientificContributor,index:4,threshold:settings.scientificThreshold,next:null,description:settings.scientificMessage};
  if(count>=settings.acknowledgementThreshold)return{key:"acknowledgedContributor",name:names.acknowledgedContributor,index:3,threshold:settings.acknowledgementThreshold,next:settings.scientificThreshold,description:"Your work qualifies you to be acknowledged in publications using this dataset."};
  if(count>=settings.fullAccessThreshold)return{key:"fullContributor",name:names.fullContributor,index:2,threshold:settings.fullAccessThreshold,next:settings.acknowledgementThreshold,description:"You unlocked full access to the complete photo collection."};
  if(count>=settings.bestPicturesThreshold)return{key:"fieldHelper",name:names.fieldHelper,index:1,threshold:settings.bestPicturesThreshold,next:settings.fullAccessThreshold,description:"You are now an active contributor and can save your favourite images."};
  return{key:"nestling",name:names.nestling,index:0,threshold:0,next:settings.bestPicturesThreshold,description:"You are just starting your contribution to the White Stork photo archive."};
}

export function contributionProfile({user,completed=0,verified=0,browsed=0,browseCycleNo=1,browseCycleStartedAt=null,settings}){
  const normalized=normalizeContributionSettings(settings),level=contributionLevel(completed,normalized),fullAccess=user?.role!=="annotator"||!user?.restricted_contributor||completed>=normalized.fullAccessThreshold;
  const allowance=fullAccess?null:browseAllowance(completed,normalized),remaining=allowance==null?null:Math.max(0,allowance-browsed);
  return{completed:Number(completed),verified:Number(verified),browsed:Number(browsed),browseCycleNo:Number(browseCycleNo||1),browseCycleStartedAt:browseCycleStartedAt||null,restricted:!!user?.restricted_contributor&&!fullAccess,fullAccess,browseAllowance:allowance,browseRemaining:remaining,browseLimitReached:remaining===0,unlockedByWork:0,bestPicturesUnlocked:fullAccess||completed>=normalized.bestPicturesThreshold,level,nextReward:level.next==null?null:{threshold:level.next,remaining:Math.max(0,level.next-Number(completed))},settings:normalized};
}

export function decideMediaAccess({profile,hasGrant=false,purpose="browse"}){
  if(profile.fullAccess||hasGrant)return{allowed:true,consume:false,source:hasGrant?"existing":"full_access"};
  if(purpose==="annotation")return{allowed:true,consume:false,source:"annotation"};
  if(profile.browseRemaining>0)return{allowed:true,consume:true,source:"browse"};
  return{allowed:false,consume:false,source:"limit_reached"};
}
