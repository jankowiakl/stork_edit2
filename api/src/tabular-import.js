import fsp from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { removeNulCharacters,sanitizeNulDeep } from "./text-sanitize.js";

export const IMPORT_COLUMNS=Object.freeze([
  "Bird","Lat/Lon","FileName","Address","Country","Close_city","Geo_desc","FilePath","Date_time",
  "Quality_selected","Pheno_period","Residence","Feather_perc","Feather_occ","Ciconia_num","Env_desc_en","Remarks",
  "Altitude","Fly_ground","Above_ground","Height_class_100m","Thermal_updraft","Activity_class","Agriculture_type",
  "Foraging_habitat_group","Roost_site_group","Period_day","Artificial_lights","Water_presence_class","Spec1_abund",
  "Spec1_name","Spec2_abund","Spec2_name","Altitude_m","GPS_time","Latitude","Longitude","Elevation_m","Analysed"
]);

const requiredIdentityColumns=new Set(["Bird","FileName"]);
const canonicalByLower=new Map(IMPORT_COLUMNS.map((column)=>[column.toLowerCase(),column]));

function excelCellValue(value){
  if(value&&typeof value==="object"&&"result" in value)return value.result;
  if(value&&typeof value==="object"&&Array.isArray(value.richText))return value.richText.map((part)=>part.text??"").join("");
  if(value&&typeof value==="object"&&"text" in value)return value.text;
  return value;
}

function canonicalHeader(value){
  const cleaned=removeNulCharacters(String(value??"")).value.trim();
  return canonicalByLower.get(cleaned.toLowerCase())||cleaned;
}

function selectedSet(columns){
  if(!Array.isArray(columns)||!columns.length)return new Set(IMPORT_COLUMNS);
  const selected=new Set(columns.map((column)=>canonicalByLower.get(String(column).trim().toLowerCase())).filter(Boolean));
  for(const column of requiredIdentityColumns)selected.add(column);
  return selected;
}

export function detectDelimiter(text,extension=""){
  if(extension.toLowerCase()===".txt")return "\t";
  const first=String(text).replace(/^\uFEFF/,"").split(/\r?\n/).find((line)=>line.trim())||"";
  const counts=new Map([[";",0],[",",0],["\t",0]]);let quoted=false;
  for(let index=0;index<first.length;index++){
    const char=first[index];
    if(char==='"'){
      if(quoted&&first[index+1]==='"')index++;else quoted=!quoted;
    }else if(!quoted&&counts.has(char))counts.set(char,counts.get(char)+1);
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];
}

export function parseDelimited(text,delimiter){
  const rows=[];let row=[],value="",quoted=false;
  const source=String(text).replace(/^\uFEFF/,"");
  const pushValue=()=>{row.push(value);value="";};
  const pushRow=()=>{pushValue();if(row.some((cell)=>cell!==""))rows.push(row);row=[];};
  for(let index=0;index<source.length;index++){
    const char=source[index];
    if(char==='"'){
      if(quoted&&source[index+1]==='"'){value+='"';index++;}else quoted=!quoted;
    }else if(char===delimiter&&!quoted)pushValue();
    else if((char==="\n"||char==="\r")&&!quoted){if(char==="\r"&&source[index+1]==="\n")index++;pushRow();}
    else value+=char;
  }
  if(value||row.length)pushRow();
  return rows;
}

async function xlsxMatrix(file){
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(file);
  const sheet=workbook.getWorksheet("photos")||workbook.worksheets[0];
  if(!sheet)throw new Error("Workbook does not contain a data sheet.");
  const matrix=[];
  for(let rowNo=1;rowNo<=sheet.rowCount;rowNo++){
    const source=sheet.getRow(rowNo),row=[];
    for(let column=1;column<=sheet.columnCount;column++)row.push(excelCellValue(source.getCell(column).value));
    matrix.push(row);
  }
  return matrix;
}

async function tabularMatrix(file,extension=path.extname(file)){
  if(String(extension).toLowerCase()===".xlsx")return xlsxMatrix(file);
  const text=await fsp.readFile(file,"utf8"),delimiter=detectDelimiter(text,extension);
  return parseDelimited(text,delimiter);
}

export async function inspectTabularHeaders(file,originalName=file){
  const matrix=await tabularMatrix(file,path.extname(originalName)),headers=(matrix[0]||[]).map(canonicalHeader).filter(Boolean);
  return{headers,recognized:headers.filter((header)=>canonicalByLower.has(header.toLowerCase())),allowedColumns:IMPORT_COLUMNS};
}

export async function readTabularFile(file,{columns}={}){
  const matrix=await tabularMatrix(file);if(!matrix.length)return{rows:[],nulIssues:[],headers:[]};
  const headers=[],nulIssues=[];
  for(let column=0;column<matrix[0].length;column++){
    const result=removeNulCharacters(String(matrix[0][column]??"")),header=canonicalHeader(result.value);headers[column]=header;
    if(result.removed)nulIssues.push({type:"nul_characters_removed",sourceRow:1,field:header||`column_${column+1}`,removed:result.removed});
  }
  const selected=selectedSet(columns),rows=[];
  for(let rowIndex=1;rowIndex<matrix.length;rowIndex++){
    const row={__sourceRow:rowIndex+1};let hasValue=false;
    for(let column=0;column<headers.length;column++){
      const field=headers[column];if(!field||!selected.has(field))continue;
      const result=sanitizeNulDeep(matrix[rowIndex]?.[column]);
      if(result.removed)nulIssues.push({type:"nul_characters_removed",sourceRow:rowIndex+1,field,removed:result.removed});
      const value=result.value;if(value!==null&&value!==undefined&&value!=="")hasValue=true;row[field]=value??null;
    }
    if(hasValue)rows.push(row);
  }
  return{rows,nulIssues,headers};
}
