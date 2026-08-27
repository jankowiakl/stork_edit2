import { removeNulCharacters,sanitizeNulDeep } from "./text-sanitize.js";

// NUL is intentionally allowed only inside process-local Map/Set keys.
export const internalPhotoKey=(bird,filename)=>`${bird}\u0000${filename}`;

export function reportPhotoKey(bird,filename){
  const safeBird=removeNulCharacters(String(bird??"")).value;
  const safeFilename=removeNulCharacters(String(filename??"")).value;
  return `${safeBird} | ${safeFilename}`;
}

export function sanitizeImportIssue(issue={}){
  const safe=sanitizeNulDeep(issue).value;
  if(safe.sourceKey!==null&&safe.sourceKey!==undefined)safe.sourceKey=removeNulCharacters(String(safe.sourceKey)).value;
  return safe;
}
