export function removeNulCharacters(value){
  if(typeof value!=="string"||!value.includes("\u0000"))return{value,removed:0};
  const removed=value.split("\u0000").length-1;
  return{value:value.replaceAll("\u0000",""),removed};
}

export function sanitizeNulDeep(value){
  if(typeof value==="string")return removeNulCharacters(value);
  if(value===null||value===undefined||typeof value!=="object"||value instanceof Date||ArrayBuffer.isView(value))return{value,removed:0};
  if(Array.isArray(value)){
    let removed=0;const clean=value.map((item)=>{const result=sanitizeNulDeep(item);removed+=result.removed;return result.value;});return{value:clean,removed};
  }
  let removed=0;const clean={};for(const [key,item] of Object.entries(value)){const result=sanitizeNulDeep(item);clean[key]=result.value;removed+=result.removed;}return{value:clean,removed};
}

export function sanitizeTextFields(record={},onRemoved=null){
  const clean={};let removed=0;
  for(const [field,value] of Object.entries(record)){
    const result=sanitizeNulDeep(value);clean[field]=result.value;removed+=result.removed;
    if(result.removed&&onRemoved)onRemoved({field,removed:result.removed});
  }
  return{value:clean,removed};
}
