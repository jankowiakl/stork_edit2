import crypto from "node:crypto";

const photoSafeLinkKey=()=>{
  const secret=String(process.env.PHOTO_SAFE_LINK_ENCRYPTION_KEY||process.env.JWT_SECRET||"");
  if(secret.length<32)throw new Error("photo_safe_link_encryption_key_required");
  return crypto.createHash("sha256").update(`stork-photo-safe-link:${secret}`).digest();
};

export const encryptPhotoSafeToken=(value)=>{
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",photoSafeLinkKey(),iv),encrypted=Buffer.concat([cipher.update(String(value||""),"utf8"),cipher.final()]),tag=cipher.getAuthTag();
  return`v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
};

export const decryptPhotoSafeToken=(value)=>{
  try{
    const[version,iv,tag,payload]=String(value||"").split(".");
    if(version!=="v1"||!iv||!tag||!payload)return null;
    const decipher=crypto.createDecipheriv("aes-256-gcm",photoSafeLinkKey(),Buffer.from(iv,"base64url"));
    decipher.setAuthTag(Buffer.from(tag,"base64url"));
    return Buffer.concat([decipher.update(Buffer.from(payload,"base64url")),decipher.final()]).toString("utf8")||null;
  }catch(_error){return null;}
};
