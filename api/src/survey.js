import crypto from "node:crypto";

export const SURVEY_DEMOGRAPHIC_LIBRARY=Object.freeze({
  sex:{pl:"Płeć",en:"Sex",type:"select",options:[["female","Kobieta","Female"],["male","Mężczyzna","Male"],["prefer_not_to_disclose","Wolę nie podawać","Prefer not to disclose"]]},
  year_of_birth:{pl:"Rok urodzenia",en:"Year of birth",type:"year"},
  education:{pl:"Wykształcenie",en:"Education",type:"select",options:[["primary","Podstawowe","Primary"],["vocational","Zawodowe","Vocational"],["secondary","Średnie","Secondary"],["bachelor_engineer","Licencjat / inżynier","Bachelor / Engineer"],["master","Magisterskie","Master"],["doctorate","Doktorat lub wyższe","Doctorate or higher"],["other","Inne","Other"]]},
  nationality:{pl:"Narodowość",en:"Nationality",type:"country"},
  country_of_residence:{pl:"Kraj zamieszkania",en:"Country of residence",type:"country"},
  settlement_size:{pl:"Wielkość miejsca zamieszkania",en:"Size of place of residence",type:"select",options:[["village","Wieś","Village"],["town_under_10000","Miasto <10 000","Town <10,000"],["10000_50000","10 000–50 000","10,000–50,000"],["50000_100000","50 000–100 000","50,000–100,000"],["100000_500000","100 000–500 000","100,000–500,000"],["over_500000",">500 000",">500,000"]]},
  photography_experience:{pl:"Doświadczenie fotograficzne",en:"Photography experience",type:"select",options:[["none","Brak","None"],["beginner","Początkujące","Beginner"],["intermediate","Średnie","Intermediate"],["advanced","Zaawansowane","Advanced"],["professional","Profesjonalne","Professional"]]},
  wildlife_photography_experience:{pl:"Doświadczenie w fotografii przyrodniczej",en:"Wildlife photography experience",type:"select",options:[["none","Brak","None"],["beginner","Początkujące","Beginner"],["intermediate","Średnie","Intermediate"],["advanced","Zaawansowane","Advanced"],["professional","Profesjonalne","Professional"]]},
  birdwatching_experience:{pl:"Doświadczenie w obserwacji ptaków",en:"Birdwatching experience",type:"select",options:[["none","Brak","None"],["basic","Podstawowe","Basic"],["intermediate","Średnie","Intermediate"],["advanced","Zaawansowane","Advanced"],["expert","Profesjonalne / eksperckie","Professional / expert"]]},
  nature_observation_frequency:{pl:"Częstotliwość obserwowania ptaków lub przyrody",en:"Frequency of observing birds or nature",type:"select",options:[["never","Nigdy","Never"],["few_per_year","Kilka razy w roku","A few times per year"],["monthly","Co miesiąc","Monthly"],["weekly","Co tydzień","Weekly"],["several_weekly","Kilka razy w tygodniu","Several times per week"],["daily","Codziennie","Daily"]]},
  white_stork_knowledge:{pl:"Wiedza o bocianie białym",en:"Knowledge of White Stork",type:"select",options:[["none","Brak","None"],["basic","Podstawowa","Basic"],["good","Dobra","Good"],["very_good","Bardzo dobra","Very good"],["expert","Profesjonalna / ekspercka","Professional / expert"]]}
});

export const DEFAULT_SURVEY_TEXT=Object.freeze({
  introPl:"Zapraszamy do anonimowego badania dotyczącego oceny fotografii bocianów białych. Udział jest dobrowolny, a wyniki będą wykorzystywane wyłącznie do celów naukowych. Ocenisz wskazaną liczbę zdjęć w skali od 1 do 5 gwiazdek.",
  introEn:"You are invited to an anonymous study about the evaluation of White Stork photographs. Participation is voluntary and the results will be used solely for scientific purposes. You will rate the indicated number of photographs on a scale from 1 to 5 stars.",
  thanksPl:"Dziękujemy za udział w anonimowym badaniu i pomoc w rozwoju projektu naukowego.",
  thanksEn:"Thank you for taking part in this anonymous study and supporting the development of the scientific project."
});

export const surveyToken=()=>crypto.randomBytes(32).toString("base64url");
export const surveyTokenHash=(value)=>crypto.createHash("sha256").update(String(value||"")).digest("hex");
const surveyLinkKey=()=>{const secret=String(process.env.SURVEY_LINK_ENCRYPTION_KEY||process.env.JWT_SECRET||"");if(secret.length<32)throw new Error("survey_link_encryption_key_required");return crypto.createHash("sha256").update(`stork-survey-link:${secret}`).digest();};
export const encryptSurveyToken=(value)=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",surveyLinkKey(),iv),encrypted=Buffer.concat([cipher.update(String(value||""),"utf8"),cipher.final()]),tag=cipher.getAuthTag();return`v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;};
export const decryptSurveyToken=(value)=>{try{const[version,iv,tag,payload]=String(value||"").split(".");if(version!=="v1"||!iv||!tag||!payload)return null;const decipher=crypto.createDecipheriv("aes-256-gcm",surveyLinkKey(),Buffer.from(iv,"base64url"));decipher.setAuthTag(Buffer.from(tag,"base64url"));return Buffer.concat([decipher.update(Buffer.from(payload,"base64url")),decipher.final()]).toString("utf8")||null;}catch(_error){return null;}};
export const surveyLanguage=(languages=[])=>[].concat(languages||[]).some((value)=>String(value||"").toLowerCase().startsWith("pl"))?"pl":"en";
export function surveyMediaUrl(publicApiUrl,{responseId,photoId,mediaToken,preview=false,top=false}){
  let base;
  try{base=new URL(String(publicApiUrl||""));}catch(_error){throw new Error("survey_public_api_url_required");}
  if(!["http:","https:"].includes(base.protocol))throw new Error("survey_public_api_url_required");
  const branch=top?"top":"photos",url=new URL(`/api/public/survey-responses/${encodeURIComponent(responseId)}/${branch}/${encodeURIComponent(photoId)}/image`,base);
  url.searchParams.set("media_token",String(mediaToken||""));
  if(preview)url.searchParams.set("kind","preview");
  return url.href;
}

