import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server=await readFile(new URL("../src/server.js",import.meta.url),"utf8");

test("individual photo endpoint uses bounded 200-item offset pages",()=>{
  const start=server.indexOf('app.get("/api/individuals/:id/photos"');
  const end=server.indexOf('app.get("/api/individuals/:id/route"',start);
  const route=server.slice(start,end);
  assert.match(route,/positiveInt\(req\.query\.page,1,1000000\)/);
  assert.match(route,/positiveInt\(req\.query\.pageSize,200,500\)/);
  assert.match(route,/ORDER BY p\.capture_time NULLS LAST,p\.filename LIMIT \$3 OFFSET \$4/);
  assert.match(route,/SELECT count\(\*\)::int count FROM photos WHERE individual_id=\$1/);
  assert.match(route,/page,pageSize,total,hasMore/);
  assert.doesNotMatch(route,/req\.query\.limit/);
});
