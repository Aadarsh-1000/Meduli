import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();

const db = await open({
  filename: "medline.db",
  driver: sqlite3.Database
});

app.get("/api/condition", async (req, res) => {
  const q = req.query.q?.toLowerCase();
  if (!q) return res.json(null);

  const row = await db.get(
    `SELECT * FROM conditions WHERE name LIKE ? OR aliases LIKE ?`,
    `%${q}%`,
    `%${q}%`
  );

  res.json(row ? {
    name: row.name,
    aliases: JSON.parse(row.aliases),
    icd10: JSON.parse(row.icd10),
    medline: row.medline_url
  } : null);
});

app.listen(3000, () => console.log("API running on http://localhost:3000"));
