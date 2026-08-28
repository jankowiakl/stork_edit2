import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";

export function sendOriginalPhoto(res,next,{file,mimeType="image/jpeg"}) {
  res.type(mimeType);
  res.sendFile(file,{dotfiles:"deny"},(error)=>{
    if(error)next(error);
  });
}

export async function sendPreviewOrOriginal(res,next,{
  original,
  originalMimeType="image/jpeg",
  preview,
  createPreview,
  onFallback=()=>{}
}) {
  let temporary=null;
  try {
    if(!fs.existsSync(preview)) {
      temporary=`${preview}.${crypto.randomUUID()}.tmp.webp`;
      await createPreview(temporary);
      await fsp.rename(temporary,preview).catch(async(error)=>{
        if(error.code!=="EEXIST")throw error;
        await fsp.unlink(temporary).catch(()=>{});
      });
      temporary=null;
    }

    // Reading the small cached preview before writing the response keeps all
    // filesystem failures inside this try/catch and avoids sendFile dotfile rules.
    const body=await fsp.readFile(preview);
    res.type("image/webp").send(body);
  } catch(error) {
    if(temporary)await fsp.unlink(temporary).catch(()=>{});
    onFallback(error);
    if(res.headersSent)return next(error);
    sendOriginalPhoto(res,next,{file:original,mimeType:originalMimeType});
  }
}
