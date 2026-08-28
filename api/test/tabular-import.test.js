import test from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectDelimiter,parseDelimited,readTabularFile } from "../src/tabular-import.js";

test("detects comma, semicolon and tab delimited files",()=>{
  assert.equal(detectDelimiter("Bird,FileName,Remarks\nA,a.jpg,x",".csv"),",");
  assert.equal(detectDelimiter("Bird;FileName;Remarks\nA;a.jpg;x",".csv"),";");
  assert.equal(detectDelimiter("Bird\tFileName\tRemarks\nA\ta.jpg\tx",".txt"),"\t");
});

test("parses quoted delimiters and line breaks",()=>{
  assert.deepEqual(parseDelimited('Bird;FileName;Remarks\r\nA;a.jpg;"one; two"\r\nB;b.jpg;"line 1\nline 2"',';'),[
    ["Bird","FileName","Remarks"],["A","a.jpg","one; two"],["B","b.jpg","line 1\nline 2"]
  ]);
});

test("imports only selected columns, always retaining photo identity, and removes NUL",async()=>{
  const directory=await fsp.mkdtemp(path.join(os.tmpdir(),"stork-tabular-")),file=path.join(directory,"data.csv");
  try{
    await fsp.writeFile(file,"Bird;FileName;Pheno_period;Remarks;Country\n1d0000097a;photo.jpg;A_migra\u0000tion;note\u0000;Polska","utf8");
    const result=await readTabularFile(file,{columns:["Pheno_period"]});
    assert.deepEqual(result.rows,[{__sourceRow:2,Bird:"1d0000097a",FileName:"photo.jpg",Pheno_period:"A_migration"}]);
    assert.equal(result.nulIssues.length,1);
    assert.deepEqual(result.nulIssues[0],{type:"nul_characters_removed",sourceRow:2,field:"Pheno_period",removed:1});
  }finally{await fsp.rm(directory,{recursive:true,force:true});}
});
