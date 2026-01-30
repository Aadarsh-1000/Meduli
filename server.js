import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import OpenAI from "openai";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ LOAD ENV FIRST
dotenv.config({
  path: path.join(__dirname, ".env.local"), // or ".env" if you prefer
  override: true
});

// ✅ NOW LOG (after dotenv)
console.log("OpenAI key loaded:", Boolean(process.env.OPENAI_API_KEY));

const app = express();
app.use(cors());
app.use(express.json());

// -------------------- DATABASE --------------------
const db = await open({
  filename: "medline.db",
  driver: sqlite3.Database
});

// -------------------- OPENAI --------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// -------------------- SYSTEM PROMPT --------------------
const SYSTEM_PROMPT = `
You are a clinical reasoning assistant.

You do NOT diagnose.
You do NOT provide medical advice or treatment.
You ONLY explain why conditions were ranked.

Rules:
- Use ONLY the provided data
- Do NOT invent sources
- Do NOT browse the web
- State uncertainty clearly
- If red flags exist, say urgent medical evaluation may be required

Return valid JSON only.
`;

// -------------------- MEDLINE LOOKUP --------------------
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
    aliases: JSON.parse(row.aliases || "[]"),
    icd10: JSON.parse(row.icd10 || "[]"),
    medline: row.medline_url
  } : null);
});

// -------------------- AI EXPLANATION --------------------
app.post("/api/explain", async (req, res) => {
  try {
    const { input, rankedConditions } = req.body;

    if (!Array.isArray(rankedConditions) || rankedConditions.length === 0) {
      return res.status(400).json({ error: "No ranked conditions provided" });
    }

    // 🔒 Minimal, safe payload
    const payload = {
      input,
      rankedConditions: rankedConditions.map(c => ({
        name: c.name,
        matchedSymptoms: c.matchedSymptoms || [],
        absentSymptoms: c.absentSymptoms || [],
        redFlags: c.redFlags || [],
        evidence: c.evidence || {},
        medline: c.medline || null
      }))
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `
Explain why each condition was ranked.

For each condition return:
- condition
- supporting_symptoms (with sources)
- contradicting_or_absent_symptoms
- comparison_to_other_conditions
- red_flags
- confidence (Low | Moderate | High)

Payload:
${JSON.stringify(payload, null, 2)}
          `
        }
      ]
    });

    const raw = completion.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error: "Invalid AI response",
        raw
      });
    }

    res.json(parsed);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI explanation failed" });
  }
});

// -------------------- START SERVER --------------------
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
