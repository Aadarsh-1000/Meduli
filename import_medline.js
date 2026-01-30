import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Open database
const db = await open({
  filename: "medline.db",
  driver: sqlite3.Database
});

console.log("✅ Database opened");

// Example insert (test)
await db.exec(`
  CREATE TABLE IF NOT EXISTS conditions (
    id INTEGER PRIMARY KEY,
    name TEXT,
    aliases TEXT,
    icd10 TEXT,
    medline_url TEXT
  )
`);

console.log("✅ Table ready");

await db.close();
console.log("✅ Done");
