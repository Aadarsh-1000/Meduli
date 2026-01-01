
/* =========================================================
   Meduli — Full Client-Side Engine (GitHub Pages Safe)
   - No backend
   - No MedlinePlus API
   - Wikidata-compatible
   ========================================================= */

let PACK = { symptomVocabulary: [], conditions: [] };

// ===================== Fetch diseases.json =====================
fetch('diseases.json', { cache: 'no-store' })
  .then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(json => {
    const conditions =
      Array.isArray(json?.conditions) ? json.conditions :
      Array.isArray(json) ? json : [];

    const vocab =
      Array.isArray(json?.symptomVocabulary) ? json.symptomVocabulary : [];

    PACK = { symptomVocabulary: vocab, conditions };
    initApp();
  })
  .catch(err => {
    console.error('Failed to load diseases.json', err);
    alert('Could not load diseases.json. Make sure it is in the same folder and served via GitHub Pages.');
  });

// ===================== App =====================
function initApp() {
  // ---------- DOM ----------
  const ageEl = document.getElementById('age');
  const ageOut = document.getElementById('ageOut');
  const sexChips = document.getElementById('sexChips');
  const symptomChips = document.getElementById('symptomChips');
  const symptomSearch = document.getElementById('symptomSearch');
  const resultsEl = document.getElementById('results');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const explainToggle = document.getElementById('explainToggle');

  // ---------- Helpers ----------
  const lc = v => String(v || '').toLowerCase();
  const uniq = arr => Array.from(new Set(arr));

  // ---------- Symptoms ----------
  const SYMPTOMS = uniq(
    (PACK.symptomVocabulary || []).map(s => lc(s))
  );

  // ---------- Normalize conditions ----------
  const KB = (PACK.conditions || []).map((c, i) => {
    const name = c.laytext || c.text || c.name || `Condition ${i + 1}`;
    const present = normalizeFeatures(c.features?.present);
    const absent = normalizeFeatures(c.features?.absent);

    Object.keys(present).forEach(s => { if (!SYMPTOMS.includes(s)) SYMPTOMS.push(s); });
    Object.keys(absent).forEach(s => { if (!SYMPTOMS.includes(s)) SYMPTOMS.push(s); });

    return {
      id: c.id || `cond_${i}`,
      name,
      features: { present, absent },
      prevalence: Number(c.prevalenceWeight || 0.2),
      demographics: c.demographics || {},
      meta: {
        ICD10: c.references?.icd10 || c.ICD10 || '',
        wiki: [
          c.references?.wikidata,
          c.references?.medline,
          c.wiki, c.wiki2, c.wiki3, c.wiki4
        ].filter(Boolean)
      },
      pearls: c.pearls || [],
      redFlags: c.redFlags || [],
      studyTreatment: c.studyTreatment || []
    };
  });

  function normalizeFeatures(obj) {
    const out = {};
    if (!obj) return out;
    for (const [k, v] of Object.entries(obj)) {
      out[lc(k)] = Number(v) || 1;
    }
    return out;
  }

  // ---------- State ----------
  const state = {
    age: Number(ageEl?.value || 25),
    sex: 'female',
    symptoms: new Set(),
    explain: true,
    query: ''
  };

  // ---------- Rendering ----------
  function renderSymptoms() {
    symptomChips.innerHTML = '';
    SYMPTOMS
      .filter(s => !state.query || s.includes(state.query))
      .sort()
      .forEach(s => {
        const b = document.createElement('button');
        b.className = 'chip' + (state.symptoms.has(s) ? ' active' : '');
        b.textContent = s;
        b.onclick = () => {
          state.symptoms.has(s) ? state.symptoms.delete(s) : state.symptoms.add(s);
          renderSymptoms();
          compute();
        };
        symptomChips.appendChild(b);
      });
  }

  function compute() {
    const ranked = KB.map(c => {
      let score = c.prevalence;
      for (const s of state.symptoms) {
        if (c.features.present[s]) score += c.features.present[s];
        if (c.features.absent[s]) score -= c.features.absent[s] * 0.5;
      }
      if (c.demographics?.gender && c.demographics.gender !== state.sex) score = 0;
      return { ...c, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

    renderResults(ranked);
  }

  function renderResults(list) {
    resultsEl.innerHTML = '';
    if (!list.length) {
      resultsEl.textContent = 'Select symptoms to see possible conditions.';
      return;
    }

    list.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'result-card';

      const h = document.createElement('h3');
      h.textContent = (i === 0 ? '🧠 ' : '') + c.name;

      const score = document.createElement('div');
      score.className = 'pill';
      score.textContent = 'Score ' + c.score.toFixed(2);

      card.append(h, score);

      if (state.explain) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = 'Ranked by symptom overlap and prevalence (educational only).';
        card.appendChild(p);
      }

      if (c.meta.wiki.length) {
        const links = document.createElement('div');
        c.meta.wiki.forEach((w, i) => {
          const a = document.createElement('a');
          a.href = w;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = 'Reference ' + (i + 1);
          links.appendChild(a);
        });
        card.appendChild(links);
      }

      resultsEl.appendChild(card);
    });
  }

  // ---------- Events ----------
  ageEl?.addEventListener('input', e => {
    state.age = Number(e.target.value || 0);
    if (ageOut) ageOut.textContent = state.age;
    compute();
  });

  sexChips?.addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    state.sex = c.dataset.sex;
    [...sexChips.children].forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    compute();
  });

  symptomSearch?.addEventListener('input', e => {
    state.query = lc(e.target.value);
    renderSymptoms();
  });

  clearAllBtn?.addEventListener('click', () => {
    state.symptoms.clear();
    renderSymptoms();
    compute();
  });

  explainToggle?.addEventListener('change', e => {
    state.explain = e.target.checked;
    compute();
  });

  // ---------- Init ----------
  if (ageOut) ageOut.textContent = state.age;
  renderSymptoms();
  compute();
}
