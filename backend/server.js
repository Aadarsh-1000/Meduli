import express from "express";
import cors from "cors";
import fs from "fs";

const app = express();
app.use(cors());

const DB = JSON.parse(
  fs.readFileSync("./diseases.json", "utf8")
);

app.get("/data", (req, res) => {
  res.json(DB);
});

app.listen(3000, () => {
  console.log("✅ Meduli API running at http://localhost:3000");
});