const text=(value,max)=>String(value??"").replaceAll("\0","").trim().slice(0,max);
const email=(value)=>text(value,254).toLowerCase();
const isoOrNull=(value)=>{if(!value)return null;const date=new Date(value);if(Number.isNaN(date.getTime()))throw new Error("invalid_survey_date");return date.toISOString();};

export function normalizeSurveyCampaign(input={}){
  const name=text(input.name,200),photoCount=Number.parseInt(input.photoCount??30,10),linkType=String(input.linkType||"reusable"),singleUseCount=Number.parseInt(input.singleUseCount??1,10),demographicFields=[...new Set(Array.isArray(input.demographicFields)?input.demographicFields.map(String):[])],dateFrom=isoOrNull(input.dateFrom),dateTo=isoOrNull(input.dateTo),permanent=input.permanent!==false,expiresAt=permanent?null:isoOrNull(input.expiresAt);
  if(!name)throw new Error("survey_name_required");
  if(!Number.isInteger(photoCount)||photoCount<1||photoCount>500)throw new Error("invalid_survey_photo_count");
  if(!["reusable","single_use"].includes(linkType))throw new Error("invalid_survey_link_type");
  if(linkType==="single_use"&&(!Number.isInteger(singleUseCount)||singleUseCount<1||singleUseCount>5000))throw new Error("invalid_single_use_link_count");
  if(demographicFields.some((key)=>!SURVEY_DEMOGRAPHIC_LIBRARY[key]))throw new Error("invalid_demographic_field");
  if(dateFrom&&dateTo&&new Date(dateFrom)>new Date(dateTo))throw new Error("invalid_survey_date_range");
  if(!permanent&&(!expiresAt||new Date(expiresAt)<=new Date()))throw new Error("survey_expiry_must_be_future");
  const contactName=text(input.contactName,200),contactEmail=email(input.contactEmail),projectUrl=text(input.projectUrl,1000),introPl=text(input.introPl??DEFAULT_SURVEY_TEXT.introPl,10000),introEn=text(input.introEn??DEFAULT_SURVEY_TEXT.introEn,10000),thanksPl=text(input.thanksPl??DEFAULT_SURVEY_TEXT.thanksPl,10000),thanksEn=text(input.thanksEn??DEFAULT_SURVEY_TEXT.thanksEn,10000);
  if(!contactName)throw new Error("survey_contact_name_required");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))throw new Error("invalid_survey_contact_email");
  if(!introPl||!introEn||!thanksPl||!thanksEn)throw new Error("survey_bilingual_text_required");
  return{name,photoCount,linkType,singleUseCount,demographicFields,dateFrom,dateTo,permanent,expiresAt,contactName,contactEmail,projectUrl:projectUrl||null,introPl,introEn,thanksPl,thanksEn};
}

export function validateSurveyStart({campaign,ageConfirmed,consentAccepted,demographics}){
  if(ageConfirmed!==true)throw new Error("survey_age_confirmation_required");
  if(consentAccepted!==true)throw new Error("survey_participation_consent_required");
  const selected=Array.isArray(campaign.demographic_fields)?campaign.demographic_fields:[],values=demographics&&typeof demographics==="object"&&!Array.isArray(demographics)?demographics:{};
  for(const key of selected){const value=values[key];if(value===undefined||value===null||String(value).trim()==="")throw new Error(`survey_demographic_required:${key}`);if(key==="year_of_birth"){const year=Number(value),current=new Date().getUTCFullYear();if(!Number.isInteger(year)||year<1900||year>current-18)throw new Error(`survey_demographic_invalid:${key}`);}else if(SURVEY_DEMOGRAPHIC_LIBRARY[key]?.options&&!SURVEY_DEMOGRAPHIC_LIBRARY[key].options.some(([option])=>option===String(value)))throw new Error(`survey_demographic_invalid:${key}`);else if(String(value).length>120)throw new Error(`survey_demographic_invalid:${key}`);}
  return Object.fromEntries(selected.map((key)=>[key,key==="year_of_birth"?Number(values[key]):String(values[key])]));
}

export function surveyQualityFlags(ratings,startedAt,completedAt){
  const values=ratings.map(Number).filter(Number.isFinite),flags=[];
  if(values.length&&new Set(values).size===1)flags.push("all_ratings_identical");
  else if(values.length>2){const mean=values.reduce((sum,value)=>sum+value,0)/values.length,variance=values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length;if(variance<0.2)flags.push("very_low_rating_variance");}
  const duration=(new Date(completedAt)-new Date(startedAt))/1000;if(Number.isFinite(duration)&&duration<Math.max(60,values.length*2))flags.push("completed_unusually_fast");
  return flags;
}

export function publicDemographicLibrary(){return Object.fromEntries(Object.entries(SURVEY_DEMOGRAPHIC_LIBRARY).map(([key,value])=>[key,{...value,options:value.options?.map(([id,pl,en])=>({id,pl,en}))||null}]));}
