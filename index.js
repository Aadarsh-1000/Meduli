// ===================== Fetch diseases.json =====================
let PACK = { symptomVocabulary: [], conditions: [] };

fetch('diseases.json', { cache: 'no-store' })
    .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    })
    .then(json => {
        if (!json || typeof json !== 'object') throw new Error('Invalid JSON root');
        // Some packs put the data under keys; support both direct and nested forms.
        PACK = {
            symptomVocabulary: Array.isArray(json.symptomVocabulary) ? json.symptomVocabulary : (Array.isArray(json.symptoms) ? json.symptoms : []),
            conditions: Array.isArray(json.conditions) ? json.conditions : (Array.isArray(json.items) ? json.items : [])
        };
        initApp();
    })
    .catch(err => {
        console.error('Failed to load diseases.json', err);
        alert([
            'Could not load diseases.json.',
            'Make sure index.html and diseases.json are in the SAME folder.',
            'Serve the folder via a local server (e.g., python -m http.server 8000).',
            'Then open http://localhost:8000/ in your browser.'
        ].join('\n'));
    });

// ===================== App Boot (after PACK) ====================
function initApp() {
    // DOM Refs
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

    yearEl.textContent = new Date().getFullYear();

    // Normalize data
    const DEFAULT_SYMPTOMS = (Array.isArray(PACK.symptomVocabulary) && PACK.symptomVocabulary.length)
        ? PACK.symptomVocabulary.map(s => String(s).toLowerCase())
        : ['fever', 'cough', 'sore throat', 'runny nose', 'headache', 'myalgia', 'fatigue', 'shortness of breath', 'chest pain', 'abdominal pain', 'nausea', 'vomiting', 'diarrhoea', 'dysuria', 'frequency', 'rash', 'joint pain', 'anosmia', 'loss of taste', 'photophobia', 'rigors', 'night sweats', 'wheeze', 'flank pain', 'back pain', 'dizziness', 'syncope', 'hematuria', 'jaundice ', 'weight loss'];

    // Keep a separate array we can push customs into without mutating original reference unexpectedly
    const SYMPTOMS = Array.from(new Set(DEFAULT_SYMPTOMS));

    // Normalize KB to safe structure
    const KB = (Array.isArray(PACK.conditions) ? PACK.conditions : []).filter(Boolean).map((c, i) => {
        const id = c.id || c.name || c.text || ('cond_' + i);
        const name = c.name || c.text || ('Condition ' + (i + 1));
        const demographics = c.demographics || null;
        const ft = c.features || {};
        const present = ft.present || {};
        const absent = ft.absent || {};
        const pearls = Array.isArray(c.pearls) ? c.pearls : (c.pearls ? [String(c.pearls)] : []);
        const redFlags = Array.isArray(c.redFlags) ? c.redFlags : (c.redFlags ? [String(c.redFlags)] : []);
        const studyTreatment = Array.isArray(c.studyTreatment) ? c.studyTreatment : (c.studyTreatment ? [String(c.studyTreatment)] : []);
        const prevalenceWeight = (typeof c.prevalenceWeight === 'number') ? c.prevalenceWeight : 0.2;
        return { id: String(id), name: String(name), demographics, features: { present, absent }, pearls, redFlags, studyTreatment, prevalenceWeight };
    });

    // App state
    const state = {
        age: parseInt(ageEl.value || '22', 10),
        sex: 'female',
        selectedSymptoms: new Set(),
        negatives: new Set(),
        freeText: '',
        explain: true,
        symptomQuery: ''
    };

    // ---------- Utils ----------
    function tokenize(text) {
        return String(text).toLowerCase().split(/[^a-zA-Z\u00C0-\u024F0-9]+/).filter(Boolean);
    }
    function normalizeSymptom(s) { return String(s || '').trim().toLowerCase(); }

    function scoreCondition(input) {
        const { age, symptomsSet, explicitNegatives } = input;
        const ranked = KB.map(cond => {
            if (cond.demographics && typeof cond.demographics.minAge === 'number' && age < cond.demographics.minAge) {
                return { id: cond.id, name: cond.name, score: 0, ref: cond };
            }
            let score = cond.prevalenceWeight;
            const present = cond.features.present || {};
            const absent = cond.features.absent || {};

            for (const feat in present) {
                if (symptomsSet.has(feat)) score += Number(present[feat]) || 0;
            }
            for (const feat in absent) {
                if (!symptomsSet.has(feat) && explicitNegatives.has(feat)) {
                    score += (Number(absent[feat]) || 0) * 0.5;
                }
            }
            return { id: cond.id, name: cond.name, score, ref: cond };
        }).sort((a, b) => b.score - a.score).slice(0, 6);
        return ranked;
    }

    // ---------- Rendering ----------
    function renderSymptomChips() {
        const q = state.symptomQuery;
        symptomChips.innerHTML = '';
        const items = SYMPTOMS
            .filter(s => !q || s.includes(q))
            .sort((a, b) => a.localeCompare(b));
        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = 'No symptoms match your search.';
            symptomChips.appendChild(empty);
            return;
        }
        items.forEach(s => {
            const chip = document.createElement('button');
            chip.className = 'chip' + (state.selectedSymptoms.has(s) ? ' active' : '');
            chip.type = 'button';
            chip.textContent = s;
            chip.setAttribute('aria-pressed', state.selectedSymptoms.has(s) ? 'true' : 'false');
            chip.addEventListener('click', () => {
                if (state.selectedSymptoms.has(s)) state.selectedSymptoms.delete(s);
                else state.selectedSymptoms.add(s);
                renderSymptomChips();
                computeAndRender();
            });
            symptomChips.appendChild(chip);
        });
    }

    function renderNegatives() {
        negBadges.innerHTML = '';
        if (!state.negatives.size) return;
        state.negatives.forEach(n => {
            const b = document.createElement('span');
            b.className = 'badge';
            const x = document.createElement('button');
            x.textContent = '×';
            x.title = 'remove';
            x.addEventListener('click', () => { state.negatives.delete(n); renderNegatives(); computeAndRender(); });
            b.append(n, ' ', x);
            negBadges.appendChild(b);
        });
    }

    function renderResults(ranked) {
        resultsEl.innerHTML = '';
        if (!ranked || !ranked.length) {
            const div = document.createElement('div');
            div.className = 'muted';
            div.textContent = 'Start selecting symptoms to see differentials.';
            resultsEl.appendChild(div);
            return;
        }
        ranked.forEach((r, idx) => {
            const wrap = document.createElement('div');
            wrap.className = 'result-card';

            const head = document.createElement('div');
            head.className = 'result-head';
            const title = document.createElement('div');
            title.innerHTML = (idx === 0 ? '🧠 ' : 'ℹ️ ') + r.name;
            const score = document.createElement('div');
            score.className = 'pill';
            score.textContent = 'Score: ' + r.score.toFixed(2);
            head.append(title, score);

            const tabs = document.createElement('div');
            tabs.className = 'tabs';
            const panels = document.createElement('div');

            const cond = r.ref;
            const tabDefs = [
                ['tx', 'Study treatment', cond.studyTreatment],
                ['flags', 'Red flags', cond.redFlags],
                ['pearls', 'Pearls', cond.pearls]
            ];

            let active = 'tx';
            function drawPanels() {
                panels.innerHTML = '';
                const ul = document.createElement('ul');
                ul.className = 'list';
                const items = (active === 'tx') ? cond.studyTreatment : (active === 'flags') ? cond.redFlags : cond.pearls;
                (items || []).forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
                const panel = document.createElement('div'); panel.className = 'tab-panel'; panel.appendChild(ul); panels.appendChild(panel);
            }

            tabDefs.forEach(([id, label]) => {
                const b = document.createElement('button');
                b.className = 'tab-btn' + (id === active ? ' active' : '');
                b.textContent = label;
                b.addEventListener('click', () => {
                    active = id;
                    [...tabs.children].forEach(x => x.classList.remove('active'));
                    b.classList.add('active');
                    drawPanels();
                });
                tabs.appendChild(b);
            });
            drawPanels();

            if (state.explain) {
                const expl = document.createElement('div');
                expl.style.fontSize = '12px';
                expl.style.color = '#475569';
                expl.style.marginTop = '8px';
                expl.innerHTML = '<strong>Why it ranked here:</strong> Simple rule-weights matching your symptoms and explicit negatives. Not probabilistic; ignores comorbidities, exam, and tests.';
                wrap.append(head, tabs, panels, expl);
            } else {
                wrap.append(head, tabs, panels);
            }

            resultsEl.appendChild(wrap);
        });
    }

    // ---------- Compute ----------
    function computeAndRender() {
        const tokens = tokenize(state.freeText);
        const fromText = new Set(tokens.filter(t => SYMPTOMS.includes(t)));
        const symptomsSet = new Set([...state.selectedSymptoms, ...fromText]);
        const input = { age: state.age, gender: state.sex, symptomsSet, explicitNegatives: state.negatives };
        const ranked = scoreCondition(input);
        renderResults(ranked);
    }

    // ---------- Events ----------
    ageEl.addEventListener('input', e => {
        state.age = parseInt(e.target.value || '0', 10);
        ageOut.textContent = state.age;
        computeAndRender();
    });

    sexChips.addEventListener('click', e => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        state.sex = btn.getAttribute('data-sex');
        [...sexChips.querySelectorAll('.chip')].forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        computeAndRender();
    });

    addCustomBtn.addEventListener('click', () => {
        const val = normalizeSymptom(customSymptom.value);
        if (!val) return;
        if (!SYMPTOMS.includes(val)) SYMPTOMS.push(val);
        state.selectedSymptoms.add(val);
        customSymptom.value = '';
        renderSymptomChips();
        computeAndRender();
    });
    customSymptom.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addCustomBtn.click(); }
    });

    negInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = normalizeSymptom(negInput.value);
            if (!val) return;
            state.negatives.add(val);
            negInput.value = '';
            renderNegatives();
            computeAndRender();
        }
    });

    freeText.addEventListener('input', e => {
        state.freeText = e.target.value || '';
        computeAndRender();
    });

    explainToggle.addEventListener('change', e => {
        state.explain = !!e.target.checked;
        computeAndRender();
    });

    symptomSearch.addEventListener('input', e => {
        state.symptomQuery = normalizeSymptom(e.target.value);
        renderSymptomChips();
    });

    clearAllBtn.addEventListener('click', () => {
        state.selectedSymptoms.clear();
        state.negatives.clear();
        customSymptom.value = '';
        negInput.value = '';
        freeText.value = '';
        state.freeText = '';
        renderSymptomChips();
        renderNegatives();
        computeAndRender();
    });

    // ---------- Initial draws ----------
    ageOut.textContent = state.age;
    renderSymptomChips();
    renderNegatives();
    computeAndRender();
}
