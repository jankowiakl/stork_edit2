import { ANNOTATION_DB_COLUMNS,ANNOTATION_FIELDS } from "./annotation-schema.js";

const COMPLETE_VALUES = new Set(["yes","true","1","complete","completed","finished"]);

export function isImportMarkedComplete(value){
  return COMPLETE_VALUES.has(String(value??"").trim().toLowerCase());
}

export function isBlankStoredAnnotation(row){
  if(!row?.has_annotation||row.annotation_status!=="unstarted")return false;
  return ANNOTATION_DB_COLUMNS.every((column)=>row[column]===null||row[column]===undefined||row[column]==="");
}

export function hasImportAnnotationData(row={}){
  if(isImportMarkedComplete(row.Analysed))return true;
  return ANNOTATION_FIELDS.some((field)=>field.table!=="photos"&&row[field.key]!==null&&row[field.key]!==undefined&&row[field.key]!=="");
}

export function blankStoredAnnotationSql(alias="photo_annotations"){
  return `${alias}.status='unstarted' AND ${ANNOTATION_DB_COLUMNS.map((column)=>`${alias}.${column} IS NULL`).join(" AND ")}`;
}
