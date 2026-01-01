import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const db = await open({
  filename: "medline.db",
  driver: sqlite3.Database
});

await db.exec(`
CREATE TABLE IF NOT EXISTS conditions (
  id TEXT PRIMARY KEY,
  name TEXT,
  aliases TEXT,
  icd10 TEXT,
  medline_url TEXT
)`);

async function fetchMedline(term) {
  const url =
    "https://wsearch.nlm.nih.gov/ws/query" +
    "?db=healthTopics&term=" + encodeURIComponent(term);

  const res = await fetch(url);
  const xml = await res.text();

  const pick = key =>
    [...xml.matchAll(/<content name="([^"]+)">([\s\S]*?)<\/content>/g)]
      .find(m => m[1] === key)?.[2] || "";

  return {
    name: pick("title"),
    aliases: pick("alsoCalled").split(";").map(s => s.trim()).filter(Boolean),
    icd10: pick("icd10cm").split(";").map(s => s.trim()).filter(Boolean),
    medline: pick("url")
  };
}

// Example import
const terms = ["Influenza", "Asthma", "Dengue fever", "Malaria"];

for (const t of terms) {
  const m = await fetchMedline(t);
  await db.run(
    `INSERT OR REPLACE INTO conditions VALUES (?,?,?,?,?)`,
    t.toLowerCase(),
    m.name,
    JSON.stringify(m.aliases),
    JSON.stringify(m.icd10),
    m.medline
  );
}

console.log("✅ Medline DB ready");
