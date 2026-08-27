import "dotenv/config";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = await fsp.readFile(path.join(here, "schema.sql"), "utf8");
  await db.query(sql);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => console.log("Database schema is ready."))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => db.end());
}

