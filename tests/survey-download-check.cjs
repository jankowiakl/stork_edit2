const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.events={};this.disabled=false;this.open=false;}
  append(...nodes){this.children.push(...nodes);}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this[k];delete this.attrs[k];}addEventListener(k,fn){this.events[k]=fn;}showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}focus(){}remove(){}click(){if(this.tagName==='a')downloads.push(this.download);}
}
const downloads=[],body=new Node('body'),document={body,createElement:tag=>new Node(tag)};
const code=fs.readFileSync(require.resolve('../survey-download.js'),'utf8'),sandbox={document,AbortController,DOMException,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:(fn,ms)=>ms===30000?0:setTimeout(fn,ms)};
vm.runInNewContext(code,sandbox);
(async()=>{
  let calls=0,mode='success',release;const request=async(url,{signal})=>{calls++;if(mode==='success')return new Response('a,b\r\n1,2\r\n',{headers:{'Content-Type':'text/csv','Content-Length':'10'}});if(mode==='error')throw Error('HTTP 403');if(mode==='stream')return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2]));}}));return new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));});};
  const downloader=sandbox.StorkSurveyDownload.create({request,t:(key,vars)=>key+(vars?JSON.stringify(vars):''),userId:()=> 'user'}),dialog=body.children[0],[title,label,status,progress,details,action]=dialog.children,button=new Node('button');
  await downloader.download({url:'/csv',filename:'long.csv',label:'surveyExport.long',format:'csv',button});assert.deepEqual(downloads,['long.csv']);assert.equal(button.disabled,false);assert.ok(status.textContent.includes('.done'));assert.ok(details.textContent.includes('10'));assert.equal(action.textContent,'help.close');
  mode='waiting';const pending=downloader.download({url:'/xlsx',filename:'cancel.xlsx',label:'surveyExport.longPhotos',format:'xlsx',button});assert.equal(button.disabled,true);assert.equal(progress.value,undefined);await downloader.download({url:'/duplicate',format:'csv'});assert.equal(calls,2);action.onclick();await pending;assert.equal(downloads.length,1);assert.ok(status.textContent.includes('.cancelled'));assert.equal(button.disabled,false);
  mode='stream';const stream=downloader.download({url:'/stream',filename:'partial.csv',label:'surveyExport.long',format:'csv',button});await new Promise(r=>setTimeout(r,0));assert.ok(details.textContent.includes('2'));dialog.events.cancel({preventDefault(){}});await stream;assert.equal(downloads.length,1);assert.ok(status.textContent.includes('.cancelled'));
  mode='error';await downloader.download({url:'/403',format:'csv',label:'surveyExport.summary',button});assert.ok(status.textContent.includes('HTTP 403'));assert.equal(button.disabled,false);
  for(const name of ['index.html','app-i18n.js','survey-download.js','sw.js','api/src/survey-routes.js','api/src/survey-export.js']){
    const text=fs.readFileSync(require.resolve('../'+name),'utf8');if(name==='index.html'){for(const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=/.test(match[1])&&match[2].trim())new vm.Script(match[2]);}else if(!name.startsWith('api/'))new vm.Script(text);
  }
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');assert.ok(!/downloadApiFile\([^\n;]*export-(?:long|summary)/.test(html));assert.ok(html.includes('bindSurveyDataExports(campaignId)'));assert.ok(html.includes('if(admin){bindSurveyDataExports()'));
  console.log('PASS: download success/real byte count, indeterminate preparation, cancel before headers and during stream, no partial download, duplicate suppression, HTTP error display, button reset, frontend syntax and both export panels (simulated DOM).');
})().catch(error=>{console.error(error);process.exitCode=1;});
