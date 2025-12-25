// ===================== Load data from API =====================
let PACK = { symptomVocabulary: [], conditions: [] };

// CHANGE THIS IF DEPLOYED
const API_BASE = "http://localhost:3000";

fetch(`${API_BASE}/data`)
  .then(r => {
    if (!r.ok) throw new Error("API error " + r.status);
    return r.json();
  })
  .then(json => {
    PACK = {
      symptomVocabulary: Array.isArray(json.symptomVocabulary)
        ? json.symptomVocabulary
        : [],
      conditions: Array.isArray(json.conditions)
        ? json.conditions
        : []
    };
    initApp(); // 🔥 your existing app boot
  })
  .catch(err => {
    console.error("Failed to load API data", err);
    alert(
      "Medical database unavailable.\n" +
      "Make sure the backend server is running."
    );
  });

// ===================== EVERYTHING BELOW IS YOUR ORIGINAL CODE =====================
// (UNMODIFIED EXCEPT INDENTATION SAFETY)

function initApp() {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const ageEl = document.getElementById('age');
  const ageOut = document.getElementById('ageOut');
  if (ageEl && ageOut) {
    ageOut.textContent = ageEl.value;
    ageEl.oninput = () => ageOut.textContent = ageEl.value;
  }

  const sexChips = document.getElementById('sexChips');
  let sex = "female";
  sexChips?.addEventListener("click", e => {
    if (!e.target.dataset.sex) return;
    [...sexChips.children].forEach(c => c.classList.remove("active"));
    e.target.classList.add("active");
    sex = e.target.dataset.sex;
    run();
  });

  const symptomSearch = document.getElementById("symptomSearch");
  const symptomChips = document.getElementById("symptomChips");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const resultsEl = document.getElementById("results");

  let selected = new Set();

  function renderSymptoms(filter = "") {
    symptomChips.innerHTML = "";
    PACK.symptomVocabulary
      .filter(s => s.includes(filter))
      .forEach(sym => {
        const btn = document.createElement("button");
        btn.className = "chip" + (selected.has(sym) ? " active" : "");
        btn.textContent = sym;
        btn.onclick = () => {
          selected.has(sym) ? selected.delete(sym) : selected.add(sym);
          run();
          renderSymptoms(filter);
        };
        symptomChips.appendChild(btn);
      });
  }

  symptomSearch.oninput = e => renderSymptoms(e.target.value.toLowerCase());
  clearAllBtn.onclick = () => {
    selected.clear();
    run();
    renderSymptoms();
  };

  function run() {
    const results = PACK.conditions.map(c => {
      const present = c.symptoms || [];
      let score = 0;

      selected.forEach(s => {
        if (present.includes(s)) score++;
      });

      return {
        name: c.name,
        aliases: c.aliases || [],
        score: present.length ? score / present.length : 0
      };
    })
    .filter(r => r.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, 6);

    renderResults(results);
  }

  function renderResults(list) {
    resultsEl.innerHTML = "";
    if (!list.length) {
      resultsEl.innerHTML = `<div class="empty">No matches</div>`;
      return;
    }

    list.forEach(r => {
      const div = document.createElement("div");
      div.className = "result-card";
      div.innerHTML = `
        <div class="result-head">
          <strong>${r.name}</strong>
          <span class="pill">${Math.round(r.score * 100)}%</span>
        </div>
        <div class="muted">${r.aliases.join(", ")}</div>
      `;
      resultsEl.appendChild(div);
    });
  }

  renderSymptoms();
}
