// ===================== Fetch diseases.json =====================
fetch('diseases.json', { cache: 'no-store' })
  .then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(async json => {
    const rootArr =
      Array.isArray(json) ? json
        : Array.isArray(json?.conditions) ? json.conditions
          : Array.isArray(json?.items) ? json.items
            : Array.isArray(json?.diseases) ? json.diseases
              : [];

    const vocab =
      Array.isArray(json?.symptomVocabulary) ? json.symptomVocabulary
        : Array.isArray(json?.symptoms) ? json.symptoms
          : Array.isArray(json?.vocab) ? json.vocab
            : [];

    PACK = { symptomVocabulary: vocab, conditions: rootArr };
    const resultsEl = document.getElementById('results');
    initApp();
  })
  .catch(err => {
    console.error('Failed to load diseases.json', err);
    alert([
      'Could not load diseases.json.',
      'Make sure index.html and diseases.json are in the SAME folder.',
      'Serve the folder via a local server (e.g., python -m http.server 8000).',
      'Then open http://localhost:8000/'
    ].join('\n'));
  });

// ===================== App Boot (single definition) ====================

function initApp() {
  // ---------- DOM ----------
  const yearEl = document.getElementById('year');
  const ageEl = document.getElementById('age');
  const ageOut = document.getElementById('ageOut');
  const sexChips = document.getElementById('sexChips');
  const symptomChips = document.getElementById('symptomChips');
  const symptomSearch = document.getElementById('symptomSearch');
  const customSymptom = document.getElementById('customSymptom');
  const addCustomBtn = document.getElementById('addCustomBtn');
  const negInput = document.getElementById('negInput');
  const negBadges = document.getElementById('negBadges');
  const freeText = document.getElementById('freeText');
  const explainToggle = document.getElementById('explainToggle');
  const resultsEl = document.getElementById('results');
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- Helpers ----------
  const str = v => (v == null ? '' : String(v));
  const lc = v => str(v).toLowerCase();
  const toArray = v => Array.isArray(v) ? v : (v == null ? [] : [String(v)]);

  function toListAny(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    const s = String(v);
    if (/[;,\|/]/.test(s)) return s.split(/[;,\|/]+/).map(x => x.trim()).filter(Boolean);
    return s.trim() ? [s.trim()] : [];
  }

  function keyPickCI(obj, keys) {
    if (!obj) return undefined;
    for (const path of keys) {
      const parts = path.split('.');
      let cur = obj, ok = true;
      for (const p of parts) {
        if (!cur || typeof cur !== 'object') { ok = false; break; }
        const hit = Object.keys(cur).find(k => k.toLowerCase() === p.toLowerCase());
        if (!hit) { ok = false; break; }
        cur = cur[hit];
      }
      if (ok) return cur;
    }
    return undefined;
  }

  function listToFeatureMap(arrOrStr, defaultWeight = 1) {
    const out = {};
    toListAny(arrOrStr).forEach(item => {
      if (typeof item === 'string') {
        const k = item.toLowerCase().trim();
        if (k) out[k] = out[k] ?? defaultWeight;
      } else if (item && typeof item === 'object') {
        const name = (
          item.name || item.text || item.label || item.symptom || item.term || ''
        ).toString().toLowerCase().trim();
        if (name) {
          const w = Number(item.weight ?? item.w ?? item.value ?? defaultWeight) || defaultWeight;
          out[name] = w;
        }
      }
    });
    return out;
  }

  function normalizeFeatureDict(maybe) {
    if (maybe == null) return {};
    if (Array.isArray(maybe) || typeof maybe === 'string') return listToFeatureMap(maybe);
    if (typeof maybe === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(maybe)) {
        if (!k) continue;
        if (typeof v === 'object') {
          const w = Number(v.weight ?? v.w ?? 1) || 1;
          out[k.toLowerCase()] = w;
        } else out[k.toLowerCase()] = Number(v) || 1;
      }
      return out;
    }
    return {};
  }

  function toList(v) { return toListAny(v).map(x => String(x)); }
  function pickFirstList(obj, keys) {
    for (const k of keys) { const v = keyPickCI(obj, [k]); if (v != null) return toList(v); }
    return [];
  }

  function inferGenderFromName(nm) {
    const L = lc(nm);
    if (L.includes('prostat') || L.includes('testic') || L.includes('peni')) return 'male';
    if (L.includes('ovari') || L.includes('uter') || L.includes('pregnan') || L.includes('cervi') || L.includes('vagin')) return 'female';
    return null;
  }
  function riskToWeight(risk) {
    const r = Number(risk);
    if (!isFinite(r)) return 0.2;
    return Math.max(0.05, Math.min(0.55, 0.1 * r + 0.05));
  }

  // ---------- Vocabulary ----------
  const DEFAULT_SYMPTOMS = (Array.isArray(PACK.symptomVocabulary) && PACK.symptomVocabulary.length)
    ? PACK.symptomVocabulary.map(s => lc(s))
    : ['fever', 'cough', 'sore throat', 'runny nose', 'headache', 'myalgia', 'fatigue', 'shortness of breath', 'chest pain', 'abdominal pain', 'nausea', 'vomiting', 'diarrhoea', 'dysuria', 'frequency', 'rash', 'joint pain', 'anosmia', 'loss of taste', 'photophobia', 'rigors', 'night sweats', 'wheeze', 'flank pain', 'back pain', 'dizziness', 'syncope', 'hematuria', 'jaundice', 'weight loss'];

  const SYMPTOMS = Array.from(new Set(DEFAULT_SYMPTOMS));

  // ---------- Normalize KB ----------
  const KB = (Array.isArray(PACK.conditions) ? PACK.conditions : [])
    .filter(Boolean)
    .map((c, i) => {
      const id = str(c.id || c.code || c.name || c.text || `cond_${i}`);
      console.log(c.name || c.text, c.aliases);
      const displayName = str(
        c.laytext ||
        c.text ||
        c.name ||
        (Array.isArray(c.aliases) ? c.aliases[0] : '') ||
        `Condition ${i + 1}`
      );


      let gender = lc(c.gender || c.sex || '');
      if (!gender && c.IsGenderSpecific) gender = inferGenderFromName(displayName) || '';
      const minAge = (typeof c.minAge === 'number') ? c.minAge : undefined;
      const maxAge = (typeof c.maxAge === 'number') ? c.maxAge : undefined;
      const demographics = (gender || minAge != null || maxAge != null) ? { gender: gender || undefined, minAge, maxAge } : null;

      // Features (present/absent) with many aliases
      let present = {}, absent = {};
      const fPresent = keyPickCI(c, ['features.present', 'presentFeatures', 'featuresPositive', 'positive']);
      const fAbsent = keyPickCI(c, ['features.absent', 'absentFeatures', 'featuresNegative', 'negative']);
      present = { ...present, ...normalizeFeatureDict(fPresent) };
      absent = { ...absent, ...normalizeFeatureDict(fAbsent) };

      const presentAliases = [
        'presentSymptoms', 'symptoms', 'typicalSymptoms', 'commonSymptoms',
        'signsAndSymptoms', 'sx', 'clinicalFeatures', 'keySymptoms', 'primarySymptoms',
        'signs', 'symptomList', 'sxList', 'Sx', 'S/S'
      ];
      for (const k of presentAliases) { const v = keyPickCI(c, [k]); if (v != null) present = { ...present, ...listToFeatureMap(v) }; }

      const absentAliases = [
        'absentSymptoms', 'oftenAbsent', 'notTypical', 'negSymptoms', 'differentiators',
        'rarelyPresent', 'usuallyAbsent', 'negativeFindings'
      ];
      for (const k of absentAliases) { const v = keyPickCI(c, [k]); if (v != null) absent = { ...absent, ...listToFeatureMap(v) }; }

      // ---------- Fallbacks ----------
      // (1) Text-based symptom inference (light-weight matches from name/alias/etc.)
      function inferFromText(txt) {
        const hits = {};
        if (!txt) return hits;
        const T = String(txt).toLowerCase();
        SYMPTOMS.forEach(sym => {
          if (sym.length < 3) return;
          const re = new RegExp(`(^|\\W)${sym.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(\\W|$)`, 'i');
          if (re.test(T)) hits[sym] = Math.max(hits[sym] || 0, 0.5);
        });
        return hits;
      }
      if (Object.keys(present).length === 0) {
        const textFields = [
          c.laytext,
          c.text,
          c.name,
          ...(Array.isArray(c.aliases) ? c.aliases : []),
          c.alias,
          c.category,
          c.type,
          c.class,
          c.description,
          c.overview,
          c.summary,
          c.note,
          c.notes
        ].filter(Boolean).join(' • ');

        const inferred = inferFromText(textFields);
        if (Object.keys(inferred).length) {
          present = { ...present, ...inferred };
        }
      }

      // (2) Clinical keyword heuristics for common entities in your dataset
      if (Object.keys(present).length === 0) {
        const label = `${c.name || ''} ${c.text || ''} ${c.laytext || ''} ${c.alias || ''}`.toLowerCase();

        const heuristics = [
          { when: /(pneumonia|pna|hcap|cap)\b/, add: ['cough', 'fever', 'shortness of breath', 'chest pain', 'rigors'] },
          { when: /\bbronchitis|tracheobronchitis\b/, add: ['cough', 'wheeze', 'fatigue', 'shortness of breath'] },
          { when: /\bpharyngitis|sore throat|strep\b/, add: ['sore throat', 'fever', 'headache'] },
          { when: /\bsinusitis\b/, add: ['runny nose', 'headache', 'fever'] },
          { when: /\blaryngitis\b/, add: ['sore throat', 'cough', 'hoarseness'] },
          { when: /\bpneumothorax|ptx\b/, add: ['chest pain', 'shortness of breath'] },
          { when: /\bpulmonary embol(ism|us)|\bpe\b/, add: ['shortness of breath', 'chest pain', 'hematuria'] }, // hematuria not classic but in vocab; okay to omit if you prefer
          { when: /\bpancreatitis\b/, add: ['abdominal pain', 'nausea', 'vomiting', 'back pain', 'fever'] },
          { when: /\bgastroenteritis\b/, add: ['diarrhoea', 'vomiting', 'abdominal pain', 'fever'] },
          { when: /\bgerd|reflux|esophagitis\b/, add: ['chest pain', 'sore throat'] },
          { when: /\bmi\b|\bacute coronary|unstable angina|cad\b/, add: ['chest pain', 'nausea', 'sweating', 'shortness of breath'] },
          { when: /\ballergic rhinitis|hay fever\b/, add: ['runny nose', 'sore throat', 'cough'] }
        ];

        heuristics.forEach(rule => {
          if (rule.when.test(label)) {
            rule.add.forEach(s => {
              const k = s.toLowerCase();
              present[k] = Math.max(present[k] || 0, 0.7);
            });
          }
        });
      }

      // Enrich vocabulary with anything seen
      Object.keys(present).forEach(k => { if (k && !SYMPTOMS.includes(k)) SYMPTOMS.push(k); });
      Object.keys(absent).forEach(k => { if (k && !SYMPTOMS.includes(k)) SYMPTOMS.push(k); });

      // Treatment (aliases)
      const studyTreatment = pickFirstList(c, [
        'studyTreatment', 'studyTreatement', 'treatment', 'treatments', 'management', 'managementPlan', 'therapy', 'therapies', 'tx', 'plan', 'treatment_plan'
      ]);

      // Info/meta with aliases + defaults
      const ICD10 = str(keyPickCI(c, ['ICD10', 'icd10', 'ICD', 'icd']) || '');
      const alias = str(keyPickCI(c, ['alias', 'aka', 'otherNames']) || '');
      const category = str(keyPickCI(c, ['category', 'type', 'class']) || '');
      const wikiList = [
        typeof c.references?.wikidata === 'string'
          ? c.references.wikidata
          : c.references?.wikidata?.url,

        c.wiki,
        c.wiki2,
        c.wiki3,
        c.wiki4
      ].filter(x => typeof x === 'string' && x.startsWith('http'));



      const pearls = toArray(c.pearls);
      const redFlags = toArray(c.redFlags || c.redflags);
      const prevalenceWeight = (typeof c.prevalenceWeight === 'number') ? c.prevalenceWeight : riskToWeight(c.Risk);

      const meta = {
        category,
        ICD10,
        alias,
        wiki: wikiList,
        IsRare: !!c.IsRare,
        IsCantMiss: !!c.IsCantMiss,
        IsImmLifeThreatening: !!c.IsImmLifeThreatening,
        IsGenderSpecific: !!c.IsGenderSpecific,
        Risk: (c.Risk != null ? Number(c.Risk) : undefined)
      };

      return {
        id,
        name: displayName,
        aliases: Array.isArray(c.aliases) ? c.aliases : [],
        demographics,
        features: { present, absent },
        pearls,
        redFlags,
        studyTreatment,
        prevalenceWeight,
        meta
      };
    });

  // ---------- State ----------
  const state = {
    age: parseInt(ageEl?.value || '22', 10),
    sex: 'female',
    selectedSymptoms: new Set(),
    negatives: new Set(),
    freeText: '',
    explain: true,
    symptomQuery: ''
  };

  // ---------- Utils ----------
  function tokenize(text) { return String(text).toLowerCase().split(/[^a-zA-Z\u00C0-\u024F0-9]+/).filter(Boolean); }
  function normalizeSymptom(s) { return String(s || '').trim().toLowerCase(); }

  function scoreCondition({ age, gender, symptomsSet, explicitNegatives }) {
    const ranked = KB.map(cond => {
      const d = cond.demographics;
      if (d) {
        if (typeof d.minAge === 'number' && age < d.minAge) return { id: cond.id, name: cond.name, score: 0, ref: cond };
        if (typeof d.maxAge === 'number' && age > d.maxAge) return { id: cond.id, name: cond.name, score: 0, ref: cond };
        if (d.gender && gender && d.gender !== gender) return { id: cond.id, name: cond.name, score: 0, ref: cond };
      }
      let score = cond.prevalenceWeight;
      const present = cond.features.present || {};
      const absent = cond.features.absent || {};
      for (const feat in present) if (symptomsSet.has(feat)) score += Number(present[feat]) || 0;
      for (const feat in absent) if (!symptomsSet.has(feat) && explicitNegatives.has(feat)) score += (Number(absent[feat]) || 0) * 0.5;
      return { id: cond.id, name: cond.name, score, ref: cond };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
    return ranked;
  }

  // ---------- Tiny UI builders ----------
  function badge(text, kind = 'neutral') { const b = document.createElement('span'); b.className = `badge badge-${kind}`; b.textContent = text; return b; }
  function chip(text, kind = 'neutral') { const c = document.createElement('span'); c.className = `chip chip-${kind}`; c.textContent = text; return c; }
  function row(label, valueElOrText) {
    const wrap = document.createElement('div'); wrap.className = 'kv-row';
    const kEl = document.createElement('div'); kEl.className = 'kv-k'; kEl.textContent = label;
    const vEl = document.createElement('div'); vEl.className = 'kv-v';
    if (typeof valueElOrText === 'string') vEl.textContent = valueElOrText; else vEl.appendChild(valueElOrText);
    wrap.append(kEl, vEl); return wrap;
  }

  // ---------- Rendering ----------
  function renderSymptomChips() {
    const q = state.symptomQuery;
    symptomChips.innerHTML = '';
    const items = SYMPTOMS.filter(s => !q || s.includes(q)).sort((a, b) => a.localeCompare(b));
    if (!items.length) {
      const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'No symptoms match your search.'; symptomChips.appendChild(empty); return;
    }
    items.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (state.selectedSymptoms.has(s) ? ' active' : '');
      btn.type = 'button'; btn.textContent = s; btn.setAttribute('aria-pressed', state.selectedSymptoms.has(s) ? 'true' : 'false');
      btn.addEventListener('click', () => { if (state.selectedSymptoms.has(s)) state.selectedSymptoms.delete(s); else state.selectedSymptoms.add(s); renderSymptomChips(); computeAndRender(); });
      symptomChips.appendChild(btn);
    });
  }

  function renderNegatives() {
    negBadges.innerHTML = ''; if (!state.negatives.size) return;
    state.negatives.forEach(n => {
      const b = document.createElement('span'); b.className = 'badge badge-neg';
      const x = document.createElement('button'); x.textContent = '×'; x.title = 'remove'; x.className = 'badge-x';
      x.addEventListener('click', () => { state.negatives.delete(n); renderNegatives(); computeAndRender(); });
      b.append(n, ' ', x); negBadges.appendChild(b);
    });
  }

  function hasAny(arr) { return Array.isArray(arr) && arr.length > 0; }

  function renderResults(ranked) {
    resultsEl.innerHTML = '';
    if (!ranked || !ranked.length) {
      const div = document.createElement('div'); div.className = 'muted'; div.textContent = 'Start selecting symptoms to see differentials.'; resultsEl.appendChild(div); return;
    }

    ranked.forEach((r, idx) => {
      const wrap = document.createElement('div'); wrap.className = 'result-card';

      // Header
      const head = document.createElement('div'); head.className = 'result-head';
      const title = document.createElement('div'); title.innerHTML = (idx === 0 ? '🧠 ' : 'ℹ️ ') + r.name;
      const score = document.createElement('div'); score.className = 'pill'; score.textContent = 'Score: ' + r.score.toFixed(2);
      head.append(title, score);

      const cond = r.ref;

      // Badges row
      const flagsRow = document.createElement('div'); flagsRow.className = 'flags-row';
      if (cond.meta?.IsCantMiss) flagsRow.appendChild(badge('Can’t miss', 'danger'));
      if (cond.meta?.IsImmLifeThreatening) flagsRow.appendChild(badge('Immediate threat', 'warn'));
      if (cond.meta?.IsRare) flagsRow.appendChild(badge('Rare', 'info'));
      if (cond.demographics?.gender) flagsRow.appendChild(badge(cond.demographics.gender === 'male' ? 'Male-only' : 'Female-only', 'neutral'));
      if (cond.meta?.category) flagsRow.appendChild(badge(cond.meta.category, 'soft'));
      if (Number.isFinite(cond.meta?.Risk)) {
        const stars = '★★★★★'.slice(0, Math.max(0, Math.min(5, Math.round(cond.meta.Risk))));
        flagsRow.appendChild(badge(`Risk ${stars.padEnd(5, '☆')}`, 'soft'));
      }

      // Tabs + panels
      const tabs = document.createElement('div'); tabs.className = 'tabs';
      const panels = document.createElement('div');

      // Info panel (with defaults)
      const infoPanel = document.createElement('div'); infoPanel.className = 'info-panel';
      const grid = document.createElement('div'); grid.className = 'kv';
      const icd10 = Array.isArray(cond.ref?.references?.icd10)
        ? cond.ref.references.icd10.join(', ')
        : typeof cond.ref?.references?.icd10 === 'string'
          ? cond.ref.references.icd10
          : cond.meta?.ICD10 || 'Not provided';


      grid.appendChild(row('ICD-10', icd10));
      grid.appendChild(
        row(
          'Aliases',
          cond.aliases.length
            ? cond.aliases.join(', ')
            : 'Not provided'
        )
      );

      if (typeof cond.demographics?.minAge === 'number' || typeof cond.demographics?.maxAge === 'number') {
        const range = `${cond.demographics?.minAge ?? '—'} to ${cond.demographics?.maxAge ?? '—'}`; grid.appendChild(row('Age range', range));
      }
      if (cond.meta?.wiki?.length) {
        const linkWrap = document.createElement('div'); linkWrap.className = 'links';
        cond.meta.wiki.forEach((w, i) => { if (!w) return; const a = document.createElement('a'); a.href = w; a.target = '_blank'; a.rel = 'noopener'; a.className = 'link-btn'; a.textContent = `Reference ${i + 1}`; linkWrap.appendChild(a); });
        grid.appendChild(row('References', linkWrap));
      } else {
        grid.appendChild(row('References', 'Not provided'));
      }
      infoPanel.appendChild(grid);

      // Symptom chips
      const symBlock = document.createElement('div'); symBlock.className = 'sym-block';

      const posWrap = document.createElement('div'); posWrap.className = 'sym-wrap';
      const posTitle = document.createElement('div'); posTitle.className = 'sym-title'; posTitle.textContent = 'Typical symptoms';
      posWrap.appendChild(posTitle);
      const present = cond.features.present || {};
      const presKeys = Object.keys(present);
      if (presKeys.length) {
        const list = document.createElement('div'); list.className = 'chiplist';
        presKeys.sort().forEach(k => { const weight = Number(present[k]) || 0; const c = chip(k, 'pos'); if (weight) c.title = `weight: ${weight}`; list.appendChild(c); });
        posWrap.appendChild(list);
      } else { posWrap.appendChild(chip('Not provided', 'muted')); }

      const negWrap = document.createElement('div'); negWrap.className = 'sym-wrap';
      const negTitle = document.createElement('div'); negTitle.className = 'sym-title'; negTitle.textContent = 'Often absent';
      negWrap.appendChild(negTitle);
      const absent = cond.features.absent || {};
      const absKeys = Object.keys(absent);
      if (absKeys.length) {
        const list = document.createElement('div'); list.className = 'chiplist';
        absKeys.sort().forEach(k => { const weight = Number(absent[k]) || 0; const c = chip(k, 'neg'); if (weight) c.title = `weight: ${weight}`; list.appendChild(c); });
        negWrap.appendChild(list);
      } else { negWrap.appendChild(chip('Not provided', 'muted')); }

      symBlock.append(posWrap, negWrap);

      // Tab definitions (hide empty tabs except Info)
      const tabsDef = [];
      if (Array.isArray(cond.studyTreatment) && cond.studyTreatment.length) tabsDef.push(['tx', 'Treatment', cond.studyTreatment]);
      if (Array.isArray(cond.redFlags) && cond.redFlags.length) tabsDef.push(['flags', 'Red flags', cond.redFlags]);
      if (Array.isArray(cond.pearls) && cond.pearls.length) tabsDef.push(['pearls', 'Pearls', cond.pearls]);
      tabsDef.push(['info', 'Info', []]); // always show Info

      // Buttons
      function addTabButton(id, label) {
        const b = document.createElement('button');
        b.className = 'tab-btn';
        b.textContent = label;
        b.addEventListener('click', () => { active = id;[...tabs.children].forEach(x => x.classList.remove('active')); b.classList.add('active'); drawPanels(); });
        tabs.appendChild(b); return b;
      }
      const firstId = tabsDef[0]?.[0] || 'info';
      let active = firstId;
      tabsDef.forEach(([id, label]) => {
        const b = addTabButton(id, label);
        if (id === active) b.classList.add('active');
      });

      function drawPanels() {
        panels.innerHTML = '';
        if (active === 'info') {
          const panel = document.createElement('div'); panel.className = 'tab-panel';
          panel.appendChild(infoPanel); panel.appendChild(symBlock); panels.appendChild(panel); return;
        }
        const def = tabsDef.find(t => t[0] === active);
        const items = def ? def[2] : [];
        const panel = document.createElement('div'); panel.className = 'tab-panel';
        if (!items || !items.length) {
          const empty = document.createElement('div'); empty.className = 'muted'; empty.textContent = 'Not provided in this dataset.';
          panel.appendChild(empty);
        } else {
          const ul = document.createElement('ul'); ul.className = 'list';
          items.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
          panel.appendChild(ul);
        }
        panels.appendChild(panel);
      }
      drawPanels();

      // Explain
      const showExplain = (explainToggle?.checked ?? true);
      if (showExplain) {
        const expl = document.createElement('div'); expl.className = 'explain';
        const d = cond.demographics; const demoBits = [];
        if (d?.gender) demoBits.push(`gender: ${d.gender}`);
        if (typeof d?.minAge === 'number') demoBits.push(`minAge: ${d.minAge}`);
        if (typeof d?.maxAge === 'number') demoBits.push(`maxAge: ${d.maxAge}`);
        expl.innerHTML = '<strong>Why it ranked here:</strong> Prior (risk) + symptom matches'
          + (demoBits.length ? ` • ${demoBits.join(' • ')}` : '')
          + '. This is a simple rules/weights demo — not a medical diagnosis.';
        wrap.append(head, flagsRow, tabs, panels, expl);
      } else {
        wrap.append(head, flagsRow, tabs, panels);
      }

      resultsEl.appendChild(wrap);
    });
  }

  // ---------- Compute ----------
  function tokenizeInput() {
    return String(freeText?.value || '').toLowerCase().split(/[^a-zA-Z\u00C0-\u024F0-9]+/).filter(Boolean);
  }
  function scoreCondition({ age, gender, symptomsSet, explicitNegatives }) {
    const ranked = KB.map(cond => {
      const d = cond.demographics;
      if (d) {
        if (typeof d.minAge === 'number' && age < d.minAge)
          return { id: cond.id, name: cond.name, score: 0, ref: cond };
        if (typeof d.maxAge === 'number' && age > d.maxAge)
          return { id: cond.id, name: cond.name, score: 0, ref: cond };
        if (d.gender && gender && d.gender !== gender)
          return { id: cond.id, name: cond.name, score: 0, ref: cond };
      }

      // 👇 FORCE SCORE TO ZERO
      return {
        id: cond.id,
        name: cond.name,
        score: 0.0,
        ref: cond
      };
    });

    return ranked.slice(0, 6);
  }


  // ---------- Events ----------
  ageEl?.addEventListener('input', e => { state.age = parseInt(e.target.value || '0', 10); if (ageOut) ageOut.textContent = state.age; computeAndRender(); });
  if (ageOut) ageOut.textContent = state.age;

  sexChips?.addEventListener('click', e => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    state.sex = btn.getAttribute('data-sex');
    [...sexChips.querySelectorAll('.chip')].forEach(c => c.classList.remove('active'));
    btn.classList.add('active'); computeAndRender();
  });

  addCustomBtn?.addEventListener('click', () => {
    const val = normalizeSymptom(customSymptom.value);
    if (!val) return; if (!SYMPTOMS.includes(val)) SYMPTOMS.push(val);
    state.selectedSymptoms.add(val); customSymptom.value = ''; renderSymptomChips(); computeAndRender();
  });
  customSymptom?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustomBtn.click(); } });

  negInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault(); const val = normalizeSymptom(negInput.value); if (!val) return;
      state.negatives.add(val); negInput.value = ''; renderNegatives(); computeAndRender();
    }
  });

  freeText?.addEventListener('input', () => { state.freeText = freeText.value || ''; computeAndRender(); });
  explainToggle?.addEventListener('change', () => computeAndRender());
  symptomSearch?.addEventListener('input', e => { state.symptomQuery = normalizeSymptom(e.target.value); renderSymptomChips(); });

  clearAllBtn?.addEventListener('click', () => {
    state.selectedSymptoms.clear(); state.negatives.clear();
    if (customSymptom) customSymptom.value = ''; if (negInput) negInput.value = ''; if (freeText) freeText.value = '';
    state.freeText = ''; renderSymptomChips(); renderNegatives(); computeAndRender();
  });

  // ---------- Initial draws ----------
  renderSymptomChips(); renderNegatives(); computeAndRender();
}
