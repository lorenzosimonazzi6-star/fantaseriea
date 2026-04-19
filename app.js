// ============================================================
// FANTAMONDIALE 2026 — app.js
// ============================================================

const NAZIONALI = [
  "Atalanta","Bologna","Cagliari","Como","Cremonese",
  "Fiorentina","Genoa","Inter","Juventus","Lazio",
  "Lecce","Milan","Napoli","Parma","Pisa",
  "Roma","Sassuolo","Torino","Udinese","Verona"
].sort();

// Le squadre vengono mostrate in ordine alfabetico nella pagina Giocatori

const RUOLI   = { P:"Portieri", D:"Difensori", C:"Centrocampisti", A:"Attaccanti" };

const SUPERADMIN_PWD_HASH="b056fab42da260419217a7de0a31d107bd6fd385d5b3a03f9f168e7ec90d0d05";
let superadminUnlocked=false;
let currentLegaId=null;
let currentLegaMeta=null;
let currentUser=null; // Firebase Auth user
const GIORNATE = {
  1:"G1",  2:"G2",  3:"G3",  4:"G4",  5:"G5",
  6:"G6",  7:"G7",  8:"G8",  9:"G9",  10:"G10",
  11:"G11",12:"G12",13:"G13",14:"G14",15:"G15",
  16:"G16",17:"G17",18:"G18",19:"G19",20:"G20",
  21:"G21",22:"G22",23:"G23",24:"G24",25:"G25",
  26:"G26",27:"G27",28:"G28",29:"G29",30:"G30",
  31:"G31",32:"G32",33:"G33",34:"G34",35:"G35",
  36:"G36",37:"G37",38:"G38"
};

// ── REGOLAMENTO BONUS/MALUS ──────────────────────────────────
// votoBase + bonus_calcolati - malus_calcolati = totale
const BONUS_GOL    = { P:5, D:5, C:4, A:3 };
const BONUS_ASSIST = { P:2, D:2, C:1.5, A:1 };
const BONUS_PI     = { P:2, D:0, C:0, A:0 };   // porta inviolata solo portiere
const BONUS_RIG_PAR = 3;                         // rigore parato (solo portiere)
const MALUS_AMM    = 0.5;
const MALUS_ESP    = 1;
const MALUS_AUT    = 2;
const MALUS_RIG    = 3;
const MALUS_GS     = 1;   // gol subito (portiere)

// Flags disponibili per ruolo: { key, label, cssClass, isBonus, perRole }
function getFlagsForRuolo(ruolo) {
  const flags = [];
  if (BONUS_GOL[ruolo] > 0)    flags.push({ key:"gol",    label:`⚽ Gol (+${BONUS_GOL[ruolo]})`,       cls:"gol",    bonus: BONUS_GOL[ruolo],    multi:true });
  if (BONUS_ASSIST[ruolo] > 0) flags.push({ key:"assist",  label:`🎯 Assist (+${BONUS_ASSIST[ruolo]})`, cls:"assist",  bonus: BONUS_ASSIST[ruolo],  multi:true });
  if (BONUS_PI[ruolo] > 0)     flags.push({ key:"pi",      label:`🧤 P.Inv (+${BONUS_PI[ruolo]})`,     cls:"pi",      bonus: BONUS_PI[ruolo],      multi:false });
  if (ruolo === "P")           flags.push({ key:"rigpar",  label:`🧤 Rig.Par (+${BONUS_RIG_PAR})`,      cls:"rigpar",  bonus: BONUS_RIG_PAR,         multi:true  });
  // malus uguali per tutti
  flags.push({ key:"amm",  label:`🟨 Amm (-${MALUS_AMM})`,  cls:"amm",  bonus:-MALUS_AMM,  multi:false });
  flags.push({ key:"esp",  label:`🟥 Esp (-${MALUS_ESP})`,  cls:"esp",  bonus:-MALUS_ESP,  multi:false });
  flags.push({ key:"aut",  label:`😬 Aut (-${MALUS_AUT})`,  cls:"aut",  bonus:-MALUS_AUT,  multi:true  });
  flags.push({ key:"rig",  label:`❌ Rig (-${MALUS_RIG})`,  cls:"rig",  bonus:-MALUS_RIG,  multi:false });
  if (ruolo === "P")
    flags.push({ key:"gs", label:`⬇ GS (-${MALUS_GS})`,    cls:"gs",   bonus:-MALUS_GS,   multi:true  });
  return flags;
}

// ── STATE ────────────────────────────────────────────────────
function defaultLegaState(){return{partecipanti:[],rose:{},giocatoriSquadra:{},sostituzioni:{},pwdHash:null,_updatedAt:0};}
function defaultGlobalState(){return{voti:{},giornataCorrente:"1",giocatoriSquadra:{},_updatedAt:0};}
function defaultState(){return defaultLegaState();}

// Garantisce che lo state abbia sempre tutti i campi necessari (es. dopo sync Firebase)
function sanitizeLegaState(s){
  if(!s)return defaultLegaState();
  if(!Array.isArray(s.partecipanti))s.partecipanti=[];
  if(!s.rose||typeof s.rose!="object")s.rose={};
  if(!s.giocatoriSquadra||typeof s.giocatoriSquadra!="object")s.giocatoriSquadra={};
  if(!s.sostituzioni||typeof s.sostituzioni!="object")s.sostituzioni={};
  if(!s.pwdHash)s.pwdHash=null;
  if(!s._updatedAt)s._updatedAt=0;
  return s;
}
function sanitizeGlobalState(s){
  if(!s)return defaultGlobalState();
  if(!s.voti||typeof s.voti!="object")s.voti={};
  if(!s.giornataCorrente)s.giornataCorrente="1";
  if(!s.giocatoriSquadra||typeof s.giocatoriSquadra!="object")s.giocatoriSquadra={};
  if(!s._updatedAt)s._updatedAt=0;
  return s;
}
function sanitizeState(s){return sanitizeLegaState(s);}

function loadLegaState(id){try{const r=localStorage.getItem("fsa_lega_"+id);if(r)return sanitizeLegaState(JSON.parse(r));}catch(e){}return defaultLegaState();}
function loadGlobalState(){try{const r=localStorage.getItem("fsa_global");if(r)return sanitizeGlobalState(JSON.parse(r));}catch(e){}return defaultGlobalState();}
function loadState(){return defaultLegaState();}

let state=defaultLegaState();
let globalState=loadGlobalState();
let votiUnlocked=false;
let adminUnlocked=false;
let sortBy="totale";

function saveState(){
  state._updatedAt=Date.now();
  if(currentLegaId){try{localStorage.setItem("fsa_lega_"+currentLegaId,JSON.stringify(state));}catch(e){}syncLegaToFirebase();}
}
function saveGlobalState(){
  globalState._updatedAt=Date.now();
  try{localStorage.setItem("fsa_global",JSON.stringify(globalState));}catch(e){}syncGlobalToFirebase();
}
function saveLocalOnly(){if(currentLegaId)try{localStorage.setItem("fsa_lega_"+currentLegaId,JSON.stringify(state));}catch(e){}}

// ── HASH ─────────────────────────────────────────────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}


// ── FIREBASE SYNC ────────────────────────────────────────────
function syncLegaToFirebase(){
  if(!window._fbReady||!window._db||!currentLegaId)return;
  try{window._set(window._ref(window._db,"leghe/"+currentLegaId+"/state"),state).catch(e=>console.warn("FB:",e));}catch(e){}
}
function syncGlobalToFirebase(){
  if(!window._fbReady||!window._db)return;
  try{window._set(window._ref(window._db,"global"),globalState).catch(e=>console.warn("FB:",e));}catch(e){}
}
function syncToFirebase(){syncLegaToFirebase();}

let fbGlobalListening=false;
function listenLega(legaId){
  if(!window._fbReady||!window._db)return;
  window._onVal(window._ref(window._db,"leghe/"+legaId+"/state"),(snap)=>{
    const d=snap.val();if(!d)return;
    if((d._updatedAt||0)<=(state._updatedAt||0))return;
    state=sanitizeLegaState(d);saveLocalOnly();renderPage(currentPage());
    showSyncBar("🔄 Lega aggiornata",2000);
  });
}
function listenGlobal(){
  if(!window._fbReady||!window._db||fbGlobalListening)return;
  fbGlobalListening=true;
  window._onVal(window._ref(window._db,"global"),(snap)=>{
    const d=snap.val();if(!d)return;
    if((d._updatedAt||0)<=(globalState._updatedAt||0))return;
    globalState=sanitizeGlobalState(d);
    localStorage.setItem("fsa_global",JSON.stringify(globalState));
    renderPage(currentPage());showSyncBar("🔄 Dati aggiornati",2000);
  });
}
function listenFirebase(){listenGlobal();if(currentLegaId)listenLega(currentLegaId);}


function saveLocalOnly() {
  try { localStorage.setItem("fantaseriea_v1", JSON.stringify(state)); } catch(e){}
}

let syncBarTimer;
function showSyncBar(msg, duration) {
  const bar = document.getElementById("syncBar");
  bar.textContent = msg;
  bar.style.display = "block";
  clearTimeout(syncBarTimer);
  if (duration) syncBarTimer = setTimeout(() => bar.style.display = "none", duration);
}

// ── TOAST ────────────────────────────────────────────────────
let toastTimer;
function toast(msg, err=false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (err?" error":"");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

// ── ROUTER ───────────────────────────────────────────────────
let _currentPage = "home";
function currentPage() { return _currentPage; }

function navigate(page){
  _currentPage=page;
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
  const el=document.getElementById("page-"+page);
  if(el)el.classList.add("active");
  document.querySelectorAll('[data-page="'+page+'"]').forEach(b=>b.classList.add("active"));
  const gC=globalState.giornataCorrente||"1";
  ["giornataSelectGiornata","selectGiornata"].forEach(id=>{const e=document.getElementById(id);if(e&&e.value!==gC)e.value=gC;});
  renderPage(page);
  const menu=document.getElementById("mobileMenu");if(menu)menu.classList.remove("open");
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => navigate(btn.dataset.page));
});
document.getElementById("hamburger")?.addEventListener("click", () => {
  document.getElementById("mobileMenu").classList.toggle("open");
});

function renderPage(p){

  if(p==="classifica")renderClassifica();
  if(p==="squadra")renderSquadraPage();
  if(p==="giocatori")renderGiocatoriPage();
  if(p==="giornata")renderGiornata();
  if(p==="voti")renderVotiPage();
  if(p==="admin")renderAdminPage();
  if(p==="superadmin")renderSuperadminPage();
}





// ── SCORING ──────────────────────────────────────────────────
function calcFlagsBonus(flags, ruolo) {
  if (!flags) return 0;
  let b = 0;
  b += (flags.gol    || 0) * BONUS_GOL[ruolo];
  b += (flags.assist || 0) * BONUS_ASSIST[ruolo];
  b += (flags.pi     || 0) * BONUS_PI[ruolo];
  b += (flags.rigpar || 0) * BONUS_RIG_PAR;
  if (flags.amm) b -= MALUS_AMM;
  if (flags.esp) b -= MALUS_ESP;
  b -= (flags.aut || 0) * MALUS_AUT;
  if (flags.rig) b -= MALUS_RIG;
  b -= (flags.gs  || 0) * MALUS_GS;
  return Math.round(b * 10) / 10;
}

function calcFlagsSeparati(flags, ruolo) {
  // Ritorna { bonus: +X, malus: -Y } separatamente
  if (!flags) return { bonus: 0, malus: 0 };
  let bonus = 0, malus = 0;
  bonus += (flags.gol    || 0) * BONUS_GOL[ruolo];
  bonus += (flags.assist || 0) * BONUS_ASSIST[ruolo];
  bonus += (flags.pi     || 0) * BONUS_PI[ruolo];
  bonus += (flags.rigpar || 0) * BONUS_RIG_PAR;
  if (flags.amm) malus += MALUS_AMM;
  if (flags.esp) malus += MALUS_ESP;
  malus += (flags.aut || 0) * MALUS_AUT;
  if (flags.rig) malus += MALUS_RIG;
  malus += (flags.gs  || 0) * MALUS_GS;
  return {
    bonus: Math.round(bonus * 10) / 10,
    malus: Math.round(malus * 10) / 10
  };
}

function calcVotoGiornata(sv_entry, ruolo, isCap) {
  // sv_entry = { v, sv, flags }
  if (!sv_entry) return null;
  if (sv_entry.sv) return 0;  // SV = 0
  const v   = parseFloat(sv_entry.v) || 0;
  const bns = calcFlagsBonus(sv_entry.flags || {}, ruolo);
  let tot = v + bns;
  if (isCap && ruolo !== "A" && v >= 7) tot += 2;
  return Math.round(tot * 10) / 10;
}

function calcolaTotGiocatore(nomeGioc, ruolo, nazione, partId, soloGiornata) {
  const votiNaz = globalState.voti[nazione] || {};
  let tot = 0;
  const gMap = soloGiornata
    ? (votiNaz[soloGiornata] ? {[soloGiornata]: votiNaz[soloGiornata]} : {})
    : votiNaz;
  const part = partId ? state.partecipanti.find(p => p.id === partId) : null;
  const isCap = !!(part && part.capitanoGiocatore === nomeGioc);
  for (const gVoti of Object.values(gMap)) {
    const entry = gVoti[nomeGioc];
    if (entry === undefined) continue;
    const v = calcVotoGiornata(entry, ruolo, isCap);
    if (v !== null) tot += v;
  }
  return Math.round(tot * 10) / 10;
}

function calcolaPuntiRosa(partId) {
  const rosa = state.rose[partId];
  if (!rosa) return 0;
  let tot = 0;
  for (const [ruolo, arr] of Object.entries(rosa)) {
    for (const g of arr) {
      tot += calcolaTotGiocatore(g.nome, ruolo, g.nazione, partId, null);
    }
  }
  return Math.round(tot * 10) / 10;
}

function calcolaPuntiGiornata(partId, gId) {
  const rosa = state.rose[partId];
  if (!rosa) return 0;
  let tot = 0;
  for (const [ruolo, arr] of Object.entries(rosa)) {
    for (const g of arr) {
      tot += calcolaTotGiocatore(g.nome, ruolo, g.nazione, partId, gId);
    }
  }
  return Math.round(tot * 10) / 10;
}

// giornata has pending (some players in rosa have no voto yet)
function hasPendingVoti(partId, gId) {
  const rosa = state.rose[partId];
  if (!rosa) return false;
  for (const [, arr] of Object.entries(rosa)) {
    for (const g of arr) {
      const entry = globalState.voti[g.nazione]?.[gId]?.[g.nome];
      if (!entry) return true;
    }
  }
  return false;
}

function countPendingVotiSquadra(naz, gId) {
  const players = getGiocatoriNazione(naz);
  let pending = 0;
  for (const g of players) {
    const entry = globalState.voti[naz]?.[gId]?.[g.nome];
    if (!entry) pending++;
  }
  return pending;
}

// ── CLASSIFICA ───────────────────────────────────────────────
function renderClassifica() {
  const tbody = document.getElementById("classificaTbody");
  const gId   = document.getElementById("giornataSelectGiornata")?.value || "1";
  renderGrafico();

  // Aggiorna nome lega dinamicamente
  const nomeLega = currentLegaMeta?.nome || null;
  const subtitle = document.getElementById("classificaSubtitle");
  const legaNome = document.getElementById("classificaLegaNome");
  if (nomeLega) {
    if (subtitle) subtitle.textContent = `Classifica della lega "${nomeLega}"`;
    if (legaNome) legaNome.textContent = nomeLega;
  } else {
    if (subtitle) subtitle.textContent = "Serie A 2025/26 – Aggiornamento live";
    if (legaNome) legaNome.textContent = "Serie A 2025/26 · 20 squadre · 38 giornate";
  }

  if (!Array.isArray(state.partecipanti) || !state.partecipanti.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="icon">🏆</div><p>Nessun partecipante. Aggiungili in Admin.</p></div></td></tr>`;
    return;
  }
  const rows = state.partecipanti.map(p => ({
    nome: p.nome, id: p.id,
    gPts: calcolaPuntiGiornata(p.id, gId),
    totPts: calcolaPuntiRosa(p.id),
    pending: hasPendingVoti(p.id, gId),
  }));

  if (sortBy === "giornata") rows.sort((a,b) => b.gPts - a.gPts);
  else rows.sort((a,b) => b.totPts - a.totPts);

  const medals = ["🥇","🥈","🥉"];
  tbody.innerHTML = rows.map((r,i) => {
    const pos = i+1;
    const pendingDot = r.pending ? `<span class="pending-dot" title="Voti mancanti"></span>` : "";
    return `<tr class="${pos<=3?`rank-${pos}`:""} classifica-row-clickable" data-partid="${r.id}" title="Clicca per vedere la rosa">
      <td><span class="rank-num">${pos<=3?medals[i]:pos}</span></td>
      <td><span class="partecipante-name">${r.nome}</span>${pendingDot}</td>
      <td><span class="punti-g">${r.gPts.toFixed(1)}</span></td>
      <td><span class="punti-tot">${r.totPts.toFixed(1)}</span></td>
    </tr>`;
  }).join("");
  // Click row → navigate to giornata and open accordion
  tbody.querySelectorAll(".classifica-row-clickable").forEach(tr => {
    tr.addEventListener("click", () => {
      const pid = tr.dataset.partid;
      navigate("giornata");
      setTimeout(() => {
        const el = document.getElementById("acc_" + pid);
        if (!el) return;
        el.scrollIntoView({ behavior:"smooth", block:"start" });
        const body = el.querySelector(".acc-body");
        if (body && body.style.display !== "block") toggleAcc(el);
      }, 120);
    });
  });
}

// Sortable headers
document.querySelectorAll(".sortable").forEach(th => {
  th.addEventListener("click", function() {
    sortBy = this.dataset.sort;
    document.querySelectorAll(".sortable").forEach(t => t.classList.remove("active-sort"));
    this.classList.add("active-sort");
    renderClassifica();
  });
});

// ── GIORNATA ─────────────────────────────────────────────────
function renderGiornata() { buildGiornata(); }

function buildGiornata() {
  const gId    = document.getElementById("giornataSelectGiornata").value;
  const search = document.getElementById("giornataSearch").value.trim().toLowerCase();
  let parts = state.partecipanti;
  if (search) parts = parts.filter(p => p.nome.toLowerCase().includes(search));

  if (!parts.length) {
    document.getElementById("giornataSummary").innerHTML = "";
    document.getElementById("giornataAccordion").innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>Nessun partecipante trovato.</p></div>`;
    return;
  }

  const scored = parts.map(p => ({ p, pts: calcolaPuntiGiornata(p.id, gId), pending: hasPendingVoti(p.id, gId) }))
                      .sort((a,b) => b.pts - a.pts);

  // Summary strip
  document.getElementById("giornataSummary").innerHTML = scored.map((item, i) => {
    return `<div class="summary-chip${i===0?" top":""}" data-scroll="${item.p.id}">
      ${item.pending?'<span class="chip-elim" title="Voti mancanti">⚠</span>':""}
      <span class="summary-chip-name">${item.p.nome}</span>
      <span class="summary-chip-pts">${item.pts.toFixed(1)}</span>
    </div>`;
  }).join("");
  document.querySelectorAll(".summary-chip[data-scroll]").forEach(chip => {
    chip.addEventListener("click", () => {
      const el = document.getElementById("acc_" + chip.dataset.scroll);
      if (!el) return;
      el.scrollIntoView({ behavior:"smooth", block:"start" });
      const body = el.querySelector(".acc-body");
      if (body.style.display !== "block") toggleAcc(el);
    });
  });

  const medals = ["🥇","🥈","🥉"];
  const rankColor = i => i===0?"var(--gold)":i===1?"var(--silver)":i===2?"var(--bronze)":"var(--text2)";

  function buildCard(item, i) {
    const p   = item.p;
    const rosa = state.rose[p.id];
    const cap  = p.capitanoGiocatore;
    let body = "";

    if (!rosa || !Object.values(rosa).some(a=>a.length)) {
      body = `<div style="padding:12px;color:var(--text2);font-size:12px;text-align:center">Rosa non caricata</div>`;
    } else {
      const trows = Object.keys(RUOLI).map(ruolo => {
        const arr = rosa[ruolo] || [];
        if (!arr.length) return "";
        const sep = `<tr><td colspan="5" style="padding:6px 12px;background:rgba(255,255,255,.02);font-size:11px;color:var(--text2)">
          <span class="ruolo-badge ruolo-${ruolo}" style="font-size:10px;padding:2px 6px">${ruolo}</span>
          <span style="margin-left:6px;font-weight:600">${RUOLI[ruolo]} · ${arr.length}</span></td></tr>`;
        const rows = arr.map(g => {
          const entry  = globalState.voti[g.nazione]?.[gId]?.[g.nome];
          const isCap  = cap === g.nome;
          const isSV   = entry?.sv;
          const v      = entry && !isSV ? parseFloat(entry.v)||0 : null;
          const { bonus, malus } = entry && !isSV ? calcFlagsSeparati(entry.flags||{}, ruolo) : { bonus:0, malus:0 };
          const capBonus = (isCap && ruolo!=="A" && v!==null && v>=7) ? 2 : 0;
          let totV = v !== null ? v + bonus - malus + capBonus : null;
          if (totV !== null) totV = Math.round(totV * 10) / 10;
          const negCls = totV!==null && totV<0 ? " tot-neg" : "";
          const pending = !entry;

          // Celle bonus e malus
          const bonusTot = bonus + capBonus;
          const bnsCell = bonusTot > 0
            ? `<span class="bns-num">+${bonusTot.toFixed(1)}</span>`
            : '<span class="voto-dash">–</span>';
          const mlsCell = malus > 0
            ? `<span class="mls-num">-${malus.toFixed(1)}</span>`
            : '<span class="voto-dash">–</span>';

          // Nome con capitano e badge bonus cap
          const capBadge = isCap
            ? (capBonus > 0
                ? '<span class="cap-star cap-active" title="Capitano attivo! +2">⭐+2</span>'
                : '<span class="cap-star" title="Capitano (voto < 7)">⭐</span>')
            : "";

          return `<tr${isSV?' class="sv"':""}>
            <td class="left" style="font-size:12px;padding:10px 12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${g.nome}${capBadge} <span style="font-size:10px;color:var(--text2);opacity:.8;margin-left:4px">${g.nazione}</span></td>
            <td style="font-size:12px;text-align:center">${isSV?'<span class="sv-text" style="font-size:11px">SV</span>':v!==null?`<span class="voto-num">${v.toFixed(1)}</span>`:pending?'<span style="color:var(--orange);font-size:11px;font-weight:700">?</span>':'<span class="voto-dash">–</span>'}</td>
            <td style="font-size:12px;text-align:center">${v!==null ? mlsCell : '<span class="voto-dash">–</span>'}</td>
            <td style="font-size:12px;text-align:center">${v!==null ? bnsCell : '<span class="voto-dash">–</span>'}</td>
            <td style="text-align:center;padding-right:12px">${totV!==null?`<span class="tot-num${negCls}" style="font-size:15px">${totV.toFixed(1)}</span>`:'<span class="voto-dash">–</span>'}</td>
          </tr>`;
        }).join("");
        return sep + rows;
      }).join("");

      body = `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
        <thead><tr>
          <th style="width:40%;padding:8px 12px;font-size:11px;color:var(--text2);text-align:left;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border)">Giocatore</th>
          <th style="width:15%;padding:8px 4px;font-size:11px;color:var(--text2);text-align:center;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border)">V</th>
          <th style="width:15%;padding:8px 4px;font-size:11px;color:var(--text2);text-align:center;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border)">Mls</th>
          <th style="width:15%;padding:8px 4px;font-size:11px;color:var(--text2);text-align:center;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border)">Bns</th>
          <th style="width:15%;padding:8px 12px 8px 4px;font-size:11px;color:var(--text2);text-align:center;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border)">Tot</th>
        </tr></thead>
        <tbody>${trows}</tbody>
      </table>`;
    }

    const pendingWarn = item.pending ? ` <span style="font-size:10px;color:var(--orange)">⚠</span>` : "";
    return `<div class="acc-item" id="acc_${p.id}" style="width:100%;box-sizing:border-box;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
      <div class="acc-header" style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;transition:background .15s;" data-id="${p.id}">
        <span style="font-family:'Outfit',sans-serif;font-size:18px;color:${rankColor(i)};flex-shrink:0">${i<3?medals[i]:i+1}</span>
        <span style="font-family:'Outfit',sans-serif;font-size:16px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nome}${pendingWarn}</span>
        <span style="font-family:'Outfit',sans-serif;font-size:20px;font-weight:700;color:var(--accent);flex-shrink:0">${item.pts.toFixed(1)}</span>
        <span class="acc-chevron" style="font-size:12px;color:var(--text2);flex-shrink:0;transition:transform .25s">▼</span>
      </div>
      <div class="acc-body" style="display:none;border-top:1px solid var(--border)">${body}</div>
    </div>`;
  }

  const cardsHtml = scored.map((item, i) => buildCard(item, i)).join("");
  document.getElementById("giornataAccordion").innerHTML =
    `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(360px, 1fr));gap:18px;width:100%;align-items:start;">${cardsHtml}</div>`;

  document.querySelectorAll(".acc-header").forEach(hdr => {
    hdr.addEventListener("click", () => {
      hdr.style.background = "";
      toggleAcc(hdr.closest(".acc-item"));
    });
    hdr.addEventListener("mouseenter", () => hdr.style.background = "var(--bg3)");
    hdr.addEventListener("mouseleave", () => hdr.style.background = "");
  });
}

function toggleAcc(item) {
  const body    = item.querySelector(".acc-body");
  const chevron = item.querySelector(".acc-chevron");
  const isOpen  = body.style.display === "block";
  body.style.display      = isOpen ? "none" : "block";
  chevron.style.transform = isOpen ? "" : "rotate(180deg)";
  item.style.borderColor  = isOpen ? "var(--border)" : "rgba(232,255,58,.25)";
}

document.getElementById("giornataSelectGiornata")?.addEventListener("change", () => { buildGiornata(); renderClassifica(); });
document.getElementById("giornataSearch")?.addEventListener("input", buildGiornata);
document.getElementById("btnExpandAll")?.addEventListener("click", () => {
  document.querySelectorAll(".acc-body").forEach(b => b.style.display = "block");
  document.querySelectorAll(".acc-chevron").forEach(c => c.style.transform = "rotate(180deg)");
  document.querySelectorAll(".acc-item").forEach(i => i.style.borderColor = "rgba(212,245,60,.25)");
});
document.getElementById("btnCollapseAll")?.addEventListener("click", () => {
  document.querySelectorAll(".acc-body").forEach(b => b.style.display = "none");
  document.querySelectorAll(".acc-chevron").forEach(c => c.style.transform = "");
  document.querySelectorAll(".acc-item").forEach(i => i.style.borderColor = "var(--border)");
});

// ── VOTI PAGE ────────────────────────────────────────────────
function renderVotiPage() {
  const adminCtrl = document.getElementById("votiAdminControls");
  const loginCtrl = document.getElementById("votiLoginControls");
  const btnSalva  = document.getElementById("btnSalvaVoti");
  if (votiUnlocked) {
    adminCtrl.style.display = "flex";
    loginCtrl.style.display = "none";
    btnSalva.style.display  = "inline-block";
  } else {
    adminCtrl.style.display = "none";
    // Show login only as a small link, not a blocker
    loginCtrl.style.display = "flex";
    btnSalva.style.display  = "none";
  }
  renderVoti();
}

document.getElementById("btnUnlock")?.addEventListener("click", unlockVoti);
document.getElementById("pwdInput")?.addEventListener("keydown", e => { if(e.key==="Enter") unlockVoti(); });
async function unlockVoti(){
  const val=document.getElementById("pwdInput").value;
  const hash=await sha256(val);
  if(hash===SUPERADMIN_PWD_HASH){superadminUnlocked=true;navigate("superadmin");return;}
  if(hash===state.pwdHash){votiUnlocked=true;renderVotiPage();}
  else{document.getElementById("pwdError").textContent="❌ Password errata";document.getElementById("pwdInput").value="";}
}
document.getElementById("btnLogout")?.addEventListener("click", () => { votiUnlocked=false; renderVotiPage(); toast("Sessione terminata."); });

// ── VOTI SQUADRE ─────────────────────────────────────────────
function renderVoti() {
  const sel = document.getElementById("selectSquadra");
  if (sel.options.length <= 1) {
    let opts = '<option value="">– Seleziona –</option>';
    for (const n of NAZIONALI) opts += `<option value="${n}">${n}</option>`;
    sel.innerHTML = opts;
  }
  renderVotiTable();
}

document.getElementById("selectSquadra")?.addEventListener("change", renderVotiTable);
document.getElementById("selectGiornata")?.addEventListener("change", renderVotiTable);

function getGiocatoriNazione(naz) {
  const giocSet = new Map();
  for (const rosa of Object.values(state.rose)) {
    for (const [ruolo, arr] of Object.entries(rosa)) {
      for (const g of arr) {
        if (g.nazione === naz && !giocSet.has(g.nome)) giocSet.set(g.nome, { nome:g.nome, ruolo });
      }
    }
  }
  for (const g of (state.giocatoriSquadra[naz]||[])) {
    if (!giocSet.has(g.nome)) giocSet.set(g.nome, { nome:g.nome, ruolo:g.ruolo });
  }
  return Array.from(giocSet.values()).sort((a,b) => {
    const ord=["P","D","C","A"];
    return ord.indexOf(a.ruolo)-ord.indexOf(b.ruolo)||a.nome.localeCompare(b.nome);
  });
}

function renderVotiTable() {
  const naz  = document.getElementById("selectSquadra").value;
  const gId  = document.getElementById("selectGiornata").value;
  const wrap = document.getElementById("votiTable");
  const banner = document.getElementById("votiBanner");

  if (!naz) { wrap.innerHTML=`<div class="empty-state"><div class="icon">📋</div><p>Seleziona una squadra.</p></div>`; banner.style.display="none"; return; }

  const giocatori = getGiocatoriNazione(naz);
  const isEdit    = votiUnlocked;
  const savedVoti = (globalState.voti[naz]||{})[gId]||{};

  // pending banner
  const pending = countPendingVotiSquadra(naz, gId);
  if (pending > 0) {
    banner.className = "voti-banner warn";
    banner.textContent = `⚠ ${pending} giocator${pending===1?"e":"i"} senza voto in questa giornata`;
    banner.style.display = "block";
  } else if (giocatori.length > 0) {
    banner.className = "voti-banner ok";
    banner.textContent = `✅ Tutti i voti inseriti per questa giornata`;
    banner.style.display = "block";
  } else {
    banner.style.display = "none";
  }

  const rows = giocatori.map(g => {
    const entry = savedVoti[g.nome] || {};
    const isSV  = !!entry.sv;
    const v     = entry.v !== undefined ? entry.v : "";
    const flags = entry.flags || {};
    const bnsCalc = calcFlagsBonus(flags, g.ruolo);
    const vNum    = parseFloat(v)||0;
    const tot     = isSV ? 0 : vNum + bnsCalc;
    const totCls  = tot < 0 ? " totale-voto-neg" : "";

    // Build flag buttons
    const flagDefs = getFlagsForRuolo(g.ruolo);
    let flagsHtml = "";
    if (isEdit) {
      flagsHtml = flagDefs.map(f => {
        const val = flags[f.key];
        if (f.multi) {
          const count = val || 0;
          const isActive = count > 0;
          // Show explicit counter with - / count / + buttons for multi flags
          return `<span class="flag-multi-wrap ${f.cls}${isActive?" active":""}" data-flag="${f.key}" data-nome="${g.nome}">
            <button class="flag-multi-dec" data-flag="${f.key}" data-nome="${g.nome}" title="Rimuovi ${f.label}" ${count===0?"disabled":""}>−</button>
            <span class="flag-multi-label" title="${f.label}">${f.label.split(' ')[0]} <span class="flag-multi-count">${count}</span></span>
            <button class="flag-multi-inc" data-flag="${f.key}" data-nome="${g.nome}" title="Aggiungi ${f.label}">+</button>
          </span>`;
        } else {
          const isActive = !!val;
          return `<button class="flag-btn ${f.cls}${isActive?" active":""}" data-flag="${f.key}" data-multi="false" data-nome="${g.nome}" title="${f.label}">
            ${f.label}
          </button>`;
        }
      }).join("");
    } else {
      // read-only: show active flags only
      flagsHtml = flagDefs.filter(f => {
        const val = flags[f.key];
        return f.multi ? (val||0)>0 : !!val;
      }).map(f => {
        const val = f.multi ? (flags[f.key]||0) : null;
        if (f.multi) {
          return `<span class="flag-multi-wrap ${f.cls} active" style="cursor:default;pointer-events:none">
            <span class="flag-multi-label">${f.label.split(' ')[0]} <span class="flag-multi-count">${val}</span></span>
          </span>`;
        }
        return `<span class="flag-btn ${f.cls} active" style="cursor:default">${f.label}</span>`;
      }).join("");
    }

    const vInput = isEdit
      ? `<input type="number" class="inp-v" data-nome="${g.nome}" value="${v}" step="0.5" min="0" max="10" placeholder="–" ${isSV?"disabled style='opacity:.4'":""}>`
      : `<span style="font-weight:600">${isSV?"<em style='color:var(--text2)'>SV</em>":v!==""?parseFloat(v).toFixed(1):"–"}</span>`;

    const svBtn = isEdit
      ? `<button class="sv-btn${isSV?" active":""}" data-nome="${g.nome}" title="Senza Voto">SV</button>`
      : "";

    return `<tr data-nome="${g.nome}" data-ruolo="${g.ruolo}"${isSV?' class="sv-row"':""}>
      <td><span class="ruolo-badge ruolo-${g.ruolo}">${g.ruolo}</span></td>
      <td style="font-weight:600;font-size:14px">${g.nome}</td>
      <td class="center">${vInput}${svBtn}</td>
      <td><div class="flags-wrap">${flagsHtml}</div></td>
      <td class="center"><span class="totale-voto-cell${totCls}" id="vtot_${safeId(g.nome)}">${isSV?"SV":v!==""?tot.toFixed(1):"–"}</span></td>
      ${isEdit?`<td class="center" style="display:flex;gap:4px;justify-content:center;align-items:center"><button class="btn-icon" data-delvoto="${g.nome}" title="Elimina voto" style="color:var(--orange)">✕</button><button class="btn-icon" data-rm="${g.nome}" title="Rimuovi giocatore">🗑</button></td>`:"<td></td>"}
    </tr>`;
  }).join("");

  wrap.innerHTML = `
    <table class="voti-table">
      <thead><tr>
        <th>R.</th><th>Giocatore</th>
        <th class="center">Voto</th>
        <th>Bonus / Malus</th>
        <th class="center">Totale</th>
        <th></th>
      </tr></thead>
      <tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text2)">Nessun giocatore. Aggiungine uno.</td></tr>'}</tbody>
    </table>
`;

  if (!isEdit) return;

  // voto input live update
  wrap.querySelectorAll(".inp-v").forEach(inp => {
    inp.addEventListener("input", () => updateTotCell(inp.closest("tr")));
  });

  // SV toggle
  wrap.querySelectorAll(".sv-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      const row   = this.closest("tr");
      const nome  = this.dataset.nome;
      const isSV  = this.classList.toggle("active");
      const inp   = row.querySelector(".inp-v");
      if (inp) inp.disabled = isSV;
      if (inp) inp.style.opacity = isSV ? ".4" : "";
      // store immediately in temp state
      if (!globalState.voti[naz]) globalState.voti[naz]={};
      if (!globalState.voti[naz][gId]) globalState.voti[naz][gId]={};
      if (!globalState.voti[naz][gId][nome]) globalState.voti[naz][gId][nome]={};
      globalState.voti[naz][gId][nome].sv = isSV;
      updateTotCell(row);
    });
  });

  // Single-toggle flag buttons (non-multi)
  wrap.querySelectorAll(".flag-btn[data-flag]").forEach(btn => {
    btn.addEventListener("click", function() {
      const nome  = this.dataset.nome;
      const fkey  = this.dataset.flag;
      if (!globalState.voti[naz]) globalState.voti[naz]={};
      if (!globalState.voti[naz][gId]) globalState.voti[naz][gId]={};
      if (!globalState.voti[naz][gId][nome]) globalState.voti[naz][gId][nome]={};
      if (!globalState.voti[naz][gId][nome].flags) globalState.voti[naz][gId][nome].flags={};
      const cur = globalState.voti[naz][gId][nome].flags;
      const isOn = this.classList.toggle("active");
      cur[fkey] = isOn;
      updateTotCell(this.closest("tr"));
    });
  });

  // Multi-flag increment (+) buttons
  wrap.querySelectorAll(".flag-multi-inc").forEach(btn => {
    btn.addEventListener("click", function() {
      const nome = this.dataset.nome;
      const fkey = this.dataset.flag;
      if (!globalState.voti[naz]) globalState.voti[naz]={};
      if (!globalState.voti[naz][gId]) globalState.voti[naz][gId]={};
      if (!globalState.voti[naz][gId][nome]) globalState.voti[naz][gId][nome]={};
      if (!globalState.voti[naz][gId][nome].flags) globalState.voti[naz][gId][nome].flags={};
      const cur = globalState.voti[naz][gId][nome].flags;
      cur[fkey] = (cur[fkey]||0) + 1;
      // Update UI
      const wrap2 = this.closest(".flag-multi-wrap");
      wrap2.classList.add("active");
      wrap2.querySelector(".flag-multi-count").textContent = cur[fkey];
      const decBtn = wrap2.querySelector(".flag-multi-dec");
      if (decBtn) decBtn.disabled = false;
      updateTotCell(this.closest("tr"));
    });
  });

  // Multi-flag decrement (-) buttons
  wrap.querySelectorAll(".flag-multi-dec").forEach(btn => {
    btn.addEventListener("click", function() {
      const nome = this.dataset.nome;
      const fkey = this.dataset.flag;
      const cur  = globalState.voti[naz]?.[gId]?.[nome]?.flags;
      if (!cur) return;
      cur[fkey] = Math.max(0, (cur[fkey]||0) - 1);
      const wrap2 = this.closest(".flag-multi-wrap");
      wrap2.querySelector(".flag-multi-count").textContent = cur[fkey];
      if (cur[fkey] === 0) { wrap2.classList.remove("active"); this.disabled = true; }
      updateTotCell(this.closest("tr"));
    });
  });

  function updateTotCell(row) {
    const nome  = row.dataset.nome;
    const ruolo = row.dataset.ruolo;
    const inp   = row.querySelector(".inp-v");
    const svBtn = row.querySelector(".sv-btn");
    const isSV  = svBtn?.classList.contains("active");
    const el    = document.getElementById("vtot_"+safeId(nome));
    if (!el) return;
    if (isSV) { el.textContent="SV"; el.className="totale-voto-cell"; return; }
    const v = parseFloat(inp?.value)||0;
    const flags = globalState.voti[naz]?.[gId]?.[nome]?.flags || {};
    const bns = calcFlagsBonus(flags, ruolo);
    const tot = v + bns;
    el.textContent = inp?.value!=="" ? tot.toFixed(1) : "–";
    el.className = "totale-voto-cell" + (tot<0?" totale-voto-neg":"");
  }

  // Delete voto (keeps player, clears score+flags)
  wrap.querySelectorAll("[data-delvoto]").forEach(btn => {
    btn.addEventListener("click", function() {
      const nome = this.dataset.delvoto;
      if (!confirm(`Eliminare il voto di ${nome}?`)) return;
      if (globalState.voti[naz]?.[gId]?.[nome]) delete globalState.voti[naz][gId][nome];
      saveState();
      toast(`Voto di ${nome} eliminato.`);
      renderVotiTable();
    });
  });

  // Remove player
  wrap.querySelectorAll("[data-rm]").forEach(btn => {
    btn.addEventListener("click", function() {
      const nome=this.dataset.rm;
      if (!confirm(`Rimuovere ${nome}?`)) return;
      if (state.giocatoriSquadra[naz]) state.giocatoriSquadra[naz]=state.giocatoriSquadra[naz].filter(g=>g.nome!==nome);
      if (globalState.voti[naz]?.[gId]?.[nome]) delete globalState.voti[naz][gId][nome];
      saveState(); renderVotiTable();
    });
  });


}

document.getElementById("btnSalvaVoti")?.addEventListener("click", () => {
  const naz = document.getElementById("selectSquadra").value;
  const gId = document.getElementById("selectGiornata").value;
  if (!naz) { toast("Seleziona una squadra!", true); return; }
  if (!globalState.voti[naz]) globalState.voti[naz]={};
  if (!globalState.voti[naz][gId]) globalState.voti[naz][gId]={};

  document.querySelectorAll("#votiTable tbody tr[data-nome]").forEach(row => {
    const nome  = row.dataset.nome;
    const ruolo = row.dataset.ruolo;
    const inp   = row.querySelector(".inp-v");
    const svBtn = row.querySelector(".sv-btn");
    const isSV  = svBtn?.classList.contains("active");
    const v     = parseFloat(inp?.value);
    const cur   = globalState.voti[naz][gId][nome] || {};
    if (isSV) {
      globalState.voti[naz][gId][nome] = { sv:true, flags: cur.flags||{} };
    } else if (!isNaN(v)) {
      globalState.voti[naz][gId][nome] = { v, sv:false, flags: cur.flags||{} };
    }
  });
  saveGlobalState();
  toast(`✓ Voti salvati – ${naz}, ${GIORNATE[gId]}`);
  renderVotiTable();
});

// ── ADMIN PAGE ────────────────────────────────────────────────
function renderAdminPage() {
  const locked  = document.getElementById("adminLocked");
  const content = document.getElementById("adminContent");
  // Auto-sblocco per il creatore della lega
  if (!adminUnlocked && isCreatoreCorrente()) {
    adminUnlocked = true;
    ["adminLockIcon","adminLockIconMobile"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="🔓";});
  }
  if (adminUnlocked) {
    locked.style.display  = "none";
    content.style.display = "block";
    renderAdmin();
  } else {
    locked.style.display  = "flex";
    content.style.display = "none";
    const errEl = document.getElementById("adminPwdError");
    if (errEl) errEl.textContent = "";
  }
}
document.getElementById("btnAdminLogout")?.addEventListener("click", () => {
  adminUnlocked=false;
  ["adminLockIcon","adminLockIconMobile"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="🔒";});
  renderAdminPage();
  toast("Sessione admin terminata.");
});

function renderAdmin(){
  const banner=document.getElementById("legaInfoBanner");
  if(banner&&currentLegaId){
    const link=`${location.origin}${location.pathname}?lega=${currentLegaId}`;
    const nome=currentLegaMeta?.nome||currentLegaId;
    banner.innerHTML=`<span>🏆 <strong>${nome}</strong> · <strong>${currentLegaId}</strong></span>
      <button class="btn-sec" style="font-size:11px;padding:3px 9px;margin-left:8px"
        onclick="navigator.clipboard.writeText('${link}').then(()=>toast('Link copiato!'))">📋 Link</button>`;
    banner.style.display="flex";
  }
  renderPartecipantiList();
  renderCapitanoForm();
  renderSostituzioni();
  populateSel("selectPartecipanteImport",state.partecipanti,"nome","id","– Seleziona –","");
  renderRoseStatus();
}

function renderGiornataCorrenteAdmin() {
  const sel = document.getElementById("adminGiornataCorrente");
  if (!sel) return;
  sel.value = globalState.giornataCorrente || "1";
}

function resetPartecipantiERose() {
  if (!confirm("⚠️ Sei sicuro? Verranno eliminati TUTTI i partecipanti, le rose e i giocatori nel tab Voti. I voti inseriti rimarranno.")) return;
  state.partecipanti = [];
  state.rose = {};
  state.sostituzioni = {};
  state.giocatoriSquadra = {};
  saveState();
  renderAdmin();
  toast("Partecipanti, rose e giocatori eliminati.");
}

async function eliminaLega() {
  const nome = currentLegaMeta?.nome || currentLegaId;
  if (!confirm(`⚠️ Stai per eliminare la lega "${nome}" (${currentLegaId}).\n\nQuesta azione è IRREVERSIBILE: tutti i dati verranno persi.\n\nConfermi?`)) return;
  if (!confirm(`Ultima conferma: eliminare definitivamente la lega "${nome}"?`)) return;
  try {
    // Elimina lega da Firebase
    await window._set(window._ref(window._db, "leghe/" + currentLegaId), null);
    // Rimuovi da users se loggato
    if (currentUser) {
      await window._set(window._ref(window._db, "users/" + currentUser.uid + "/leghe/" + currentLegaId), null);
    }
    toast("Lega eliminata.");
    exitLega();
  } catch(e) {
    toast("Errore durante l'eliminazione: " + e.message, true);
  }
}

document.addEventListener("click", e => {
  if (e.target && e.target.id === "btnResetPartecipanti") resetPartecipantiERose();
  if (e.target && e.target.id === "btnEliminaLega") eliminaLega();
});

function renderRoseStatus() {
  const tot    = state.partecipanti.length;
  const loaded = state.partecipanti.filter(p => state.rose[p.id] && Object.values(state.rose[p.id]).some(a=>a.length)).length;
  const pct    = tot ? Math.round(loaded/tot*100) : 0;
  const div    = document.getElementById("adminRoseStatus");
  div.innerHTML = `<span>Rose caricate:</span><span class="rs-count">${loaded}/${tot}</span>
    <div class="rose-progress"><div class="rose-progress-inner" style="width:${pct}%"></div></div>
    <span style="font-size:11px;color:var(--text2)">${pct}%</span>`;
}

function renderFbStatus(){}

function renderPartecipantiList() {
  const list = document.getElementById("partecipantiList");
  // update counter badge in card title
  const counter = document.getElementById("partecipantiCounter");
  if (counter) counter.textContent = state.partecipanti.length ? `(${state.partecipanti.length})` : "";
  if (!Array.isArray(state.partecipanti) || !state.partecipanti.length) { list.innerHTML=`<p class="hint">Nessun partecipante ancora.</p>`; return; }
  list.innerHTML = state.partecipanti.map(p => {
    const hasRosa = state.rose[p.id] && Object.values(state.rose[p.id]).some(a=>a.length);
    return `<div class="partecipante-item">
      <span>${p.nome}</span>
      <div class="part-item-actions">
        <span class="${hasRosa?"rosa-loaded":"rosa-missing"}">${hasRosa?"✓ Rosa caricata":"✗ Rosa mancante"}</span>
        <button class="btn-del" data-id="${p.id}">✕</button>
      </div>
    </div>`;
  }).join("");
  list.querySelectorAll(".btn-del").forEach(btn => {
    btn.addEventListener("click", function() {
      const nome=state.partecipanti.find(p=>p.id===this.dataset.id)?.nome;
      if (!confirm(`Rimuovere ${nome}?`)) return;
      state.partecipanti=state.partecipanti.filter(p=>p.id!==this.dataset.id);
      delete state.rose[this.dataset.id];
      saveState(); renderAdmin(); toast("Partecipante rimosso.");
    });
  });
}

function addPartecipante() {
  const inp = document.getElementById("newPartecipanteNome");
  if (!inp) return;
  const nome = inp.value.trim();
  if (!nome) { toast("Inserisci un nome!", true); inp.focus(); return; }
  if (!Array.isArray(state.partecipanti)) state.partecipanti = [];
  if (state.partecipanti.find(p=>p.nome.toLowerCase()===nome.toLowerCase())) { toast(`"${nome}" è già presente!`, true); return; }
  const id = Date.now().toString();
  state.partecipanti.push({id, nome, capitanoGiocatore:null});
  inp.value="";
  inp.focus();
  saveState();
  renderAdmin();
  toast(`✓ ${nome} aggiunto!`);
}

// Use event delegation so it works regardless of when DOM is ready
document.addEventListener("click", e => {
  if (e.target && e.target.id === "btnAddPartecipante") addPartecipante();
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target && e.target.id === "newPartecipanteNome") addPartecipante();
});



function renderCapitanoForm() {
  const div=document.getElementById("capitanoForm");
  if (!Array.isArray(state.partecipanti) || !state.partecipanti.length) { div.innerHTML=`<p class="hint">Nessun partecipante.</p>`; return; }
  div.innerHTML=state.partecipanti.map(p=>{
    const rosa=state.rose[p.id];
    const nonAtt=rosa?Object.entries(rosa).flatMap(([r,arr])=>r!=="A"?arr.map(g=>({...g,ruolo:r})):[]): [];
    const opts=nonAtt.length
      ?nonAtt.map(g=>`<option value="${g.nome}" ${p.capitanoGiocatore===g.nome?"selected":""}>${g.nome} (${g.ruolo}) – ${g.nazione}</option>`).join("")
      :"<option value=''>Carica prima la rosa</option>";
    return `<div class="capitano-row">
      <span>${p.nome}</span>
      <select data-pid="${p.id}" class="sel-cap"><option value="">– Nessuno –</option>${opts}</select>
    </div>`;
  }).join("");
  div.querySelectorAll(".sel-cap").forEach(sel=>{
    sel.addEventListener("change",function(){
      const part=state.partecipanti.find(p=>p.id===this.dataset.pid);
      if(part){part.capitanoGiocatore=this.value||null;saveState();toast("Capitano salvato!");}
    });
  });
}



// ── BACKUP JSON ───────────────────────────────────────────────
document.getElementById("btnExportJSON")?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `fantaseriea_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast("Backup esportato!");
});

document.getElementById("btnImportJSON")?.addEventListener("click", () => {
  document.getElementById("importJSONInput").click();
});
document.getElementById("importJSONInput")?.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.partecipanti) throw new Error("Formato non valido");
      if (!confirm(`Importare i dati? Sovrascriverà i dati attuali.`)) return;
      state = data;
      saveState();
      renderAdmin();
      toast("Dati importati con successo!");
    } catch(err) {
      toast("Errore: file JSON non valido.", true);
    }
  };
  reader.readAsText(file);
  e.target.value="";
});

// Manual Firebase sync
document.getElementById("btnSyncNow")?.addEventListener("click", () => {
  const res = document.getElementById("syncResult");
  if (!window._fbReady) {
    res.style.color="var(--red)"; res.textContent="Firebase non configurato. Modifica index.html.";
    return;
  }
  syncToFirebase();
  res.style.color="var(--green)"; res.textContent="✓ Sync avviato!";
  setTimeout(()=>res.textContent="",3000);
});

// ── FILE UPLOAD ───────────────────────────────────────────────
const uploadBox=document.getElementById("uploadBox");
const rosaFileInput=document.getElementById("rosaFileInput");
uploadBox.addEventListener("click",()=>rosaFileInput.click());
uploadBox.addEventListener("dragover",e=>{e.preventDefault();uploadBox.classList.add("dragover");});
uploadBox.addEventListener("dragleave",()=>uploadBox.classList.remove("dragover"));
uploadBox.addEventListener("drop",e=>{e.preventDefault();uploadBox.classList.remove("dragover");if(e.dataTransfer.files[0])processRosaFile(e.dataTransfer.files[0]);});
rosaFileInput.addEventListener("change",e=>{if(e.target.files[0])processRosaFile(e.target.files[0]);e.target.value="";});

function processRosaFile(file) {
  const partId=document.getElementById("selectPartecipanteImport").value;
  const res=document.getElementById("importResult");
  if (!partId) { res.style.color="var(--red)"; res.textContent="Seleziona prima un partecipante!"; return; }
  const ext=file.name.split(".").pop().toLowerCase();
  if (ext==="csv") {
    const reader=new FileReader();
    reader.onload=e=>{
      const rosa=parseCSVRosa(e.target.result);
      if (rosa) {
        state.rose[partId]=rosa; syncGiocatori(); saveState();
        const counts=Object.entries(rosa).map(([r,a])=>`${r}:${a.length}`).join(" ");
        res.style.color="var(--green)"; res.textContent=`✓ Rosa importata! (${counts})`;
        renderCapitanoForm(); renderRoseStatus(); toast("Rosa caricata!");
      } else { res.style.color="var(--red)"; res.textContent="Formato non riconosciuto."; }
    };
    reader.readAsText(file);
  } else {
    res.style.color="var(--accent2)"; res.textContent="Per Excel: salva come CSV poi ricarica.";
  }
}

function parseCSVRosa(csv) {
  const lines=csv.trim().split("\n").map(l=>l.trim()).filter(Boolean);
  const rosa={P:[],D:[],C:[],A:[]};
  for (const line of lines) {
    if (/ruolo|giocatore/i.test(line)) continue;
    const p=line.split(/[,;\t]/).map(s=>s.trim());
    if (p.length>=3&&rosa[p[0].toUpperCase()]&&p[1]&&p[2]) rosa[p[0].toUpperCase()].push({nome:p[1],nazione:p[2]});
  }
  return Object.values(rosa).some(a=>a.length)?rosa:null;
}

// Parsing CSV database globale giocatori (nome, squadra, ruolo – qualsiasi ordine)
function parseSuperGiocatoriCSV(csv) {
  const RUOLI_VALIDI = { P:1, D:1, C:1, A:1 };
  const lines = csv.trim().split(String.fromCharCode(10)).map(function(l){return l.replace(String.fromCharCode(13),"").trim();}).filter(Boolean);
  if (lines.length < 2) return null;

  // Rileva separatore dalla prima riga
  const sep = lines[0].includes(';') ? ';' : lines[0].includes('	') ? '	' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase()
    .replace(/[^a-z]/g, ''));  // normalizza: "Squadra" → "squadra"

  const iNome    = headers.findIndex(h => h === 'nome');
  const iSquadra = headers.findIndex(h => ['squadra','nazione','team','club','country'].includes(h));
  const iRuolo   = headers.findIndex(h => ['ruolo','role','pos','posizione'].includes(h));

  if (iNome < 0 || iSquadra < 0 || iRuolo < 0) return null;

  const db = {};
  let totale = 0;
  let skippati = 0;

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep).map(s => s.trim());
    if (parts.length <= Math.max(iNome, iSquadra, iRuolo)) { skippati++; continue; }
    const nome    = parts[iNome];
    const squadra = parts[iSquadra];
    const ruolo   = parts[iRuolo].toUpperCase().charAt(0); // prende solo la prima lettera: "POR"→"P"
    if (!nome || !squadra || !RUOLI_VALIDI[ruolo]) { skippati++; continue; }
    if (!db[squadra]) db[squadra] = [];
    if (!db[squadra].some(g => g.nome === nome)) {
      db[squadra].push({ nome, ruolo });
      totale++;
    }
  }

  if (totale === 0) return null;
  return { db, totale, skippati };
}

function syncGiocatori(){
  if(!globalState.giocatoriSquadra)globalState.giocatoriSquadra={};
  for(const rosa of Object.values(state.rose)){
    for(const [ruolo,arr] of Object.entries(rosa)){
      for(const g of arr){
        if(!state.giocatoriSquadra[g.nazione])state.giocatoriSquadra[g.nazione]=[];
        if(!state.giocatoriSquadra[g.nazione].some(x=>x.nome===g.nome))
          state.giocatoriSquadra[g.nazione].push({nome:g.nome,ruolo});
        if(!globalState.giocatoriSquadra[g.nazione])globalState.giocatoriSquadra[g.nazione]=[];
        if(!globalState.giocatoriSquadra[g.nazione].some(x=>x.nome===g.nome))
          globalState.giocatoriSquadra[g.nazione].push({nome:g.nome,ruolo});
      }
    }
  }
}

// ── MODAL MANUALE ─────────────────────────────────────────────
document.getElementById("btnManualRosa")?.addEventListener("click",()=>{
  populateSel("manualPartSelect",state.partecipanti,"nome","id","– Seleziona –","");
  buildManualForm(document.getElementById("manualPartSelect").value);
  document.getElementById("modalManual").style.display="flex";
});
document.getElementById("modalClose")?.addEventListener("click",()=>document.getElementById("modalManual").style.display="none");
document.getElementById("modalManual")?.addEventListener("click",function(e){if(e.target===this)this.style.display="none";});
document.getElementById("manualPartSelect")?.addEventListener("change",function(){buildManualForm(this.value);});

function buildManualForm(partId) {
  const form=document.getElementById("manualRosaForm");
  const rosa=partId&&state.rose[partId]?state.rose[partId]:{P:[],D:[],C:[],A:[]};
  form.innerHTML=Object.entries(RUOLI).map(([ruolo,nome])=>{
    const rows=(rosa[ruolo]||[]).map((g,i)=>manualRow(ruolo,i,g.nome,g.nazione)).join("");
    return `<div class="manual-ruolo-section" data-ruolo="${ruolo}">
      <div class="manual-ruolo-title"><span class="ruolo-badge ruolo-${ruolo}">${ruolo}</span><span>${nome}</span></div>
      <div class="manual-giocatori-list" id="manList_${ruolo}">${rows}</div>
      <button class="btn-add-gioc" data-add="${ruolo}">+ Aggiungi ${ruolo}</button>
    </div>`;
  }).join("");
  form.querySelectorAll("[data-add]").forEach(btn=>{
    btn.addEventListener("click",function(){
      const r=this.dataset.add,list=document.getElementById("manList_"+r);
      const div=document.createElement("div");
      div.innerHTML=manualRow(r,list.children.length,"","");
      list.appendChild(div.firstElementChild);
    });
  });
}

function manualRow(ruolo,idx,nome,nazione) {
  const opts=NAZIONALI.map(n=>`<option value="${n}" ${n===nazione?"selected":""}>${n}</option>`).join("");
  return `<div class="manual-gioc-row" data-ruolo="${ruolo}">
    <input type="text" class="inp-man-nome" placeholder="Nome giocatore" value="${nome}">
    <select class="inp-man-naz"><option value="">– Squadra –</option>${opts}</select>
    <button class="btn-rm-gioc" type="button">✕</button>
  </div>`;
}
document.getElementById("manualRosaForm")?.addEventListener("click",e=>{
  if(e.target.classList.contains("btn-rm-gioc"))e.target.closest(".manual-gioc-row").remove();
});
document.getElementById("btnSalvaManual")?.addEventListener("click",()=>{
  const partId=document.getElementById("manualPartSelect").value;
  if (!partId){toast("Seleziona un partecipante!",true);return;}
  const rosa={P:[],D:[],C:[],A:[]};
  document.querySelectorAll("#manualRosaForm .manual-gioc-row").forEach(row=>{
    const r=row.dataset.ruolo,nome=row.querySelector(".inp-man-nome").value.trim();
    const naz=row.querySelector(".inp-man-naz").value;
    if(nome&&naz&&rosa[r])rosa[r].push({nome,nazione:naz});
  });
  const tot=Object.values(rosa).reduce((s,a)=>s+a.length,0);
  if(!tot){toast("Nessun giocatore inserito!",true);return;}
  state.rose[partId]=rosa;syncGiocatori();saveState();
  renderCapitanoForm();renderRoseStatus();
  document.getElementById("modalManual").style.display="none";
  toast(`Rosa salvata! (${tot} giocatori)`);
});



// ── GRAFICO STORICO ──────────────────────────────────────────
function renderGrafico() {
  const wrap = document.getElementById("graficoWrap");
  if (!wrap) return;
  if (!state.partecipanti || !state.partecipanti.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="icon">📈</div><p>Nessun dato disponibile.</p></div>`;
    return;
  }
  const giornateIds = Object.keys(GIORNATE).map(Number).sort((a,b)=>a-b);
  const colors = ["#e8ff3a","#ff6b35","#2ecc71","#3498db","#9b59b6","#e74c3c","#f39c12","#1abc9c","#e91e8c","#00bcd4","#ff5722","#8bc34a"];
  const W = wrap.clientWidth || 600;
  const H = 260;
  const PAD = { top:20, right:20, bottom:40, left:44 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Compute cumulative pts per partecipante per giornata
  const series = state.partecipanti.map((p, ci) => {
    let cum = 0;
    const points = giornateIds.map(gId => {
      cum += calcolaPuntiGiornata(p.id, String(gId));
      return cum;
    });
    return { nome: p.nome, points, color: colors[ci % colors.length] };
  });

  const allVals = series.flatMap(s => s.points);
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - minVal || 1;

  const xStep = chartW / (giornateIds.length - 1 || 1);
  const yScale = v => chartH - ((v - minVal) / range) * chartH;
  const xScale = i => i * xStep;

  // Grid lines
  const gridLines = [0,0.25,0.5,0.75,1].map(t => {
    const v = minVal + t * range;
    const y = yScale(v);
    return `<line x1="0" y1="${y}" x2="${chartW}" y2="${y}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>
    <text x="-6" y="${y+4}" text-anchor="end" font-size="9" fill="#8892a4">${v.toFixed(0)}</text>`;
  }).join("");

  // X axis labels
  const xLabels = giornateIds.map((gId, i) =>
    `<text x="${xScale(i)}" y="${chartH+18}" text-anchor="middle" font-size="9" fill="#8892a4">${GIORNATE[gId]}</text>`
  ).join("");

  // Lines + dots
  const seriesSvg = series.map(s => {
    const pts = giornateIds.map((_, i) => `${xScale(i)},${yScale(s.points[i])}`).join(" ");
    const dots = giornateIds.map((_, i) =>
      `<circle cx="${xScale(i)}" cy="${yScale(s.points[i])}" r="3" fill="${s.color}" stroke="var(--bg2)" stroke-width="1.5">
        <title>${s.nome}: ${s.points[i].toFixed(1)} pt</title>
      </circle>`
    ).join("");
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>
    ${dots}`;
  }).join("");

  // Legend
  const legend = series.map(s =>
    `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;white-space:nowrap">
      <span style="display:inline-block;width:12px;height:3px;border-radius:2px;background:${s.color}"></span>${s.nome}
    </span>`
  ).join("");

  wrap.innerHTML = `
    <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${PAD.left},${PAD.top})">
        ${gridLines}
        ${xLabels}
        ${seriesSvg}
      </g>
    </svg>
    <div style="display:flex;flex-wrap:wrap;gap:10px;padding:8px 0 0 ${PAD.left}px">${legend}</div>`;
}

// ── SOSTITUZIONI ─────────────────────────────────────────────
// 6 finestre, una ogni 5 giornate (G5/G10/G15/G20/G25/G30)
// 4 cambi per finestra, max 1 per ruolo per finestra
const FINESTRE = [
  { id:1, label:"Finestra 1", desc:"Entro fine Giornata 5",  giornataMax: 5  },
  { id:2, label:"Finestra 2", desc:"Entro fine Giornata 10", giornataMax: 10 },
  { id:3, label:"Finestra 3", desc:"Entro fine Giornata 15", giornataMax: 15 },
  { id:4, label:"Finestra 4", desc:"Entro fine Giornata 20", giornataMax: 20 },
  { id:5, label:"Finestra 5", desc:"Entro fine Giornata 25", giornataMax: 25 },
  { id:6, label:"Finestra 6", desc:"Entro fine Giornata 30", giornataMax: 30 },
];
const MAX_SOST_PER_FINESTRA = 4; // cambi disponibili per ogni finestra
const MAX_SOST_TOTALI = MAX_SOST_PER_FINESTRA; // alias usato nelle funzioni di controllo (per finestra)

// Stato UI locale per sostituzioni (non salvato)
let _sostSelectedPart = "";
let _finestreAperte = {}; // { "pid_fid": true }

function getSostituzioniPartecipante(partId) {
  if (!state.sostituzioni) state.sostituzioni = {};
  if (!state.sostituzioni[partId]) state.sostituzioni[partId] = {};
  return state.sostituzioni[partId];
}
// Conta le sostituzioni usate in UNA specifica finestra
function countSostFinestra(partId, finestraId) {
  const smap = getSostituzioniPartecipante(partId);
  const arr = smap[finestraId];
  return Array.isArray(arr) ? arr.length : 0;
}
// Alias per compatibilità con il codice esistente — conta per finestra
function countSostTotali(partId) {
  // Non usato direttamente nel nuovo sistema, ma mantenuto per sicurezza
  const smap = getSostituzioniPartecipante(partId);
  return Object.values(smap).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
}
function getRuoliUsatiInFinestra(partId, finestraId) {
  const smap = getSostituzioniPartecipante(partId);
  return (smap[finestraId] || []).map(s => s.ruolo);
}

// Tutti i giocatori di una nazione+ruolo noti da TUTTE le rose (non solo quella del partecipante corrente)
function getGiocatoriNazioneRuolo(naz, ruolo, escludiNome) {
  const found = new Map();
  for (const rosa of Object.values(state.rose)) {
    for (const g of (rosa[ruolo] || [])) {
      if (g.nazione === naz && g.nome !== escludiNome) {
        found.set(g.nome, g);
      }
    }
  }
  // anche da giocatoriSquadra
  for (const g of (state.giocatoriSquadra[naz] || [])) {
    if (g.ruolo === ruolo && g.nome !== escludiNome && !found.has(g.nome)) {
      found.set(g.nome, g);
    }
  }
  return Array.from(found.values());
}

function renderSostituzioni() {
  const div = document.getElementById("sostituzioniForm");
  if (!div) return;
  if (!state.partecipanti || !state.partecipanti.length) {
    div.innerHTML = `<p class="hint">Nessun partecipante.</p>`; return;
  }

  // ── Filtro partecipante ──
  const partOpts = state.partecipanti.map(p =>
    `<option value="${p.id}" ${_sostSelectedPart===p.id?"selected":""}>${p.nome}</option>`
  ).join("");

  const filterBar = `<div class="sost-filter-bar">
    <div class="filter-item">
      <label>Partecipante</label>
      <select id="sostPartSelect">${partOpts}</select>
    </div>
  </div>`;

  if (!_sostSelectedPart && state.partecipanti.length) {
    _sostSelectedPart = state.partecipanti[0].id;
  }
  const p = state.partecipanti.find(x => x.id === _sostSelectedPart);
  if (!p) { div.innerHTML = filterBar; return; }

  const rosa = state.rose[p.id];
  const smap = getSostituzioniPartecipante(p.id);

  // ── Storico globale ──
  const storicoRows = FINESTRE.flatMap(f => {
    const arr = smap[f.id] || [];
    return arr.map((s, si) => `<div class="sost-storico-row">
      <span class="sost-finestra-badge">F${f.id}</span>
      <span class="ruolo-badge ruolo-${s.ruolo}">${s.ruolo}</span>
      <span class="sost-out">▼ ${s.out}</span>
      <span class="sost-arrow">→</span>
      <span class="sost-in">▲ ${s.in}</span>
      <span class="sost-naz">(${s.nazione})</span>
      <button class="btn-del sost-del" data-pid="${p.id}" data-fid="${f.id}" data-idx="${si}" title="Annulla">✕</button>
    </div>`);
  }).join("");

  // ── Finestre ──
  const finestreHtml = FINESTRE.map(f => {
    const usatiFinestra = countSostFinestra(p.id, f.id);
    const rimasti       = MAX_SOST_PER_FINESTRA - usatiFinestra;
    const ruoliUsati    = getRuoliUsatiInFinestra(p.id, f.id);
    const ruoliDisp     = Object.keys(RUOLI).filter(r => !ruoliUsati.includes(r));
    const limitRagg     = usatiFinestra >= MAX_SOST_PER_FINESTRA;
    const key           = `${p.id}_${f.id}`;
    const isAperta      = !!_finestreAperte[key];

    const usedBadge = `<span style="font-size:11px;color:var(--text2)">${usatiFinestra}/${MAX_SOST_PER_FINESTRA} cambi usati</span>`;
    const ruoliBadge = ruoliUsati.length
      ? `<span style="font-size:11px;color:var(--text2)">Ruoli usati: ${ruoliUsati.join(", ")}</span>` : "";
    const canOpen = rosa && !limitRagg && ruoliDisp.length > 0;
    const btnLabel = isAperta ? "▲ Chiudi" : "＋ Aggiungi sostituzione";
    const btnStyle = isAperta ? "btn-sec" : "btn-primary";

    let formHtml = "";
    if (isAperta) {
      const ruoliOpts = ruoliDisp.map(r => `<option value="${r}">${r} – ${RUOLI[r]}</option>`).join("");
      formHtml = `<div class="sost-form-row" data-pid="${p.id}" data-fid="${f.id}">
        <div class="filter-item">
          <label>Ruolo</label>
          <select class="sost-sel-ruolo" data-pid="${p.id}" data-fid="${f.id}">${ruoliOpts}</select>
        </div>
        <div class="filter-item">
          <label>▼ Togli (OUT)</label>
          <select class="sost-sel-out" data-pid="${p.id}" data-fid="${f.id}"><option value="">– Seleziona –</option></select>
        </div>
        <div class="filter-item">
          <label>▲ Metti (IN)</label>
          <select class="sost-sel-in" data-pid="${p.id}" data-fid="${f.id}"><option value="">– prima seleziona OUT –</option></select>
        </div>
        <button class="btn-primary sost-btn-add" data-pid="${p.id}" data-fid="${f.id}" style="align-self:flex-end">✓ Conferma</button>
      </div>
      <div class="sost-nuovo-wrap" id="sostNuovo_${p.id}_${f.id}" style="display:none">
        <div class="sost-nuovo-box">
          <p style="font-size:12px;color:var(--accent);font-weight:700;margin-bottom:10px">✏️ Nuovo giocatore — squadra e ruolo verranno ereditati automaticamente</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div class="filter-item" style="flex:1;min-width:150px">
              <label>Nome giocatore</label>
              <input type="text" class="sost-nuovo-nome" placeholder="Es. Lookman" data-pid="${p.id}" data-fid="${f.id}">
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              <label style="font-size:11px;color:var(--text2)">Squadra</label>
              <span class="sost-nuovo-naz-label" style="font-size:13px;font-weight:700;color:var(--text2);padding:8px 11px;background:var(--bg);border:1px solid var(--border);border-radius:6px;min-width:100px">–</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              <label style="font-size:11px;color:var(--text2)">Ruolo</label>
              <span class="sost-nuovo-ruolo-label" style="font-size:13px;font-weight:700;color:var(--text2);padding:8px 11px;background:var(--bg);border:1px solid var(--border);border-radius:6px;min-width:40px">–</span>
            </div>
            <button class="btn-primary sost-btn-nuovo" data-pid="${p.id}" data-fid="${f.id}" style="align-self:flex-end">+ Aggiungi</button>
          </div>
        </div>
      </div>`;
    }

    const limitMsg = !rosa
      ? `<p class="hint" style="margin:0">Carica prima la rosa.</p>`
      : limitRagg
      ? `<p class="hint" style="margin:0;color:var(--red)">Limite di ${MAX_SOST_PER_FINESTRA} cambi per questa finestra raggiunto.</p>`
      : ruoliDisp.length === 0
      ? `<p class="hint" style="margin:0">Tutti i ruoli già usati in questa finestra.</p>`
      : "";

    return `<div class="sost-finestra-block">
      <div class="sost-finestra-title">
        <span class="sost-finestra-badge">F${f.id}</span>
        <span style="font-weight:700">${f.label}</span>
        <span class="hint" style="margin:0;font-size:11px">${f.desc}</span>
        ${usedBadge}
        ${ruoliBadge}
        <div style="margin-left:auto">
          ${canOpen
            ? `<button class="${btnStyle} sost-btn-toggle" data-key="${key}" style="font-size:12px;padding:5px 12px">${btnLabel}</button>`
            : limitMsg}
        </div>
      </div>
      ${formHtml}
    </div>`;
  }).join("");

  div.innerHTML = filterBar +
    `<div class="sost-partecipante-block">
      <div class="sost-part-header">
        <span class="sost-part-nome">${p.nome}</span>
        <span style="font-size:13px;color:var(--text2)">Cambi totali usati: <strong style="color:var(--accent)">${countSostTotali(p.id)}</strong></span>
      </div>
      ${storicoRows ? `<div class="sost-storico">${storicoRows}</div>` : ""}
      ${finestreHtml}
    </div>`;

  // Bind partecipante filter
  document.getElementById("sostPartSelect")?.addEventListener("change", function() {
    _sostSelectedPart = this.value;
    _finestreAperte = {};
    renderSostituzioni();
  });

  // Bind toggle finestra apri/chiudi
  div.querySelectorAll(".sost-btn-toggle").forEach(btn => {
    btn.addEventListener("click", function() {
      const key = this.dataset.key;
      _finestreAperte[key] = !_finestreAperte[key];
      renderSostituzioni();
    });
  });

  // Annulla sostituzione
  div.querySelectorAll(".sost-del").forEach(btn => {
    btn.addEventListener("click", function() {
      const {pid, fid, idx} = this.dataset;
      const smap2 = getSostituzioniPartecipante(pid);
      if (!smap2[fid]) return;
      const rimossa = smap2[fid][Number(idx)];
      if (!confirm(`Annullare la sostituzione ${rimossa.out} → ${rimossa.in}?`)) return;
      smap2[fid].splice(Number(idx), 1);
      // Ripristina la rosa
      const rosa2 = state.rose[pid];
      if (rosa2 && rosa2[rimossa.ruolo]) {
        const idxR = rosa2[rimossa.ruolo].findIndex(g => g.nome===rimossa.in && g.nazione===rimossa.nazione);
        if (idxR >= 0) rosa2[rimossa.ruolo][idxR] = { nome:rimossa.out, nazione:rimossa.nazione };
      }
      saveState(); renderSostituzioni(); toast("Sostituzione annullata.");
    });
  });

  // Populate OUT when ruolo changes
  div.querySelectorAll(".sost-sel-ruolo").forEach(sel => {
    populateSostOut(sel);
    sel.addEventListener("change", function() { populateSostOut(this); });
  });

  // Conferma sostituzione
  div.querySelectorAll(".sost-btn-add").forEach(btn => {
    btn.addEventListener("click", function() {
      const pid = this.dataset.pid, fid = Number(this.dataset.fid);
      const row = this.closest(".sost-form-row");
      const ruolo  = row.querySelector(".sost-sel-ruolo")?.value;
      const outSel = row.querySelector(".sost-sel-out");
      const inSel  = row.querySelector(".sost-sel-in");
      const outNome = outSel?.value;
      const inNome  = inSel?.value;
      const naz = outSel?.options[outSel.selectedIndex]?.dataset?.naz;
      if (!ruolo || !outNome || !inNome || !naz || inNome === "__nuovo__") {
        toast("Compila tutti i campi!", true); return;
      }
      const smap2 = getSostituzioniPartecipante(pid);
      if (!smap2[fid]) smap2[fid] = [];
      // Controllo limite finestra
      if (smap2[fid].length >= MAX_SOST_PER_FINESTRA) {
        toast(`Limite di ${MAX_SOST_PER_FINESTRA} cambi per questa finestra raggiunto!`, true); return;
      }
      smap2[fid].push({ ruolo, out:outNome, in:inNome, nazione:naz });
      // Aggiorna la rosa
      const rosa3 = state.rose[pid];
      if (rosa3 && rosa3[ruolo]) {
        const idxR = rosa3[ruolo].findIndex(g => g.nome===outNome && g.nazione===naz);
        if (idxR >= 0) rosa3[ruolo][idxR] = { nome:inNome, nazione:naz };
      }
      _finestreAperte[`${pid}_${fid}`] = false;
      saveState(); renderSostituzioni();
      toast(`✓ ${outNome} → ${inNome}`);
    });
  });

  // Nuovo giocatore
  div.querySelectorAll(".sost-btn-nuovo").forEach(btn => {
    btn.addEventListener("click", function() {
      const pid = this.dataset.pid, fid = Number(this.dataset.fid);
      const nuovoWrap = document.getElementById(`sostNuovo_${pid}_${fid}`);
      const nomeInput = nuovoWrap?.querySelector(".sost-nuovo-nome");
      const nazLabel  = nuovoWrap?.querySelector(".sost-nuovo-naz-label");
      const ruoloLabel= nuovoWrap?.querySelector(".sost-nuovo-ruolo-label");
      const row = document.querySelector(`.sost-form-row[data-pid="${pid}"][data-fid="${fid}"]`);
      const ruolo   = row?.querySelector(".sost-sel-ruolo")?.value;
      const outSel2 = row?.querySelector(".sost-sel-out");
      const outNome = outSel2?.value;
      const naz     = outSel2?.options[outSel2.selectedIndex]?.dataset?.naz;
      const inNome  = nomeInput?.value?.trim();
      if (!inNome) { toast("Inserisci il nome del nuovo giocatore!", true); return; }
      const smap2 = getSostituzioniPartecipante(pid);
      if (!smap2[fid]) smap2[fid] = [];
      if (smap2[fid].length >= MAX_SOST_PER_FINESTRA) {
        toast(`Limite di ${MAX_SOST_PER_FINESTRA} cambi per questa finestra raggiunto!`, true); return;
      }
      smap2[fid].push({ ruolo, out:outNome, in:inNome, nazione:naz });
      // Aggiorna la rosa
      const rosa4 = state.rose[pid];
      if (rosa4 && rosa4[ruolo]) {
        const idxR = rosa4[ruolo].findIndex(g => g.nome===outNome && g.nazione===naz);
        if (idxR >= 0) rosa4[ruolo][idxR] = { nome:inNome, nazione:naz };
        else rosa4[ruolo].push({ nome:inNome, nazione:naz });
      }
      syncGiocatori();
      _finestreAperte[`${pid}_${fid}`] = false;
      saveState(); renderSostituzioni();
      toast(`✓ Nuovo: ${inNome} al posto di ${outNome}`);
    });
  });
}

function populateSostOut(ruoloSel) {
  const pid   = ruoloSel.dataset.pid;
  const fid   = ruoloSel.dataset.fid;
  const ruolo = ruoloSel.value;
  const row   = ruoloSel.closest(".sost-form-row");
  if (!row) return;
  const outSel = row.querySelector(".sost-sel-out");
  const inSel  = row.querySelector(".sost-sel-in");
  const rosa   = state.rose[pid];
  if (!rosa || !ruolo) return;

  outSel.innerHTML = `<option value="">– Seleziona –</option>` +
    (rosa[ruolo] || []).map(g =>
      `<option value="${g.nome}" data-naz="${g.nazione}">${g.nome} (${g.nazione})</option>`
    ).join("");
  inSel.innerHTML = `<option value="">– prima seleziona OUT –</option>`;

  // reset nuovo box
  const nuovoWrap = document.getElementById(`sostNuovo_${pid}_${fid}`);
  if (nuovoWrap) nuovoWrap.style.display = "none";

  outSel.onchange = function() {
    const opt = this.options[this.selectedIndex];
    const naz = opt?.dataset?.naz;
    const nuovoWrap2 = document.getElementById(`sostNuovo_${pid}_${fid}`);
    if (!naz) {
      inSel.innerHTML = `<option value="">– prima seleziona OUT –</option>`;
      if (nuovoWrap2) nuovoWrap2.style.display = "none";
      return;
    }
    // Tutti i giocatori noti stessa nazione + ruolo, escluso OUT
    const candidati = getGiocatoriNazioneRuolo(naz, ruolo, this.value);
    inSel.innerHTML = `<option value="">– Seleziona –</option>` +
      candidati.map(g => `<option value="${g.nome}">${g.nome}</option>`).join("") +
      `<option value="__nuovo__">✏️ Nuovo giocatore...</option>`;

    // Update nuovo box labels
    if (nuovoWrap2) {
      nuovoWrap2.querySelector(".sost-nuovo-naz-label").textContent = naz;
      nuovoWrap2.querySelector(".sost-nuovo-ruolo-label").textContent = ruolo;
    }
    // Reset nuovo box visibility
    if (nuovoWrap2) nuovoWrap2.style.display = "none";
  };

  inSel.onchange = function() {
    const nuovoWrap2 = document.getElementById(`sostNuovo_${pid}_${fid}`);
    if (!nuovoWrap2) return;
    if (this.value === "__nuovo__") {
      nuovoWrap2.style.display = "block";
      nuovoWrap2.querySelector(".sost-nuovo-nome").focus();
    } else {
      nuovoWrap2.style.display = "none";
    }
  };
}

function confirmaSostituzione(pid, fid, ruolo, outNome, naz, inNome) {
  if (!ruolo || !outNome || !inNome || !naz) { toast("Compila tutti i campi!", true); return false; }
  if (!state.sostituzioni) state.sostituzioni = {};
  if (!state.sostituzioni[pid]) state.sostituzioni[pid] = {};
  if (!state.sostituzioni[pid][fid]) state.sostituzioni[pid][fid] = [];

  // Applica alla rosa
  const rosa = state.rose[pid];
  if (rosa && rosa[ruolo]) {
    const idx = rosa[ruolo].findIndex(g => g.nome === outNome);
    if (idx !== -1) rosa[ruolo][idx] = { nome: inNome, nazione: naz };
  }
  // Aggiungi a giocatoriSquadra se nuovo
  if (!state.giocatoriSquadra[naz]) state.giocatoriSquadra[naz] = [];
  if (!state.giocatoriSquadra[naz].some(g => g.nome === inNome)) {
    state.giocatoriSquadra[naz].push({ nome: inNome, ruolo });
  }

  state.sostituzioni[pid][fid].push({ ruolo, out: outNome, in: inNome, nazione: naz });
  _finestreAperte[`${pid}_${fid}`] = false;
  saveState();
  renderAdmin();
  toast(`✓ ${outNome} → ${inNome} (${ruolo}, F${fid})`);
  return true;
}

// Event delegation
document.addEventListener("click", e => {
  // Conferma da select
  if (e.target && e.target.classList.contains("sost-btn-add")) {
    const pid = e.target.dataset.pid;
    const fid = parseInt(e.target.dataset.fid);
    const row = e.target.closest(".sost-form-row");
    const ruolo   = row.querySelector(".sost-sel-ruolo").value;
    const outSel  = row.querySelector(".sost-sel-out");
    const inSel   = row.querySelector(".sost-sel-in");
    const outNome = outSel.value;
    const naz     = outSel.options[outSel.selectedIndex]?.dataset?.naz;
    const inVal   = inSel.value;
    if (inVal === "__nuovo__" || inVal === "") {
      toast("Seleziona un giocatore IN, oppure usa il box 'Nuovo giocatore'", true); return;
    }
    confirmaSostituzione(pid, fid, ruolo, outNome, naz, inVal);
  }

  // Conferma nuovo giocatore manuale
  if (e.target && e.target.classList.contains("sost-btn-nuovo")) {
    const pid = e.target.dataset.pid;
    const fid = parseInt(e.target.dataset.fid);
    const wrap = document.getElementById(`sostNuovo_${pid}_${fid}`);
    if (!wrap) return;
    const row    = wrap.closest(".sost-partecipante-block")?.querySelector(`.sost-form-row[data-pid="${pid}"][data-fid="${fid}"]`);
    const ruolo  = row?.querySelector(".sost-sel-ruolo")?.value;
    const outSel = row?.querySelector(".sost-sel-out");
    const outNome = outSel?.value;
    const naz    = outSel?.options[outSel.selectedIndex]?.dataset?.naz;
    const inNome = wrap.querySelector(".sost-nuovo-nome")?.value?.trim();
    if (!inNome) { toast("Inserisci il nome del giocatore!", true); return; }
    confirmaSostituzione(pid, fid, ruolo, outNome, naz, inNome);
  }

  // Annulla sostituzione
  if (e.target && e.target.classList.contains("sost-del")) {
    const pid = e.target.dataset.pid;
    const fid = parseInt(e.target.dataset.fid);
    const idx = parseInt(e.target.dataset.idx);
    if (!confirm("Annullare questa sostituzione? La rosa verrà ripristinata.")) return;
    const sost = state.sostituzioni?.[pid]?.[fid]?.[idx];
    if (sost) {
      const rosa = state.rose[pid];
      if (rosa && rosa[sost.ruolo]) {
        const i = rosa[sost.ruolo].findIndex(g => g.nome === sost.in);
        if (i !== -1) rosa[sost.ruolo][i] = { nome: sost.out, nazione: sost.nazione };
      }
      state.sostituzioni[pid][fid].splice(idx, 1);
    }
    saveState();
    renderAdmin();
    toast("Sostituzione annullata.");
  }
});

// ── HELPERS ───────────────────────────────────────────────────
function populateSel(id,items,labelKey,valueKey,placeholder,placeholderVal) {
  const sel=document.getElementById(id);
  if (!sel) return;
  const prev=sel.value;
  sel.innerHTML=`<option value="${placeholderVal}">${placeholder}</option>`+
    items.map(i=>`<option value="${i[valueKey]}">${i[labelKey]}</option>`).join("");
  if (prev) sel.value=prev;
}
function safeId(str){return str.replace(/[^a-zA-Z0-9]/g,"_");}

// ── GIORNATA CORRENTE ADMIN ──────────────────────────────────
document.addEventListener("click", e => {
  if (e.target && e.target.id === "btnSalvaGiornata") {
    const sel = document.getElementById("adminGiornataCorrente");
    if (!sel) return;
    globalState.giornataCorrente = sel.value;
    // sync all giornata selects
    ["giornataSelectGiornata","selectGiornata"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = sel.value;
    });
    saveState();
    const res = document.getElementById("giornataResult");
    if (res) { res.style.color="var(--green)"; res.textContent=`✓ Giornata ${GIORNATE[sel.value]} impostata come corrente!`; }
    renderClassifica();
    renderGiornata();
    toast(`Giornata ${GIORNATE[sel.value]} impostata!`);
  }
});


// ════════════════════════════════════════════════════════════
// SIDEBAR (profile + leghe drawer)
// ════════════════════════════════════════════════════════════

let sidebarOpen = false;

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (!sidebar) return;
  if (sidebarOpen) {
    renderSidebar();
    sidebar.classList.add("open");
    if (overlay) overlay.classList.add("show");
  } else {
    sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
  }
}

function closeSidebar() {
  sidebarOpen = false;
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("show");
}

function renderSidebar() {
  const content = document.getElementById("sidebarContent");
  if (!content) return;

  if (currentUser) {
    // Logged in: show profile + leghe
    let html = `<div class="sidebar-profile">
      <div class="sidebar-avatar">${(currentUser.displayName||currentUser.email||"U")[0].toUpperCase()}</div>
      <div class="sidebar-user-info">
        <div class="sidebar-username">${currentUser.displayName || "Utente"}</div>
        <div class="sidebar-email">${currentUser.email}</div>
      </div>
    </div>
    <hr class="sidebar-divider">
    <div class="sidebar-leghe-title">Le tue Leghe</div>
    <div id="sidebarLegheList"><div class="sidebar-loading">⏳ Caricamento...</div></div>
    <hr class="sidebar-divider">
    <button class="sidebar-btn sidebar-btn-danger" id="btnSidebarSignOut">⏏ Esci dall'account</button>`;
    content.innerHTML = html;

    document.getElementById("btnSidebarSignOut")?.addEventListener("click", async () => {
      await signOut(); currentUser = null; closeSidebar();
      exitLega(); renderHomeButtons();
    });

    // Load user leghe
    if (window._fbReady && window._db) {
      window._onVal(window._ref(window._db, "leghe"), snap => {
        const all = snap.val() || {};
        window._onVal(window._ref(window._db, "users/" + currentUser.uid + "/leghe"), uSnap => {
          const userLegheIds = Object.keys(uSnap.val() || {});
          const userLeghe = Object.entries(all).filter(([id]) => userLegheIds.includes(id));
          const list = document.getElementById("sidebarLegheList");
          if (!list) return;
          if (!userLeghe.length) {
            list.innerHTML = '<div class="sidebar-no-leghe">Nessuna lega ancora.<br>Creane una dalla home.</div>';
            return;
          }
          list.innerHTML = userLeghe.map(([id, l]) => `
            <div class="sidebar-lega-item${currentLegaId===id?" active":""}" data-id="${id}" data-state='${JSON.stringify(l.state||{})}' data-meta='${JSON.stringify(l.meta||{})}'>
              <span class="sidebar-lega-name">${l.meta?.nome||id}</span>
              <span class="sidebar-lega-badge">${l.meta?.pubblica?"🌍":"🔒"}</span>
              ${l.meta?.adminUid===currentUser.uid?'<span class="sidebar-lega-admin">👑</span>':""}
            </div>`).join("");
          list.querySelectorAll(".sidebar-lega-item").forEach(item => {
            item.addEventListener("click", function() {
              const id = this.dataset.id;
              try {
                const s = JSON.parse(this.dataset.state);
                const m = JSON.parse(this.dataset.meta);
                closeSidebar();
                entraInLega(id, s, m);
              } catch(e) {
                // fallback: load from Firebase
                window._onVal(window._ref(window._db,"leghe/"+id), snap2 => {
                  const d=snap2.val();
                  if(d?.state) { closeSidebar(); entraInLega(id,d.state,d.meta); }
                }, {onlyOnce:true});
              }
            });
          });
        }, {onlyOnce:true});
      }, {onlyOnce:true});
    }
  } else {
    // Not logged in: show login form
    content.innerHTML = `
      <div class="sidebar-auth-header">Accedi o Registrati</div>
      <div class="auth-tabs" style="margin-bottom:16px">
        <button class="auth-tab active" data-tab="login">Accedi</button>
        <button class="auth-tab" data-tab="register">Registrati</button>
      </div>
      <div id="sidebarAuthLogin" class="auth-form">
        <div class="field-group"><label>Email</label><input type="email" id="sidebarEmail" placeholder="tua@email.com" autocomplete="email"></div>
        <div class="field-group"><label>Password</label><input type="password" id="sidebarPwd" placeholder="Password" autocomplete="current-password"></div>
        <button class="btn-primary" id="btnSidebarLogin" style="width:100%">Accedi</button>
        <p class="pwd-error" id="sidebarLoginErr"></p>
      </div>
      <div id="sidebarAuthRegister" class="auth-form" style="display:none">
        <div class="field-group"><label>Nome e Cognome</label><input type="text" id="sidebarNome" placeholder="Es. Mario Rossi" autocomplete="name"></div>
        <div class="field-group"><label>Email</label><input type="email" id="sidebarRegEmail" placeholder="tua@email.com" autocomplete="email"></div>
        <div class="field-group"><label>Password</label><input type="password" id="sidebarRegPwd" placeholder="Min 6 caratteri" autocomplete="new-password"></div>
        <button class="btn-primary" id="btnSidebarRegister" style="width:100%">Crea account</button>
        <p class="pwd-error" id="sidebarRegErr"></p>
      </div>`;

    content.querySelectorAll(".auth-tab").forEach(tab => {
      tab.addEventListener("click", function() {
        content.querySelectorAll(".auth-tab").forEach(t=>t.classList.remove("active"));
        this.classList.add("active");
        document.getElementById("sidebarAuthLogin").style.display = this.dataset.tab==="login"?"":"none";
        document.getElementById("sidebarAuthRegister").style.display = this.dataset.tab==="register"?"":"none";
      });
    });

    document.getElementById("btnSidebarLogin")?.addEventListener("click", async () => {
      const email = document.getElementById("sidebarEmail").value.trim();
      const pwd = document.getElementById("sidebarPwd").value;
      const err = document.getElementById("sidebarLoginErr");
      if (!email||!pwd) { err.textContent="Compila tutti i campi!"; return; }
      document.getElementById("btnSidebarLogin").textContent="⏳...";
      const res = await signIn(email, pwd);
      if (res.error) { err.textContent=res.error; document.getElementById("btnSidebarLogin").textContent="Accedi"; return; }
      // onAuthStateChanged handles re-render
    });
    document.getElementById("sidebarPwd")?.addEventListener("keydown", e => {
      if(e.key==="Enter") document.getElementById("btnSidebarLogin")?.click();
    });

    document.getElementById("btnSidebarRegister")?.addEventListener("click", async () => {
      const nome = document.getElementById("sidebarNome").value.trim();
      const email = document.getElementById("sidebarRegEmail").value.trim();
      const pwd = document.getElementById("sidebarRegPwd").value;
      const err = document.getElementById("sidebarRegErr");
      if (!nome||!email||!pwd) { err.textContent="Compila tutti i campi!"; return; }
      document.getElementById("btnSidebarRegister").textContent="⏳...";
      const res = await signUp(email, pwd, nome);
      if (res.error) { err.textContent=res.error; document.getElementById("btnSidebarRegister").textContent="Crea account"; }
    });
  }
}

// ════════════════════════════════════════════════════════════
// HOME BUTTONS & EXIT LEGA
// ════════════════════════════════════════════════════════════

function renderHomeButtons() {
  // Update home hero buttons based on auth state
  const btnsWrap = document.getElementById("homeHeroBtns");
  if (!btnsWrap) return;
  if (currentUser) {
    btnsWrap.innerHTML = `
      <button class="btn-primary" onclick="toggleSidebar()">🏆 Le mie Leghe</button>
      <button class="btn-primary" onclick="renderHomeCreateForm()">➕ Crea Lega</button>
      <button class="btn-sec" onclick="renderHomeJoinForm()">🔗 Unisciti a una Lega</button>`;
  } else {
    btnsWrap.innerHTML = `
      <button class="btn-primary" onclick="toggleSidebar()">Accedi</button>
      <button class="btn-sec" onclick="toggleSidebarRegister()">Registrati</button>`;
  }
}

function toggleSidebarRegister() {
  toggleSidebar();
  // After sidebar opens, switch to register tab
  setTimeout(() => {
    const regTab = document.querySelector('#sidebarContent .auth-tab[data-tab="register"]');
    if (regTab) regTab.click();
  }, 50);
}

function renderHomeJoinForm() {
  const content = document.getElementById("sidebarContent");
  if (!content) { toggleSidebar(); return; }
  if (!sidebarOpen) toggleSidebar();
  setTimeout(() => {
    const c = document.getElementById("sidebarContent");
    if (!c) return;
    c.innerHTML = `
      <div class="sidebar-auth-header">🔗 Unisciti a una Lega</div>
      <div class="sidebar-auth-header" style="font-size:13px;font-weight:500;margin-bottom:6px;">🌍 Leghe Pubbliche</div>
      <div id="joinLegheList"><p style="color:var(--text2);font-size:13px;">Caricamento...</p></div>
      <hr class="sidebar-divider">
      <div class="sidebar-auth-header" style="font-size:13px;font-weight:500;margin-bottom:6px;">🔒 Entra con Codice</div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:8px">Inserisci il codice lega (es. AB3K7M) o il codice scelto dall'admin.</p>
      <div class="lobby-form" style="flex-direction:column">
        <input type="text" id="joinCodiceInput" placeholder="Codice lega..." maxlength="10" style="text-transform:uppercase;width:100%">
        <button class="btn-primary" id="btnJoinCodice" style="width:100%">Entra →</button>
        <p class="pwd-error" id="joinEntraErr"></p>
      </div>`;

    // Carica leghe pubbliche con _onVal (stesso pattern del codice funzionante)
    window._onVal(window._ref(window._db, "leghe"), snap => {
      const leghe = snap.val() || {};
      const listEl = document.getElementById("joinLegheList");
      if (!listEl) return;
      const pubbliche = Object.entries(leghe).filter(([,l]) => l.meta?.pubblica);
      if (!pubbliche.length) {
        listEl.innerHTML = '<p style="color:var(--text2);font-size:13px;">Nessuna lega pubblica disponibile.</p>';
      } else {
        listEl.innerHTML = pubbliche.map(([id, l]) => {
          const nPart = Array.isArray(l.state?.partecipanti) ? l.state.partecipanti.length : 0;
          return `<div class="lega-card" style="margin-bottom:8px">
            <div class="lega-card-name">${l.meta?.nome || id}</div>
            <div style="font-size:11px;color:var(--text2)">${nPart} partecipant${nPart===1?'e':'i'}</div>
            <button class="btn-primary lega-join-btn" style="margin-top:6px;width:100%" data-id="${id}">Entra →</button>
          </div>`;
        }).join('');
        listEl.querySelectorAll('.lega-join-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            window._onVal(window._ref(window._db, "leghe/" + id), snap2 => {
              const d = snap2.val();
              if (d?.state) { closeSidebar(); entraInLega(id, d.state, d.meta); }
              else toast("Errore nel caricamento della lega.", true);
            }, {onlyOnce: true});
          });
        });
      }
    }, {onlyOnce: true});

    // Codice privato — stesso pattern di sbEntra che già funziona
    document.getElementById("btnJoinCodice")?.addEventListener("click", () => {
      const codice = document.getElementById("joinCodiceInput")?.value.trim().toUpperCase();
      const errEl = document.getElementById("joinEntraErr");
      if (!codice) { errEl.textContent = "Inserisci un codice!"; return; }
      errEl.textContent = "⏳ Ricerca...";
      // Prima prova come legaId diretto
      window._onVal(window._ref(window._db, "leghe/" + codice), snap => {
        const d = snap.val();
        if (d?.state) { closeSidebar(); entraInLega(codice, d.state, d.meta); return; }
        // Poi cerca tra i meta.codice (codice scelto dall'admin)
        window._onVal(window._ref(window._db, "leghe"), allSnap => {
          const all = allSnap.val() || {};
          const found = Object.entries(all).find(([,l]) => l.meta?.codice?.toUpperCase() === codice);
          if (found) { closeSidebar(); entraInLega(found[0], found[1].state, found[1].meta); }
          else errEl.textContent = "❌ Codice non trovato.";
        }, {onlyOnce: true});
      }, {onlyOnce: true});
    });
  }, 50);
}


function renderHomeCreateForm() {
  // Show create lega form inside sidebar
  const content = document.getElementById("sidebarContent");
  if (!content) { toggleSidebar(); return; }
  if (!sidebarOpen) toggleSidebar();
  setTimeout(() => {
    const c = document.getElementById("sidebarContent");
    if (!c) return;
    c.innerHTML = `
      <div class="sidebar-auth-header">➕ Crea Nuova Lega</div>
      <div class="auth-form">
        <div class="field-group"><label>Nome lega</label><input type="text" id="sbLegaNome" placeholder="Es. Lega degli Amici"></div>
        <div class="field-group"><label>Tipo</label>
          <select id="sbLegaTipo"><option value="pubblica">🌍 Pubblica</option><option value="privata">🔒 Privata</option></select>
        </div>
        <div class="field-group" id="sbCodiceGroup" style="display:none"><label>Codice accesso</label><input type="text" id="sbLegaCodice" placeholder="Es. AMICI1" maxlength="10"></div>
        <button class="btn-primary" id="btnSbCrea" style="width:100%">🏆 Crea Lega</button>
        <p class="parse-result" id="sbCreaResult"></p>
      </div>
      <hr class="sidebar-divider">
      <div class="sidebar-auth-header">🔒 Entra in una Lega Privata</div>
      <div class="lobby-form" style="flex-direction:column">
        <input type="text" id="sbCodiceInput" placeholder="Codice lega (es. ABC123)" maxlength="10" style="text-transform:uppercase;width:100%">
        <button class="btn-primary" id="btnSbEntra" style="width:100%">Entra →</button>
        <p class="pwd-error" id="sbEntraErr"></p>
      </div>`;

    document.getElementById("sbLegaTipo")?.addEventListener("change", function() {
      document.getElementById("sbCodiceGroup").style.display = this.value==="privata"?"":"none";
    });

    document.getElementById("btnSbCrea")?.addEventListener("click", async () => {
      const nome = document.getElementById("sbLegaNome").value.trim();
      const tipo = document.getElementById("sbLegaTipo").value;
      const codice = document.getElementById("sbLegaCodice")?.value.trim().toUpperCase();
      const res = document.getElementById("sbCreaResult");
      if (!nome) { res.style.color="var(--red)"; res.textContent="Inserisci il nome!"; return; }
      const btn = document.getElementById("btnSbCrea");
      btn.disabled=true; btn.textContent="⏳...";
      const result = await creaLega(nome, tipo==="pubblica", codice);
      btn.disabled=false; btn.textContent="🏆 Crea Lega";
      if (result) {
        const {legaId,meta} = result;
        const link = `${location.origin}${location.pathname}?lega=${legaId}`;
        res.style.color="var(--green)";
        res.innerHTML=`✓ Creata! <strong>${legaId}</strong>
          <button class="btn-sec" style="font-size:10px;padding:2px 7px;margin-left:6px"
            onclick="navigator.clipboard.writeText('${link}').then(()=>toast('Copiato!'))">📋</button>`;
        setTimeout(()=>{ closeSidebar(); entraInLega(legaId, defaultLegaState(), meta); }, 1200);
      }
    });

    document.getElementById("btnSbEntra")?.addEventListener("click", () => {
      const codice = document.getElementById("sbCodiceInput").value.trim().toUpperCase();
      const err = document.getElementById("sbEntraErr");
      if (!codice) { err.textContent="Inserisci un codice!"; return; }
      err.textContent="⏳ Ricerca...";
      window._onVal(window._ref(window._db,"leghe/"+codice), snap=>{
        const d=snap.val();
        if(d?.state){closeSidebar();entraInLega(codice,d.state,d.meta);return;}
        window._onVal(window._ref(window._db,"leghe"),allSnap=>{
          const all=allSnap.val()||{};
          const found=Object.entries(all).find(([,l])=>l.meta?.codice?.toUpperCase()===codice);
          if(found){closeSidebar();entraInLega(found[0],found[1].state,found[1].meta);}
          else err.textContent="❌ Codice non trovato.";
        },{onlyOnce:true});
      },{onlyOnce:true});
    });
  }, 60);
}

function exitLega() {
  currentLegaId = null; currentLegaMeta = null;
  state = defaultLegaState();
  adminUnlocked = false; votiUnlocked = false; superadminUnlocked = false;
  aggiornaTabAdmin();
  localStorage.removeItem("fsa_lastLega"); localStorage.removeItem("fsa_lastLegaMeta");
  history.pushState(null, '', location.pathname);
  // Hide nav tabs (keep logo and sidebar btn)
  document.querySelector(".nav-links")?.style && (document.querySelector(".nav-links").style.display="none");
  document.getElementById("hamburger") && (document.getElementById("hamburger").style.display="none");
  const banner = document.getElementById("legaInfoBanner");
  if(banner) { banner.style.display="none"; banner.innerHTML=""; }
  // Go to home
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const home = document.getElementById("page-home");
  if(home) home.classList.add("active");
  renderHomeButtons();
  renderPage("home");
}


// ════════════════════════════════════════════════════════════
// AUTH SYSTEM
// ════════════════════════════════════════════════════════════

async function signUp(email, password, nome) {
  if (!window._fbAuth) return { error: "Firebase Auth non disponibile" };
  try {
    const { createUserWithEmailAndPassword, updateProfile } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const cred = await createUserWithEmailAndPassword(window._fbAuth, email, password);
    await updateProfile(cred.user, { displayName: nome });
    await window._set(window._ref(window._db, "users/" + cred.user.uid), {
      nome, email, createdAt: Date.now(), leghe: {}
    });
    return { user: cred.user };
  } catch(e) { return { error: translateAuthError(e.code) }; }
}

async function signIn(email, password) {
  if (!window._fbAuth) return { error: "Firebase Auth non disponibile" };
  try {
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const cred = await signInWithEmailAndPassword(window._fbAuth, email, password);
    return { user: cred.user };
  } catch(e) { return { error: translateAuthError(e.code) }; }
}

async function signOut() {
  if (!window._fbAuth) return;
  const { signOut: fbSignOut } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
  await fbSignOut(window._fbAuth);
}

function translateAuthError(code) {
  const map = {
    "auth/email-already-in-use": "Email già registrata.",
    "auth/invalid-email": "Email non valida.",
    "auth/weak-password": "Password troppo debole (min 6 caratteri).",
    "auth/user-not-found": "Utente non trovato.",
    "auth/wrong-password": "Password errata.",
    "auth/invalid-credential": "Credenziali non valide.",
    "auth/too-many-requests": "Troppi tentativi. Riprova più tardi.",
  };
  return map[code] || "Errore: " + code;
}

async function getUserLeghe(uid) {
  if (!window._fbReady || !window._db) return {};
  return new Promise(resolve => {
    window._onVal(window._ref(window._db, "users/" + uid + "/leghe"), snap => {
      resolve(snap.val() || {});
    }, { onlyOnce: true });
  });
}

async function addLegaToUser(uid, legaId, legaNome) {
  if (!window._fbReady || !window._db) return;
  await window._set(window._ref(window._db, "users/" + uid + "/leghe/" + legaId), {
    nome: legaNome, joinedAt: Date.now()
  });
}

// ════════════════════════════════════════════════════════════
// SUPERADMIN
// ════════════════════════════════════════════════════════════

function renderSuperadminPage() {
  const wrap = document.getElementById("superadminContent");
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div><h1>⚡ Superadmin</h1><p class="subtitle">Controllo globale su tutte le leghe</p></div>
      <button class="btn-sec" id="btnSuperLogout">🔒 Esci</button>
    </div>
    <div class="admin-grid">
      <div class="admin-card">
        <h3>📅 Giornata Corrente</h3>
        <p class="hint">Impostata per tutte le leghe.</p>
        <div class="field-group"><label>Giornata</label>
          <select id="superGiornata">
            <option value="1">Giornata 1</option> <option value="2">Giornata 2</option> <option value="3">Giornata 3</option> <option value="4">Giornata 4</option> <option value="5">Giornata 5</option> <option value="6">Giornata 6</option> <option value="7">Giornata 7</option> <option value="8">Giornata 8</option> <option value="9">Giornata 9</option> <option value="10">Giornata 10</option> <option value="11">Giornata 11</option> <option value="12">Giornata 12</option> <option value="13">Giornata 13</option> <option value="14">Giornata 14</option> <option value="15">Giornata 15</option> <option value="16">Giornata 16</option> <option value="17">Giornata 17</option> <option value="18">Giornata 18</option> <option value="19">Giornata 19</option> <option value="20">Giornata 20</option> <option value="21">Giornata 21</option> <option value="22">Giornata 22</option> <option value="23">Giornata 23</option> <option value="24">Giornata 24</option> <option value="25">Giornata 25</option> <option value="26">Giornata 26</option> <option value="27">Giornata 27</option> <option value="28">Giornata 28</option> <option value="29">Giornata 29</option> <option value="30">Giornata 30</option> <option value="31">Giornata 31</option> <option value="32">Giornata 32</option> <option value="33">Giornata 33</option> <option value="34">Giornata 34</option> <option value="35">Giornata 35</option> <option value="36">Giornata 36</option> <option value="37">Giornata 37</option> <option value="38">Giornata 38</option>
          </select>
        </div>
        <button class="btn-primary" id="btnSuperSalvaGiornata">💾 Salva</button>
      </div>
      <div class="admin-card">
        <h3>🗑 Gestione Dati</h3>
        <p class="hint">Operazioni irreversibili.</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn-sec" id="btnDelVoti" style="color:var(--orange);border-color:var(--orange)">🗑 Elimina tutti i voti</button>
          <button class="btn-sec" id="btnDelLeghe" style="color:var(--red);border-color:var(--red)">⚠️ Elimina TUTTE le leghe</button>
          <button class="btn-sec" id="btnDelAll" style="color:var(--red);border-color:var(--red);font-weight:800">💥 Reset totale</button>
        </div>
      </div>
      <div class="admin-card" style="grid-column:1/-1">
        <h3>⚽ Database Giocatori</h3>
        <p class="hint">Carica un CSV con le colonne <strong>nome</strong>, <strong>squadra</strong>, <strong>ruolo</strong> (in qualsiasi ordine, separatore , o ; o tab). I valori ruolo accettati: <code>P</code> portiere, <code>D</code> difensore, <code>C</code> centrocampista, <code>A</code> attaccante.</p>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
          <label class="btn-sec" style="cursor:pointer">
            📂 Scegli CSV
            <input type="file" id="superGiocatoriFile" accept=".csv" style="display:none">
          </label>
          <span id="superGiocatoriFileName" style="font-size:13px;color:var(--text2)">Nessun file selezionato</span>
        </div>
        <button class="btn-primary" id="btnSuperCaricaGiocatori" disabled>⬆️ Carica nel Database</button>
        <button class="btn-sec" id="btnSuperSvuotaGiocatori" style="margin-left:8px;color:var(--red);border-color:var(--red)">🗑 Svuota Database</button>
        <p class="parse-result" id="superGiocatoriResult" style="margin-top:10px"></p>
        <div id="superGiocatoriPreview" style="margin-top:12px"></div>
      </div>
      <div class="admin-card" style="grid-column:1/-1">
        <h3>🔴 Partite Live – Voti Sofascore</h3>
        <p class="hint">Il poller aggiorna i voti automaticamente ogni 5 minuti durante le partite. Qui puoi vedere lo stato e forzare un aggiornamento manuale per singola partita.</p>
        <div class="field-group" style="margin-bottom:12px">
          <label>Giornata</label>
          <select id="superLiveGiornata">
            <option value="1">Giornata 1</option> <option value="2">Giornata 2</option> <option value="3">Giornata 3</option> <option value="4">Giornata 4</option> <option value="5">Giornata 5</option> <option value="6">Giornata 6</option> <option value="7">Giornata 7</option> <option value="8">Giornata 8</option> <option value="9">Giornata 9</option> <option value="10">Giornata 10</option> <option value="11">Giornata 11</option> <option value="12">Giornata 12</option> <option value="13">Giornata 13</option> <option value="14">Giornata 14</option> <option value="15">Giornata 15</option> <option value="16">Giornata 16</option> <option value="17">Giornata 17</option> <option value="18">Giornata 18</option> <option value="19">Giornata 19</option> <option value="20">Giornata 20</option> <option value="21">Giornata 21</option> <option value="22">Giornata 22</option> <option value="23">Giornata 23</option> <option value="24">Giornata 24</option> <option value="25">Giornata 25</option> <option value="26">Giornata 26</option> <option value="27">Giornata 27</option> <option value="28">Giornata 28</option> <option value="29">Giornata 29</option> <option value="30">Giornata 30</option> <option value="31">Giornata 31</option> <option value="32">Giornata 32</option> <option value="33">Giornata 33</option> <option value="34">Giornata 34</option> <option value="35">Giornata 35</option> <option value="36">Giornata 36</option> <option value="37">Giornata 37</option> <option value="38">Giornata 38</option>
          </select>
        </div>
        <div id="superMatchList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-bottom:8px"></div>
        <p class="hint" id="superLiveEmpty" style="display:none">Nessuna partita configurata per questa giornata.</p>
      </div>
      <div class="admin-card" style="grid-column:1/-1">
        <h3>📋 Voti Squadre – Modifica Manuale</h3>
        <p class="hint">Usa questa sezione per correggere voti o aggiungere bonus/malus. I voti con fonte Sofascore sono indicati con 🔴.</p>
        <div class="voti-controls" style="margin-bottom:16px">
          <div class="filter-item"><label>Squadra</label><select id="superSelectSquadra"></select></div>
          <div class="filter-item"><label>Giornata</label>
            <select id="superSelectGiornata">
              <option value="1">G1</option><option value="2">G2</option><option value="3">G3</option><option value="4">G4</option><option value="5">G5</option><option value="6">G6</option><option value="7">G7</option><option value="8">G8</option><option value="9">G9</option><option value="10">G10</option><option value="11">G11</option><option value="12">G12</option><option value="13">G13</option><option value="14">G14</option><option value="15">G15</option><option value="16">G16</option><option value="17">G17</option><option value="18">G18</option><option value="19">G19</option><option value="20">G20</option><option value="21">G21</option><option value="22">G22</option><option value="23">G23</option><option value="24">G24</option><option value="25">G25</option><option value="26">G26</option><option value="27">G27</option><option value="28">G28</option><option value="29">G29</option><option value="30">G30</option><option value="31">G31</option><option value="32">G32</option><option value="33">G33</option><option value="34">G34</option><option value="35">G35</option><option value="36">G36</option><option value="37">G37</option><option value="38">G38</option>
            </select>
          </div>
          <button class="btn-primary" id="superBtnSalvaVoti">💾 Salva</button>
        </div>
        <div id="superVotiTable" class="voti-table-wrap"></div>
      </div>
    </div>`;

  document.getElementById("superGiornata").value = globalState.giornataCorrente || "1";
  document.getElementById("btnSuperSalvaGiornata")?.addEventListener("click", () => {
    globalState.giornataCorrente = document.getElementById("superGiornata").value;
    saveGlobalState(); toast("Giornata aggiornata!");
  });
  document.getElementById("btnSuperLogout")?.addEventListener("click", () => {
    superadminUnlocked = false; adminUnlocked = false;
    ["adminLockIcon","adminLockIconMobile"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="🔒";});
    navigate("home"); toast("Sessione superadmin terminata.");
  });
  document.getElementById("btnDelVoti")?.addEventListener("click", () => {
    if (!confirm("Eliminare TUTTI i voti?")) return;
    globalState.voti = {}; saveGlobalState(); toast("Voti eliminati.");
  });
  document.getElementById("btnDelLeghe")?.addEventListener("click", async () => {
    if (!confirm("Eliminare TUTTE le leghe?")) return;
    if (!window._fbReady || !window._db) return;
    await window._set(window._ref(window._db, "leghe"), null);
    Object.keys(localStorage).filter(k => k.startsWith("fsa_lega_")).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem("fsa_lastLega"); localStorage.removeItem("fsa_lastLegaMeta");
    toast("Leghe eliminate."); renderSuperadminPage();
  });
  document.getElementById("btnDelAll")?.addEventListener("click", async () => {
    if (!confirm("RESET TOTALE?")) return;
    if (!confirm("Sicuro sicuro?")) return;
    await window._set(window._ref(window._db, "/"), null);
    localStorage.clear(); location.reload();
  });

  const sel = document.getElementById("superSelectSquadra");
  let opts = '<option value="">– Seleziona –</option>';
  for (const n of NAZIONALI) opts += `<option value="${n}">${n}</option>`;
  sel.innerHTML = opts;
  sel.addEventListener("change", renderSuperVotiTable);
  document.getElementById("superSelectGiornata")?.addEventListener("change", renderSuperVotiTable);
  document.getElementById("superBtnSalvaVoti")?.addEventListener("click", saveSuperVoti);

  // ── LIVE PARTITE ─────────────────────────────────────────────
  renderSuperMatchList(globalState.giornataCorrente || "1");
  document.getElementById("superLiveGiornata")?.addEventListener("change", function() {
    renderSuperMatchList(this.value);
  });

  // ── DATABASE GIOCATORI ───────────────────────────────────────
  let _giocatoriParsed = null;

  document.getElementById("superGiocatoriFile")?.addEventListener("change", function() {
    const file = this.files[0];
    if (!file) return;
    document.getElementById("superGiocatoriFileName").textContent = file.name;
    const reader = new FileReader();
    reader.onload = e => {
      const result = parseSuperGiocatoriCSV(e.target.result);
      const resEl = document.getElementById("superGiocatoriResult");
      const previewEl = document.getElementById("superGiocatoriPreview");
      const btnCarica = document.getElementById("btnSuperCaricaGiocatori");
      if (!result) {
        resEl.style.color = "var(--red)";
        resEl.textContent = "❌ Formato non riconosciuto. Serve header con 'nome', 'squadra', 'ruolo'.";
        previewEl.innerHTML = "";
        btnCarica.disabled = true;
        _giocatoriParsed = null;
        return;
      }
      _giocatoriParsed = result.db;
      const nSquadre = Object.keys(result.db).length;
      const nGioc = result.totale;
      resEl.style.color = "var(--green)";
      resEl.textContent = `✓ ${nGioc} giocatori in ${nSquadre} squadre – pronti per il caricamento.`;
      btnCarica.disabled = false;
      // Mostra anteprima
      previewEl.innerHTML = `<details style="margin-top:8px">
        <summary style="cursor:pointer;font-size:13px;color:var(--text2)">Mostra anteprima (prime 5 squadre)</summary>
        <div style="font-size:12px;margin-top:8px;max-height:260px;overflow:auto">
          ${Object.entries(result.db).slice(0,5).map(([sq,gioc]) =>
            `<strong>${sq}</strong>: ${gioc.map(g=>`${g.nome} (${g.ruolo})`).join(', ')}`
          ).join('<br>')}
        </div>
      </details>`;
    };
    reader.readAsText(file);
  });

  document.getElementById("btnSuperCaricaGiocatori")?.addEventListener("click", async () => {
    if (!_giocatoriParsed) return;
    const resEl = document.getElementById("superGiocatoriResult");
    const btn = document.getElementById("btnSuperCaricaGiocatori");
    btn.disabled = true; btn.textContent = "⏳ Caricamento...";
    try {
      globalState.giocatoriSquadra = _giocatoriParsed;
      saveGlobalState();
      resEl.style.color = "var(--green)";
      resEl.textContent = `✅ Database caricato! ${Object.values(_giocatoriParsed).flat().length} giocatori in ${Object.keys(_giocatoriParsed).length} squadre.`;
      toast("Database giocatori aggiornato!");
      btn.textContent = "⬆️ Carica nel Database";
    } catch(e) {
      resEl.style.color = "var(--red)";
      resEl.textContent = "❌ Errore: " + e.message;
      btn.disabled = false; btn.textContent = "⬆️ Carica nel Database";
    }
  });

  document.getElementById("btnSuperSvuotaGiocatori")?.addEventListener("click", async () => {
    if (!confirm("Svuotare il database dei giocatori? Questa azione è irreversibile.")) return;
    globalState.giocatoriSquadra = {};
    saveGlobalState();
    const resEl = document.getElementById("superGiocatoriResult");
    resEl.style.color = "var(--orange)";
    resEl.textContent = "Database giocatori svuotato.";
    document.getElementById("superGiocatoriPreview").innerHTML = "";
    document.getElementById("superGiocatoriFileName").textContent = "Nessun file selezionato";
    document.getElementById("btnSuperCaricaGiocatori").disabled = true;
    _giocatoriParsed = null;
    toast("Database giocatori svuotato.");
  });

  // Mostra stato attuale del database
  const nAttuale = Object.values(globalState.giocatoriSquadra||{}).flat().length;
  if (nAttuale > 0) {
    const resEl = document.getElementById("superGiocatoriResult");
    resEl.style.color = "var(--text2)";
    resEl.textContent = `Database attuale: ${nAttuale} giocatori in ${Object.keys(globalState.giocatoriSquadra).length} squadre.`;
  }
}


// ── LIVE MATCH STATUS ────────────────────────────────────────

function getMatchStatus(kickoffISO) {
  const now = Date.now();
  const ko  = new Date(kickoffISO).getTime();
  const end = ko + 130 * 60 * 1000; // 130 min finestra
  const finalized = ko + 180 * 60 * 1000; // 3h dopo = dati stabili
  if (now < ko)        return { label: "In programma", cls: "match-status-upcoming", icon: "🕐" };
  if (now <= end)      return { label: "IN CORSO 🔴",  cls: "match-status-live",     icon: "🔴" };
  if (now <= finalized)return { label: "Appena finita",cls: "match-status-recent",   icon: "✅" };
  return                      { label: "Conclusa",     cls: "match-status-done",     icon: "✔️" };
}

function formatKickoff(kickoffISO) {
  const d = new Date(kickoffISO);
  return d.toLocaleString("it-IT", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit", timeZone:"UTC" }) + " UTC";
}

function renderSuperMatchList(gId) {
  const listEl = document.getElementById("superMatchList");
  const emptyEl = document.getElementById("superLiveEmpty");
  if (!listEl) return;

  const matches = (typeof MATCHES !== "undefined" ? MATCHES : {})[gId] || [];
  if (!matches.length) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  listEl.innerHTML = matches.map(m => {
    const st = getMatchStatus(m.kickoff);
    const ko = formatKickoff(m.kickoff);
    // Controlla se ci sono già voti in Firebase per questa partita
    const homeVoti = globalState.voti[m.home]?.[gId] || {};
    const awayVoti = globalState.voti[m.away]?.[gId] || {};
    const homeCount = Object.values(homeVoti).filter(v => v.source === "sofascore").length;
    const awayCount = Object.values(awayVoti).filter(v => v.source === "sofascore").length;
    const hasData   = homeCount > 0 || awayCount > 0;

    return `<div class="match-live-card ${st.cls}">
      <div class="match-live-header">
        <span class="match-live-teams">${m.home} <span style="color:var(--text2)">vs</span> ${m.away}</span>
        <span class="match-live-badge">${st.icon} ${st.label}</span>
      </div>
      <div class="match-live-ko">⏱ ${ko}</div>
      <div class="match-live-data">
        ${hasData
          ? `<span style="color:var(--green);font-size:12px">✓ ${homeCount} voti ${m.home} · ${awayCount} voti ${m.away}</span>`
          : `<span style="color:var(--text2);font-size:12px">Nessun voto ancora importato</span>`}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn-primary" style="font-size:12px;padding:5px 12px"
          data-import-eid="${m.eventId}" data-import-home="${m.home}" data-import-away="${m.away}" data-import-gid="${gId}">
          ⬇️ Importa ora
        </button>
        <button class="btn-sec" style="font-size:12px;padding:5px 12px"
          data-view-naz="${m.home}" data-view-gid="${gId}">
          👁 ${m.home}
        </button>
        <button class="btn-sec" style="font-size:12px;padding:5px 12px"
          data-view-naz="${m.away}" data-view-gid="${gId}">
          👁 ${m.away}
        </button>
      </div>
    </div>`;
  }).join("");

  // Bind import buttons
  listEl.querySelectorAll("[data-import-eid]").forEach(btn => {
    btn.addEventListener("click", async function() {
      const eid  = this.dataset.importEid;
      const home = this.dataset.importHome;
      const away = this.dataset.importAway;
      const gid  = this.dataset.importGid;
      await importFromSofascore(eid, home, away, gid, this);
    });
  });

  // Bind view buttons → apre la tabella manuale sotto
  listEl.querySelectorAll("[data-view-naz]").forEach(btn => {
    btn.addEventListener("click", function() {
      const naz = this.dataset.viewNaz;
      const gid = this.dataset.viewGid;
      const selNaz = document.getElementById("superSelectSquadra");
      const selGid = document.getElementById("superSelectGiornata");
      if (selNaz) selNaz.value = naz;
      if (selGid) selGid.value = gid;
      renderSuperVotiTable();
      document.getElementById("superVotiTable")?.scrollIntoView({ behavior:"smooth", block:"start" });
    });
  });
}

async function importFromSofascore(eventId, home, away, gId, btnEl) {
  const origText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "⏳ Importo...";

  try {
    const res = await fetch(`/.netlify/functions/sofascore-proxy?eventId=${eventId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();

    // Scrivi su globalState i voti per home e away
    let countHome = 0, countAway = 0;
    for (const [side, nazione] of [["home", home], ["away", away]]) {
      const players = data[side] || [];
      if (!globalState.voti[nazione]) globalState.voti[nazione] = {};
      if (!globalState.voti[nazione][gId]) globalState.voti[nazione][gId] = {};
      for (const p of players) {
        const existing = globalState.voti[nazione][gId][p.name] || {};
        // Preserva modifiche manuali ai flags se già presenti
        const flagsDaUsare = (existing.source === "sofascore" && existing.flags && Object.keys(existing.flags).length > 0)
          ? existing.flags
          : (p.flags || {});
        if (p.didNotPlay || (p.minutesPlayed === 0 && p.rating === null)) {
          globalState.voti[nazione][gId][p.name] = { sv: true, flags: flagsDaUsare, source: "sofascore" };
        } else if (p.rating !== null) {
          globalState.voti[nazione][gId][p.name] = { v: p.rating, sv: false, flags: flagsDaUsare, source: "sofascore" };
          if (side === "home") countHome++; else countAway++;
        }
      }
    }
    saveGlobalState();
    toast(`✓ Importati: ${countHome} voti ${home} · ${countAway} voti ${away}`);
    renderSuperMatchList(gId);

  } catch(err) {
    toast(`❌ Errore import: ${err.message}`, true);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = origText;
  }
}

function renderSuperVotiTable() {
  const naz = document.getElementById("superSelectSquadra")?.value;
  const gId = document.getElementById("superSelectGiornata")?.value;
  const wrap = document.getElementById("superVotiTable"); if (!wrap) return;
  if (!naz) { wrap.innerHTML = '<div class="empty-state"><p>Seleziona una squadra.</p></div>'; return; }
  const giocSet = new Map();
  for (const g of (globalState.giocatoriSquadra?.[naz] || [])) if (!giocSet.has(g.nome)) giocSet.set(g.nome, g);
  const giocatori = Array.from(giocSet.values()).sort((a, b) => {
    const ord = ["P","D","C","A"]; return ord.indexOf(a.ruolo) - ord.indexOf(b.ruolo) || a.nome.localeCompare(b.nome);
  });
  const savedVoti = (globalState.voti[naz] || {})[gId] || {};
  if (!giocatori.length) { wrap.innerHTML = '<div style="padding:20px;color:var(--text2);text-align:center">Nessun giocatore. Le rose devono essere caricate nelle leghe.</div>'; return; }
  function ensurePath(nome) {
    if (!globalState.voti[naz]) globalState.voti[naz] = {};
    if (!globalState.voti[naz][gId]) globalState.voti[naz][gId] = {};
    if (!globalState.voti[naz][gId][nome]) globalState.voti[naz][gId][nome] = {};
    if (!globalState.voti[naz][gId][nome].flags) globalState.voti[naz][gId][nome].flags = {};
  }
  const rows = giocatori.map(g => {
    const entry = savedVoti[g.nome] || {};
    const isSV = !!entry.sv; const v = entry.v !== undefined ? entry.v : "";
    const flags = entry.flags || {}; const bns = calcFlagsBonus(flags, g.ruolo);
    const tot = isSV ? 0 : (parseFloat(v) || 0) + bns;
    const fromSofa = entry.source === "sofascore";
    const fd = getFlagsForRuolo(g.ruolo);
    const fh = fd.map(f => {
      const val = flags[f.key];
      if (f.multi) { const cnt = val || 0; return `<span class="flag-multi-wrap ${f.cls}${cnt > 0 ? " active" : ""}" data-flag="${f.key}" data-nome="${g.nome}"><button class="flag-multi-dec" data-flag="${f.key}" data-nome="${g.nome}" ${cnt === 0 ? "disabled" : ""}>−</button><span class="flag-multi-label">${f.label.split(" ")[0]} <span class="flag-multi-count">${cnt}</span></span><button class="flag-multi-inc" data-flag="${f.key}" data-nome="${g.nome}">+</button></span>`; }
      return `<button class="flag-btn ${f.cls}${val ? " active" : ""}" data-flag="${f.key}" data-multi="false" data-nome="${g.nome}">${f.label}</button>`;
    }).join("");
    return `<tr data-nome="${g.nome}" data-ruolo="${g.ruolo}"><td><span class="ruolo-badge ruolo-${g.ruolo}">${g.ruolo}</span></td><td style="font-weight:600">${fromSofa ? '<span title="Voto Sofascore" style="font-size:10px;margin-right:4px">🔴</span>' : ""}${g.nome}</td><td class="center"><input type="number" class="inp-v" data-nome="${g.nome}" value="${v}" step="0.5" min="0" max="10" placeholder="–" ${isSV ? "disabled style='opacity:.4'" : ""}><button class="sv-btn${isSV ? " active" : ""}" data-nome="${g.nome}">SV</button></td><td><div class="flags-wrap">${fh}</div></td><td class="center"><span class="totale-voto-cell${tot < 0 ? " totale-voto-neg" : ""}" id="svtot_${safeId(g.nome)}">${isSV ? "SV" : v !== "" ? tot.toFixed(1) : "–"}</span></td><td class="center"><button class="btn-icon" data-svdel="${g.nome}" style="color:var(--orange)">✕</button></td></tr>`;
  }).join("");
  wrap.innerHTML = `<table class="voti-table"><thead><tr><th>R.</th><th>Giocatore</th><th class="center">Voto</th><th>Bonus/Malus</th><th class="center">Tot</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  function updTot(row) {
    const nome = row.dataset.nome, ruolo = row.dataset.ruolo;
    const inp = row.querySelector(".inp-v"), svBtn = row.querySelector(".sv-btn");
    const isSV = svBtn?.classList.contains("active");
    const el = document.getElementById("svtot_" + safeId(nome)); if (!el) return;
    if (isSV) { el.textContent = "SV"; el.className = "totale-voto-cell"; return; }
    const v = parseFloat(inp?.value) || 0, fl = globalState.voti[naz]?.[gId]?.[nome]?.flags || {};
    const bns = calcFlagsBonus(fl, ruolo), tot = v + bns;
    el.textContent = inp?.value !== "" ? tot.toFixed(1) : "–";
    el.className = "totale-voto-cell" + (tot < 0 ? " totale-voto-neg" : "");
  }
  wrap.querySelectorAll(".inp-v").forEach(inp => inp.addEventListener("input", () => updTot(inp.closest("tr"))));
  wrap.querySelectorAll(".sv-btn").forEach(btn => btn.addEventListener("click", function() {
    const nome = this.dataset.nome, isSV = this.classList.toggle("active");
    const inp = this.closest("tr").querySelector(".inp-v");
    if (inp) { inp.disabled = isSV; inp.style.opacity = isSV ? ".4" : ""; }
    ensurePath(nome); globalState.voti[naz][gId][nome].sv = isSV; updTot(this.closest("tr"));
  }));
  wrap.querySelectorAll(".flag-btn[data-flag]").forEach(btn => btn.addEventListener("click", function() {
    ensurePath(this.dataset.nome);
    globalState.voti[naz][gId][this.dataset.nome].flags[this.dataset.flag] = this.classList.toggle("active");
    updTot(this.closest("tr"));
  }));
  wrap.querySelectorAll(".flag-multi-inc").forEach(btn => btn.addEventListener("click", function() {
    ensurePath(this.dataset.nome);
    const cur = globalState.voti[naz][gId][this.dataset.nome].flags;
    cur[this.dataset.flag] = (cur[this.dataset.flag] || 0) + 1;
    const w = this.closest(".flag-multi-wrap"); w.classList.add("active");
    w.querySelector(".flag-multi-count").textContent = cur[this.dataset.flag];
    w.querySelector(".flag-multi-dec").disabled = false;
    updTot(this.closest("tr"));
  }));
  wrap.querySelectorAll(".flag-multi-dec").forEach(btn => btn.addEventListener("click", function() {
    const cur = globalState.voti[naz]?.[gId]?.[this.dataset.nome]?.flags; if (!cur) return;
    cur[this.dataset.flag] = Math.max(0, (cur[this.dataset.flag] || 0) - 1);
    const w = this.closest(".flag-multi-wrap");
    w.querySelector(".flag-multi-count").textContent = cur[this.dataset.flag];
    if (cur[this.dataset.flag] === 0) { w.classList.remove("active"); this.disabled = true; }
    updTot(this.closest("tr"));
  }));
  wrap.querySelectorAll("[data-svdel]").forEach(btn => btn.addEventListener("click", function() {
    if (!confirm(`Eliminare voto di ${this.dataset.svdel}?`)) return;
    if (globalState.voti[naz]?.[gId]?.[this.dataset.svdel]) delete globalState.voti[naz][gId][this.dataset.svdel];
    saveGlobalState(); renderSuperVotiTable(); toast(`Voto eliminato.`);
  }));
}

function saveSuperVoti() {
  const naz = document.getElementById("superSelectSquadra")?.value;
  const gId = document.getElementById("superSelectGiornata")?.value;
  if (!naz) { toast("Seleziona una squadra!", true); return; }
  if (!globalState.voti[naz]) globalState.voti[naz] = {};
  if (!globalState.voti[naz][gId]) globalState.voti[naz][gId] = {};
  document.querySelectorAll("#superVotiTable tbody tr[data-nome]").forEach(row => {
    const nome = row.dataset.nome, inp = row.querySelector(".inp-v");
    const isSV = row.querySelector(".sv-btn")?.classList.contains("active");
    const v = parseFloat(inp?.value), cur = globalState.voti[naz][gId][nome] || {};
    if (isSV) globalState.voti[naz][gId][nome] = { sv: true, flags: cur.flags || {} };
    else if (!isNaN(v)) globalState.voti[naz][gId][nome] = { v, sv: false, flags: cur.flags || {} };
  });
  saveGlobalState(); toast(`✓ Voti salvati – ${naz}, ${GIORNATE[gId]}`);
}

// ════════════════════════════════════════════════════════════
// LOBBY + AUTH UI
// ════════════════════════════════════════════════════════════

function generateLegaId() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let id = '';
  for (let i = 0; i < 6; i++) id += c[Math.floor(Math.random() * c.length)];
  return id;
}


// ── Validazione nome lega ──────────────────────────────────────────
const LEGA_BLACKLIST = [
  // Bestemmie e varianti comuni
  "porco","porca","gesù","gesu","cristo","dio","madonnina","madonna","cazzo","vaffanculo",
  "vaffan","fanculo","stronzo","stronza","coglione","coglioni","minchia","minchione",
  "bastardo","bastarda","figlio di puttana","puttana","troia","troie","merda","culo",
  "deficiente","idiota","imbecille","ritardato","ritardata","scemo","scema",
  "negro","negra","negri","nigger","frocio","froci","culattone","recchione",
  "nazista","hitler","fascista","kk","kkk",
  // Varianti con numeri
  "c4zzo","m3rda","str0nzo","c0glione","v4ff"
];

function validaNomeLega(nome) {
  if (!nome || nome.trim().length === 0) return "Inserisci il nome della lega!";
  const n = nome.trim();
  if (n.length < 3) return "Il nome deve avere almeno 3 caratteri.";
  if (n.length > 40) return "Il nome non può superare 40 caratteri.";
  // Solo lettere (incluse accentate), numeri, spazi e pochi caratteri speciali
  if (!/^[a-zA-ZàáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝ0-9 _\-\.!']+$/.test(n)) {
    return "Il nome contiene caratteri non ammessi. Usa solo lettere, numeri e _ - . ! '";
  }
  // Blacklist parole vietate
  const lower = n.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  for (const parola of LEGA_BLACKLIST) {
    if (lower.includes(parola.replace(/[^a-z0-9]/g, ''))) {
      return "Il nome contiene parole non consentite. Scegli un nome diverso.";
    }
  }
  return null; // OK
}
// ──────────────────────────────────────────────────────────────────
async function creaLega(nome, pubblica, codice) {
  const erroreNome = validaNomeLega(nome);
  if (erroreNome) { toast(erroreNome, true); return null; }
  if (!window._fbReady || !window._db) { toast("Firebase non connesso!", true); return null; }
  const legaId = generateLegaId();
  const uid = currentUser?.uid || null;
  const meta = { nome, pubblica, createdAt: Date.now(), adminUid: uid,
    codice: pubblica ? null : (codice || legaId) };
  const ls = defaultLegaState();
  try {
    await window._set(window._ref(window._db, "leghe/" + legaId + "/meta"), meta);
    await window._set(window._ref(window._db, "leghe/" + legaId + "/state"), ls);
    if (uid) await addLegaToUser(uid, legaId, nome);
    return { legaId, meta };
  } catch(e) { toast("Errore: " + e.message, true); return null; }
}

function isCreatoreCorrente() {
  return !!(currentUser && currentLegaMeta && currentLegaMeta.adminUid === currentUser.uid);
}

function aggiornaTabAdmin() {
  const adminBtn = document.querySelector(".nav-btn[data-page='admin']");
  if (!adminBtn) return;
  adminBtn.style.display = isCreatoreCorrente() ? "" : "none";
}

function entraInLega(legaId, legaState, legaMeta) {
  currentLegaId = legaId; currentLegaMeta = legaMeta || null;
  state = sanitizeLegaState(legaState);
  localStorage.setItem("fsa_lega_" + legaId, JSON.stringify(state));
  localStorage.setItem("fsa_lastLega", legaId);
  if (legaMeta) localStorage.setItem("fsa_lastLegaMeta", JSON.stringify(legaMeta));
  // Update URL
  history.pushState(null, '', '?lega=' + legaId);
  const navLinks = document.querySelector(".nav-links");
  const hamburger = document.getElementById("hamburger");
  if (navLinks) navLinks.style.display = "";
  if (hamburger) hamburger.style.display = "";
  // Auto-sblocco admin per il creatore della lega
  if (isCreatoreCorrente()) {
    adminUnlocked = true;
    ["adminLockIcon","adminLockIconMobile"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="🔓";});
  } else {
    adminUnlocked = false;
    ["adminLockIcon","adminLockIconMobile"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="🔒";});
  }
  aggiornaTabAdmin();
  // Add to user leghe if logged in
  if (currentUser) addLegaToUser(currentUser.uid, legaId, legaMeta?.nome || legaId);
  listenGlobal(); listenLega(legaId);
  navigate("home");
}

function exitLega() {
  currentLegaId = null; currentLegaMeta = null;
  state = defaultLegaState();
  adminUnlocked = false; votiUnlocked = false; superadminUnlocked = false;
  aggiornaTabAdmin();
  localStorage.removeItem("fsa_lastLega"); localStorage.removeItem("fsa_lastLegaMeta");
  history.pushState(null, '', location.pathname);
  const navLinks = document.querySelector(".nav-links");
  const hamburger = document.getElementById("hamburger");
  if (navLinks) navLinks.style.display = "none";
  if (hamburger) hamburger.style.display = "none";
  const banner = document.getElementById("legaInfoBanner");
  if (banner) { banner.style.display = "none"; banner.innerHTML = ""; }
  showLobby();
}

function showLobby() {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const lobby = document.getElementById("page-lobby");
  if (lobby) { lobby.classList.add("active"); lobby.style.display = "block"; }
  const navLinks = document.querySelector(".nav-links");
  const hamburger = document.getElementById("hamburger");
  if (navLinks) navLinks.style.display = "none";
  if (hamburger) hamburger.style.display = "none";
  renderLobby();
}

function renderLobby() {
  const wrap = document.getElementById("lobbyWrap"); if (!wrap) return;
  wrap.innerHTML = '<div class="lobby-loading">⏳ Caricamento...</div>';

  function buildLobby(leghe) {
    const user = currentUser;
    const pubbliche = Object.entries(leghe).filter(([,l]) => l.meta?.pubblica);

    let html = '';

    // ── Auth section ──
    if (user) {
      html += `<div class="lobby-section lobby-user-section">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span>👤 <strong>${user.displayName || user.email}</strong></span>
          <button class="btn-sec" id="btnSignOut" style="font-size:12px;padding:5px 12px">Esci dall'account</button>
        </div>
      </div>`;

      // User's leagues
      const userLegheIds = Object.keys(currentUser._leghe || {});
      const userLeghe = Object.entries(leghe).filter(([id]) => userLegheIds.includes(id));
      if (userLeghe.length) {
        html += `<div class="lobby-section"><h3>🏆 Le tue Leghe</h3><div class="leghe-grid">`;
        html += userLeghe.map(([id, l]) => `
          <div class="lega-card">
            <div class="lega-card-name">${l.meta?.nome || id}</div>
            <div class="lega-card-badge">${l.meta?.pubblica ? "🌍 Pubblica" : "🔒 Privata"}</div>
            ${l.meta?.adminUid === user.uid ? '<div style="font-size:10px;color:var(--accent);font-weight:700">👑 Admin</div>' : ''}
            <button class="btn-primary lega-join-btn" data-id="${id}">Entra →</button>
          </div>`).join('');
        html += '</div></div>';
      }
    } else {
      // Auth forms — shown when not logged in
      html += `<div class="lobby-section lobby-auth-section">
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Accedi</button>
          <button class="auth-tab" data-tab="register">Registrati</button>
        </div>
        <div id="authTabLogin" class="auth-form">
          <div class="field-group"><label>Email</label><input type="email" id="loginEmail" placeholder="tua@email.com" autocomplete="email"></div>
          <div class="field-group"><label>Password</label><input type="password" id="loginPwd" placeholder="Password" autocomplete="current-password"></div>
          <button class="btn-primary" id="btnLogin" style="width:100%">Accedi</button>
          <p class="pwd-error" id="loginError"></p>
        </div>
        <div id="authTabRegister" class="auth-form" style="display:none">
          <div class="field-group"><label>Nome e Cognome</label><input type="text" id="regNome" placeholder="Es. Mario Rossi" autocomplete="name"></div>
          <div class="field-group"><label>Email</label><input type="email" id="regEmail" placeholder="tua@email.com" autocomplete="email"></div>
          <div class="field-group"><label>Password</label><input type="password" id="regPwd" placeholder="Min 6 caratteri" autocomplete="new-password"></div>
          <button class="btn-primary" id="btnRegister" style="width:100%">Crea account</button>
          <p class="pwd-error" id="regError"></p>
        </div>
      </div>`;
    }

    // ── Superadmin access ──
    html += `<div class="lobby-section lobby-super-section">
      <button class="btn-sec lobby-super-btn" id="btnSuperToggle">⚡ Accesso Superadmin</button>
      <div id="superLoginForm" style="display:none;margin-top:12px">
        <div class="lobby-form">
          <input type="password" id="superPwdInput" placeholder="Password superadmin..." style="flex:1">
          <button class="btn-primary" id="btnSuperSubmit">Accedi</button>
        </div>
        <p class="pwd-error" id="superPwdError"></p>
      </div>
    </div>`;

    // ── Public leagues, join private, create — only when logged in ──
    if (user) {
      if (pubbliche.length) {
        html += `<div class="lobby-section"><h3>🌍 Leghe Pubbliche</h3><div class="leghe-grid">`;
        html += pubbliche.map(([id, l]) => `
          <div class="lega-card">
            <div class="lega-card-name">${l.meta?.nome || id}</div>
            <div class="lega-card-badge">🌍 Pubblica</div>
            <button class="btn-primary lega-join-btn" data-id="${id}">Entra →</button>
          </div>`).join('');
        html += '</div></div>';
      }

      html += `<div class="lobby-section">
        <h3>🔒 Entra in una Lega Privata</h3>
        <div class="lobby-form">
          <input type="text" id="legaCodiceInput" placeholder="Codice lega (es. ABC123)" maxlength="10" style="text-transform:uppercase;flex:1">
          <button class="btn-primary" id="btnEntraPrivata">Entra →</button>
        </div>
        <p class="pwd-error" id="legaCodiceError"></p>
      </div>`;

      html += `<div class="lobby-section">
        <h3>➕ Crea una Nuova Lega</h3>
        <div class="lobby-form-grid">
          <div class="field-group"><label>Nome lega</label><input type="text" id="newLegaNome" placeholder="Es. Lega degli Amici"></div>
          <div class="field-group"><label>Tipo</label>
            <select id="newLegaTipo"><option value="pubblica">🌍 Pubblica</option><option value="privata">🔒 Privata</option></select>
          </div>
          <div class="field-group" id="codiceGroup" style="display:none"><label>Codice accesso</label><input type="text" id="newLegaCodice" placeholder="Es. AMICI1" maxlength="10"></div>
        </div>
        <button class="btn-primary" id="btnCreaLega" style="margin-top:14px">🏆 Crea Lega</button>
        <p class="parse-result" id="creaLegaResult"></p>
      </div>`;
    } else {
      html += `<div class="lobby-section" style="text-align:center;color:var(--text2)">
        <p style="font-size:14px">👆 Accedi o registrati per creare e unirti alle leghe.</p>
      </div>`;
    }

    wrap.innerHTML = html;

    // ── Bind auth ──
    wrap.querySelectorAll(".auth-tab").forEach(tab => {
      tab.addEventListener("click", function() {
        wrap.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
        this.classList.add("active");
        document.getElementById("authTabLogin").style.display = this.dataset.tab === "login" ? "" : "none";
        document.getElementById("authTabRegister").style.display = this.dataset.tab === "register" ? "" : "none";
      });
    });

    document.getElementById("btnLogin")?.addEventListener("click", async () => {
      const email = document.getElementById("loginEmail").value.trim();
      const pwd = document.getElementById("loginPwd").value;
      const err = document.getElementById("loginError");
      if (!email || !pwd) { err.textContent = "Compila tutti i campi!"; return; }
      document.getElementById("btnLogin").textContent = "⏳...";
      const res = await signIn(email, pwd);
      document.getElementById("btnLogin").textContent = "Accedi";
      if (res.error) { err.textContent = res.error; return; }
      // onAuthStateChanged will re-render lobby with user's leghe
      // If user has a last lega, auto-enter it
      const lastLega = localStorage.getItem("fsa_lastLega");
      if (lastLega && window._fbReady && window._db) {
        window._onVal(window._ref(window._db,"leghe/"+lastLega), snap=>{
          const d=snap.val();
          if(d?.state) entraInLega(lastLega,d.state,d.meta);
        },{onlyOnce:true});
      }
    });
    document.getElementById("loginPwd")?.addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("btnLogin")?.click(); });

    document.getElementById("btnRegister")?.addEventListener("click", async () => {
      const nome = document.getElementById("regNome").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const pwd = document.getElementById("regPwd").value;
      const err = document.getElementById("regError");
      if (!nome || !email || !pwd) { err.textContent = "Compila tutti i campi!"; return; }
      document.getElementById("btnRegister").textContent = "⏳...";
      const res = await signUp(email, pwd, nome);
      document.getElementById("btnRegister").textContent = "Crea account";
      if (res.error) { err.textContent = res.error; }
    });

    document.getElementById("btnSignOut")?.addEventListener("click", async () => {
      await signOut(); currentUser = null; renderLobby();
    });

    // ── Superadmin ──
    document.getElementById("btnSuperToggle")?.addEventListener("click", () => {
      const f = document.getElementById("superLoginForm");
      f.style.display = f.style.display === "none" ? "block" : "none";
    });
    document.getElementById("btnSuperSubmit")?.addEventListener("click", async () => {
      const val = document.getElementById("superPwdInput").value;
      const hash = await sha256(val);
      if (hash === SUPERADMIN_PWD_HASH) {
        superadminUnlocked = true;
        // Show nav
        const nl=document.querySelector(".nav-links"); if(nl) nl.style.display="";
        const hb=document.getElementById("hamburger"); if(hb) hb.style.display="";
        // Hide lobby explicitly
        const lobby=document.getElementById("page-lobby");
        if(lobby){lobby.classList.remove("active");lobby.style.display="none";}
        // Navigate to superadmin
        navigate("superadmin");
      } else { document.getElementById("superPwdError").textContent = "❌ Password errata"; }
    });
    document.getElementById("superPwdInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") document.getElementById("btnSuperSubmit")?.click();
    });

    // ── Join buttons ──
    wrap.querySelectorAll(".lega-join-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        const id = this.dataset.id; this.textContent = "⏳..."; this.disabled = true;
        window._onVal(window._ref(window._db, "leghe/" + id), snap => {
          const d = snap.val();
          if (d?.state) entraInLega(id, d.state, d.meta);
          else toast("Lega non trovata!", true);
        }, { onlyOnce: true });
      });
    });

    // ── Join private ──
    document.getElementById("btnEntraPrivata")?.addEventListener("click", () => {
      const codice = document.getElementById("legaCodiceInput").value.trim().toUpperCase();
      const errEl = document.getElementById("legaCodiceError");
      if (!codice) { errEl.textContent = "Inserisci un codice!"; return; }
      errEl.textContent = "⏳ Ricerca...";
      window._onVal(window._ref(window._db, "leghe/" + codice), snap => {
        const d = snap.val();
        if (d?.state) { entraInLega(codice, d.state, d.meta); return; }
        window._onVal(window._ref(window._db, "leghe"), allSnap => {
          const all = allSnap.val() || {};
          const found = Object.entries(all).find(([,l]) => l.meta?.codice?.toUpperCase() === codice);
          if (found) entraInLega(found[0], found[1].state, found[1].meta);
          else errEl.textContent = "❌ Codice non trovato.";
        }, { onlyOnce: true });
      }, { onlyOnce: true });
    });
    document.getElementById("legaCodiceInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") document.getElementById("btnEntraPrivata")?.click();
    });

    // ── Create ──
    document.getElementById("newLegaTipo")?.addEventListener("change", function() {
      document.getElementById("codiceGroup").style.display = this.value === "privata" ? "" : "none";
    });
    document.getElementById("btnCreaLega")?.addEventListener("click", async () => {
      const nome = document.getElementById("newLegaNome").value.trim();
      const tipo = document.getElementById("newLegaTipo").value;
      const codice = document.getElementById("newLegaCodice")?.value.trim().toUpperCase();
      const res = document.getElementById("creaLegaResult");
      const errNome = validaNomeLega(nome);
      if (errNome) { res.style.color = "var(--red)"; res.textContent = errNome; return; }
      const btn = document.getElementById("btnCreaLega");
      btn.disabled = true; btn.textContent = "⏳ Creazione...";
      const result = await creaLega(nome, tipo === "pubblica", codice);
      btn.disabled = false; btn.textContent = "🏆 Crea Lega";
      if (result) {
        const { legaId, meta } = result;
        const link = `${location.origin}${location.pathname}?lega=${legaId}`;
        res.style.color = "var(--green)";
        res.innerHTML = `✓ Creata! Codice: <strong>${legaId}</strong><br>
          <small><a href="${link}" style="color:var(--accent)">${link}</a>
          <button class="btn-sec" style="font-size:10px;padding:2px 7px;margin-left:6px"
            onclick="navigator.clipboard.writeText('${link}').then(()=>toast('Copiato!'))">📋</button></small>`;
        setTimeout(() => entraInLega(legaId, defaultLegaState(), meta), 1500);
      }
    });
  }

  if (window._fbReady && window._db) {
    // Load user leghe if logged in
    if (currentUser) {
      window._onVal(window._ref(window._db, "users/" + currentUser.uid + "/leghe"), snap => {
        currentUser._leghe = snap.val() || {};
        window._onVal(window._ref(window._db, "leghe"), allSnap => {
          buildLobby(allSnap.val() || {});
        }, { onlyOnce: true });
      }, { onlyOnce: true });
    } else {
      window._onVal(window._ref(window._db, "leghe"), snap => buildLobby(snap.val() || {}), { onlyOnce: true });
    }
  } else {
    buildLobby({});
  }
}

function checkUrlLega() {
  const params = new URLSearchParams(location.search);
  const legaId = params.get("lega")?.toUpperCase();
  if (legaId && window._fbReady && window._db) {
    window._onVal(window._ref(window._db, "leghe/" + legaId), snap => {
      const d = snap.val();
      if (d?.state) entraInLega(legaId, d.state, d.meta);
      else showLobby();
    }, { onlyOnce: true });
    return true;
  }
  const lastLega = localStorage.getItem("fsa_lastLega");
  if (lastLega) {
    const cached = localStorage.getItem("fsa_lega_" + lastLega);
    const cachedMeta = localStorage.getItem("fsa_lastLegaMeta");
    if (cached) {
      try {
        entraInLega(lastLega, JSON.parse(cached), cachedMeta ? JSON.parse(cachedMeta) : null);
        if (window._fbReady && window._db) {
          window._onVal(window._ref(window._db, "leghe/" + lastLega + "/state"), snap => {
            const s = snap.val();
            if (s && (s._updatedAt || 0) > (state._updatedAt || 0)) {
              state = sanitizeLegaState(s); saveLocalOnly(); renderPage(currentPage());
            }
          }, { onlyOnce: true });
        }
        return true;
      } catch(e) {}
    }
  }
  return false;
}


// ── SUPERADMIN MODAL ──
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnNavSuperadmin")?.addEventListener("click", () => {
    document.getElementById("superadminModal").style.display = "flex";
    setTimeout(() => document.getElementById("superModalPwd")?.focus(), 50);
  });
  document.getElementById("btnSuperModalSubmit")?.addEventListener("click", async () => {
    const val = document.getElementById("superModalPwd").value;
    const hash = await sha256(val);
    if (hash === SUPERADMIN_PWD_HASH) {
      superadminUnlocked = true;
      document.getElementById("superadminModal").style.display = "none";
      document.getElementById("superModalPwd").value = "";
      // Show nav tabs for superadmin
      document.getElementById("navLinks").style.display = "";
      document.getElementById("hamburger").style.display = "";
      navigate("superadmin");
    } else {
      document.getElementById("superModalErr").textContent = "❌ Password errata";
    }
  });
  document.getElementById("superModalPwd")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("btnSuperModalSubmit")?.click();
  });
});
// ── INIT ──────────────────────────────────────────────────────
// Start on home page — nav tabs hidden until inside a lega
const _navL = document.querySelector(".nav-links");
const _hamb = document.getElementById("hamburger");
if (_navL) _navL.style.display = "none";
if (_hamb) _hamb.style.display = "none";

function startApp() {
  listenGlobal();
  if (window._fbReady && window._db) {
    window._onVal(window._ref(window._db,"global"), snap=>{
      const d=snap.val();
      if(d&&(d._updatedAt||0)>(globalState._updatedAt||0)){
        globalState=sanitizeGlobalState(d);
        localStorage.setItem("fsa_global",JSON.stringify(globalState));
      }
      // Check URL for lega param
      if(!checkUrlLega()){
        // Show home page
        renderHomeButtons();
        navigate("home");
      }
    },{onlyOnce:true});
  } else {
    if(!checkUrlLega()){ renderHomeButtons(); navigate("home"); }
  }
}

function initAuth() {
  if(!window._fbAuth){startApp();return;}
  import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js").then(({onAuthStateChanged})=>{
    onAuthStateChanged(window._fbAuth, user=>{
      currentUser=user;
      if(!currentLegaId){
        renderHomeButtons();
        renderSidebar();
      }
    });
  }).catch(()=>startApp());
}

// First load
setTimeout(()=>{
  if(window._fbReady) { initAuth(); startApp(); }
  else{
    const chk=setInterval(()=>{if(window._fbReady){clearInterval(chk);initAuth();startApp();}},200);
    setTimeout(()=>{clearInterval(chk);if(!currentLegaId){renderHomeButtons();navigate("home");}},4000);
  }
},80);


// ── GIOCATORI TAB ────────────────────────────────────────────
let _giocFiltroRuolo = "tutti";
let _giocSearchVal   = "";

function renderGiocatoriPage() {
  const db = globalState.giocatoriSquadra || {};
  const isEmpty = Object.keys(db).length === 0;

  // Toolbar listeners (una sola volta)
  const searchEl = document.getElementById("giocatoriSearch");
  const filtBtns  = document.querySelectorAll(".gioc-filtro-btn");

  if (searchEl && !searchEl.dataset.bound) {
    searchEl.dataset.bound = "1";
    searchEl.addEventListener("input", () => {
      _giocSearchVal = searchEl.value.trim().toLowerCase();
      _renderGiocTabellone();
    });
  }
  filtBtns.forEach(btn => {
    if (!btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        _giocFiltroRuolo = btn.dataset.ruolo;
        filtBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        _renderGiocTabellone();
      });
    }
  });

  if (isEmpty) {
    document.getElementById("giocatoriTabellone").innerHTML =
      `<div class="gioc-empty"><span class="material-symbols-outlined" style="font-size:48px;color:var(--text2)">sports_soccer</span>
       <p>Nessun giocatore nel database.<br><span style="font-size:13px;color:var(--text2)">Il superadmin deve caricare il CSV dei giocatori.</span></p></div>`;
    document.getElementById("giocatoriCount").textContent = "";
    return;
  }

  _renderGiocTabellone();
}

function _renderGiocTabellone() {
  const db     = globalState.giocatoriSquadra || {};
  const ruolo  = _giocFiltroRuolo;
  const search = _giocSearchVal;
  const wrap   = document.getElementById("giocatoriTabellone");
  if (!wrap) return;

  const RUOLO_LABEL = { P:"Portiere", D:"Difensore", C:"Centrocampista", A:"Attaccante" };
  const RUOLO_ICON  = { P:"🧤", D:"🛡", C:"⚙️", A:"⚽" };
  const ordine      = { P:0, D:1, C:2, A:3 };

  let totalCount = 0;
  let html = "";

  // Squadre in ordine alfabetico
  const squadreOrdinate = Object.keys(db).sort((a,b) => a.localeCompare(b));

  squadreOrdinate.forEach(squadra => {
    const giocatori = (db[squadra] || []).filter(g => {
      const matchRuolo  = ruolo === "tutti" || g.ruolo === ruolo;
      const matchSearch = !search ||
        g.nome.toLowerCase().includes(search) ||
        squadra.toLowerCase().includes(search);
      return matchRuolo && matchSearch;
    });

    if (giocatori.length === 0) return;
    totalCount += giocatori.length;

    // Ordina: P → D → C → A, poi alfabetico per nome
    giocatori.sort((a,b) => (ordine[a.ruolo]??9) - (ordine[b.ruolo]??9) || a.nome.localeCompare(b.nome));

    html += `<div class="gioc-squadra-card">
      <div class="gioc-squadra-header">${squadra}</div>
      <div class="gioc-players-list">
        ${giocatori.map(g => `
          <div class="gioc-player-row gioc-role-${g.ruolo.toLowerCase()}">
            <span class="gioc-role-badge">${RUOLO_ICON[g.ruolo] || g.ruolo}</span>
            <span class="gioc-player-name">${g.nome}</span>
            <span class="gioc-role-label">${RUOLO_LABEL[g.ruolo] || g.ruolo}</span>
          </div>`).join("")}
      </div>
    </div>`;
  });

  if (!html) {
    wrap.innerHTML = `<div class="gioc-empty"><span class="material-symbols-outlined" style="font-size:40px;color:var(--text2)">search_off</span><p>Nessun risultato trovato.</p></div>`;
  } else {
    wrap.innerHTML = `<div class="gioc-squadre-grid">${html}</div>`;
  }

  const countEl = document.getElementById("giocatoriCount");
  if (countEl) countEl.textContent = totalCount > 0 ? `${totalCount} giocator${totalCount===1?"e":"i"}` : "";
}


// ── LA MIA SQUADRA ───────────────────────────────────────────
const ROSA_REQUISITI = { P:3, D:6, C:6, A:5 };
const ROSA_TOTALE    = 20; // 3+6+6+5
const DEADLINE_ISO   = "2025-01-01T00:00:00Z"; // Nessuna deadline — modifica sempre abilitata

function isDeadlinePassata() {
  return Date.now() >= new Date(DEADLINE_ISO).getTime();
}

// Stato locale del costruttore (non salvato finché non si preme Salva)
let _squadraBozza    = null; // {P:[{nome,nazione}], D:[...], C:[...], A:[...]}
let _squadraBozzaCap = null; // {nome, nazione, ruolo}
let _squadraFiltroRuolo = "P";
let _squadraSearch = "";
let _timerInterval = null;

function renderSquadraPage() {
  const wrap = document.getElementById("squadraContent");
  if (!wrap) return;

  if (!currentUser) {
    wrap.innerHTML = `<div class="gioc-empty">
      <span class="material-symbols-outlined" style="font-size:48px;color:var(--text2)">lock</span>
      <p>Devi essere registrato e in una lega per costruire la tua squadra.</p>
    </div>`;
    return;
  }

  const db = globalState.giocatoriSquadra || {};
  if (Object.keys(db).length === 0) {
    wrap.innerHTML = `<div class="gioc-empty">
      <span class="material-symbols-outlined" style="font-size:48px;color:var(--text2)">sports_soccer</span>
      <p>Il database giocatori non è ancora stato caricato.<br>
      <span style="font-size:13px;color:var(--text2)">Attendi che il superadmin carichi il CSV dei giocatori.</span></p>
    </div>`;
    return;
  }

  // Carica rosa salvata dell'utente (se esiste già come partecipante)
  const partId = _getMyPartId();
  const rosaSalvata = partId ? (state.rose[partId] || null) : null;

  // Inizializza bozza dalla rosa salvata o vuota
  if (!_squadraBozza) {
    _squadraBozza = rosaSalvata
      ? JSON.parse(JSON.stringify(rosaSalvata))
      : { P:[], D:[], C:[], A:[] };
    // Carica capitano salvato
    const partIdCap = _getMyPartId();
    const partCap   = partIdCap ? state.partecipanti.find(p => p.id === partIdCap) : null;
    if (partCap?.capitanoGiocatore && !_squadraBozzaCap) {
      // Trova nome+nazione+ruolo dalla bozza
      for (const [r, arr] of Object.entries(_squadraBozza)) {
        if (r === 'A') continue;
        const found = arr.find(g => g.nome === partCap.capitanoGiocatore);
        if (found) { _squadraBozzaCap = { ...found, ruolo: r }; break; }
      }
    }
  }

  const deadline = isDeadlinePassata();

  wrap.innerHTML = `
    <div class="squadra-header-row">
      <div>
        <h1 style="margin:0;font-size:22px"><span class="material-symbols-outlined header-icon">shield</span> La mia Squadra</h1>
        <p class="subtitle" style="margin:4px 0 0">Scegli un giocatore per ogni squadra · 3P · 6D · 6C · 5A · max 1 per squadra</p>
      </div>
      <div id="squadraTimerWrap" class="squadra-timer-wrap"></div>
    </div>

    <div class="squadra-progress-bar-wrap">
      <div class="squadra-req-row" id="squadraReqRow"></div>
      <div class="squadra-save-row">
        ${deadline
          ? `<span style="color:var(--red);font-size:13px">⏱ Deadline scaduta – la squadra non è più modificabile.</span>`
          : `<button class="btn-primary" id="btnSalvaSquadra" disabled>💾 Salva Squadra</button>
             <button class="btn-sec" id="btnResetBozza">↺ Ripristina salvata</button>`
        }
      </div>
    </div>

    ${deadline ? '' : `
    <div class="squadra-builder">
      <div class="squadra-picker-panel">
        <div class="squadra-picker-toolbar">
          <div class="giocatori-filtri" style="margin-bottom:8px">
            ${Object.entries(ROSA_REQUISITI).map(([r,n]) =>
              `<button class="gioc-filtro-btn squadra-tab-btn ${r===_squadraFiltroRuolo?'active':''}" data-srole="${r}">
                ${_ruoloIcon(r)} ${r} <span class="squadra-tab-badge" id="sbadge-${r}"></span>
              </button>`
            ).join('')}
          </div>
          <div class="giocatori-search-wrap" style="margin-bottom:0">
            <span class="material-symbols-outlined" style="color:var(--text2);font-size:18px">search</span>
            <input type="text" id="squadraSearchInput" placeholder="Cerca..." autocomplete="off" value="${_squadraSearch}">
          </div>
        </div>
        <div id="squadraPickerList" class="squadra-picker-list"></div>
      </div>

      <div class="squadra-rosa-panel">
        <div class="squadra-rosa-tabs">
          ${Object.entries(ROSA_REQUISITI).map(([r,n]) =>
            `<button class="squadra-rosa-tab ${r===_squadraFiltroRuolo?'active':''}" data-rrole="${r}">
              ${_ruoloIcon(r)} ${r}
              <span class="squadra-rosa-tab-count" id="rcount-${r}">0/${n}</span>
            </button>`
          ).join('')}
        </div>
        <div id="squadraRosaList" class="squadra-rosa-list"></div>
        <div id="squadraCapSection" class="squadra-cap-section" style="display:none">
          <div class="squadra-cap-header">
            <span>⭐ Capitano</span>
            <span class="squadra-cap-hint">Solo P/D/C · bonus +2 se voto ≥ 7</span>
          </div>
          <div id="squadraCapList" class="squadra-cap-list"></div>
        </div>
      </div>
    </div>`}

    ${deadline ? `<div class="squadra-rosa-solo" id="squadraRosaSolo"></div>` : ''}
  `;

  _startTimer();
  _renderSquadraUI();
  _bindSquadraEvents(deadline);
}

function _getMyPartId() {
  if (!currentUser || !Array.isArray(state.partecipanti)) return null;
  const uid = currentUser.uid;
  const byUid  = state.partecipanti.find(p => p.uid === uid);
  if (byUid) return byUid.id;
  // fallback: cerca per displayName
  const nome = currentUser.displayName || currentUser.email?.split('@')[0] || "Giocatore";
  const byNome = state.partecipanti.find(p => p.nome === nome);
  return byNome ? byNome.id : null;
}

function _ruoloIcon(r) {
  return {P:'🧤',D:'🛡',C:'⚙️',A:'⚽'}[r] || r;
}

function _ruoloLabel(r) {
  return {P:'Portiere',D:'Difensore',C:'Centrocampista',A:'Attaccante'}[r] || r;
}

function _renderSquadraUI() {
  _renderSquadraReqRow();
  _renderSquadraPicker();
  _renderSquadraRosa();
  _renderSquadraBadges();
  _renderSquadraCapitano();
}

function _renderSquadraReqRow() {
  const el = document.getElementById("squadraReqRow");
  if (!el) return;
  const bozza = _squadraBozza || {P:[],D:[],C:[],A:[]};
  let totOk = 0;
  el.innerHTML = Object.entries(ROSA_REQUISITI).map(([r,n]) => {
    const cnt = (bozza[r]||[]).length;
    const ok  = cnt === n;
    if (ok) totOk++;
    return `<span class="squadra-req-pill ${ok?'ok':cnt>0?'partial':''}">
      ${_ruoloIcon(r)} ${cnt}/${n}
    </span>`;
  }).join('');

  // Abilita/disabilita salva
  const btnSalva = document.getElementById("btnSalvaSquadra");
  if (btnSalva) btnSalva.disabled = totOk < 4;
}

function _renderSquadraBadges() {
  const bozza = _squadraBozza || {P:[],D:[],C:[],A:[]};
  Object.entries(ROSA_REQUISITI).forEach(([r,n]) => {
    const cnt = (bozza[r]||[]).length;
    ['sbadge-','rcount-'].forEach((pfx,i) => {
      const el = document.getElementById(pfx+r);
      if (!el) return;
      if (i===0) el.textContent = cnt > 0 ? cnt : '';
      else       el.textContent = `${cnt}/${n}`;
    });
  });
}

function _renderSquadraPicker() {
  const listEl = document.getElementById("squadraPickerList");
  if (!listEl) return;
  const ruolo  = _squadraFiltroRuolo;
  const search = _squadraSearch.toLowerCase();
  const db     = globalState.giocatoriSquadra || {};
  const bozza  = _squadraBozza || {P:[],D:[],C:[],A:[]};
  const req     = ROSA_REQUISITI[ruolo];

  // Squadre già usate nel ruolo attivo
  const nazUsate = new Set((bozza[ruolo]||[]).map(g => g.nazione));
  // Tutte le nazioni già usate (uno per squadra globale)
  const nazUsateAll = new Set(
    Object.values(bozza).flat().map(g => g.nazione)
  );

  // Raccogli giocatori del ruolo da tutte le squadre
  const items = [];
  Object.entries(db).forEach(([squadra, giocatori]) => {
    giocatori.filter(g => g.ruolo === ruolo).forEach(g => {
      items.push({ nome:g.nome, nazione:squadra });
    });
  });

  // Filtra per search
  const filtered = search
    ? items.filter(g => g.nome.toLowerCase().includes(search) || g.nazione.toLowerCase().includes(search))
    : items;

  // Ordina: disponibili prima, poi per squadra, poi per nome
  filtered.sort((a,b) => {
    const aUsata = nazUsateAll.has(a.nazione);
    const bUsata = nazUsateAll.has(b.nazione);
    if (aUsata !== bUsata) return aUsata ? 1 : -1;
    return a.nazione.localeCompare(b.nazione) || a.nome.localeCompare(b.nome);
  });

  const cnt = (bozza[ruolo]||[]).length;
  const pieno = cnt >= req;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="gioc-empty" style="padding:30px"><p>Nessun giocatore trovato.</p></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(g => {
    const inRosa    = (bozza[ruolo]||[]).some(x => x.nome===g.nome && x.nazione===g.nazione);
    const nazBlocca = !inRosa && nazUsateAll.has(g.nazione); // squadra già usata altrove
    const disabled  = !inRosa && (pieno || nazBlocca);
    let cls = 'squadra-picker-item';
    if (inRosa)    cls += ' selected';
    if (nazBlocca) cls += ' blocked';
    if (disabled && !inRosa) cls += ' disabled';

    const tooltip = inRosa ? 'Rimuovi dalla rosa'
      : nazBlocca ? `Hai già un giocatore di ${g.nazione}`
      : pieno     ? `Hai già ${req} ${_ruoloLabel(ruolo).toLowerCase()}i`
      : 'Aggiungi alla rosa';

    return `<div class="${cls}" title="${tooltip}"
      data-nome="${g.nome.replace(/"/g,'&quot;')}" data-naz="${g.nazione.replace(/"/g,'&quot;')}"
      data-ruolo="${ruolo}" ${disabled?'data-disabled="1"':''}>
      <span class="squadra-picker-naz">${g.nazione}</span>
      <span class="squadra-picker-nome">${g.nome}</span>
      ${inRosa ? '<span class="squadra-picker-check">✓</span>' : ''}
    </div>`;
  }).join('');
}

function _renderSquadraRosa() {
  const listEl = document.getElementById("squadraRosaList");
  if (!listEl) return;
  const ruolo = _squadraFiltroRuolo;
  const bozza = _squadraBozza || {P:[],D:[],C:[],A:[]};
  const arr   = bozza[ruolo] || [];

  if (!arr.length) {
    listEl.innerHTML = `<div class="squadra-rosa-empty">Nessun ${_ruoloLabel(ruolo).toLowerCase()} selezionato</div>`;
    return;
  }

  listEl.innerHTML = arr.map((g,i) => `
    <div class="squadra-rosa-item">
      <span class="squadra-rosa-num">${i+1}</span>
      <span class="squadra-rosa-naz">${g.nazione}</span>
      <span class="squadra-rosa-nome">${g.nome}</span>
      <button class="squadra-rosa-remove" data-nome="${g.nome.replace(/"/g,'&quot;')}"
        data-naz="${g.nazione.replace(/"/g,'&quot;')}" data-ruolo="${ruolo}" title="Rimuovi">✕</button>
    </div>`).join('');
}

function _renderSquadraCapitano() {
  const section = document.getElementById("squadraCapSection");
  const listEl  = document.getElementById("squadraCapList");
  if (!section || !listEl) return;

  const bozza = _squadraBozza || {P:[],D:[],C:[],A:[]};
  // Tutti i giocatori non-attaccanti selezionati
  const candidati = [
    ...(bozza.P||[]).map(g=>({...g,ruolo:'P'})),
    ...(bozza.D||[]).map(g=>({...g,ruolo:'D'})),
    ...(bozza.C||[]).map(g=>({...g,ruolo:'C'})),
  ];

  if (!candidati.length) { section.style.display = 'none'; return; }
  section.style.display = '';

  const capAttuale = _squadraBozzaCap;

  listEl.innerHTML = candidati.map(g => {
    const isSelected = capAttuale && capAttuale.nome === g.nome && capAttuale.nazione === g.nazione;
    return `<div class="squadra-cap-item ${isSelected ? 'selected' : ''}"
      data-cnome="${g.nome.replace(/"/g,'&quot;')}"
      data-cnaz="${g.nazione.replace(/"/g,'&quot;')}"
      data-cruolo="${g.ruolo}"
      title="${isSelected ? 'Capitano attuale – clicca per rimuovere' : 'Scegli come capitano'}">
      <span class="squadra-cap-icon">${_ruoloIcon(g.ruolo)}</span>
      <span class="squadra-cap-naz">${g.nazione}</span>
      <span class="squadra-cap-nome">${g.nome}</span>
      ${isSelected ? '<span class="squadra-cap-star">⭐</span>' : ''}
    </div>`;
  }).join('');
}

function _bindSquadraEvents(deadline) {
  // Ricerca
  const searchEl = document.getElementById("squadraSearchInput");
  if (searchEl) {
    searchEl.addEventListener("input", () => {
      _squadraSearch = searchEl.value;
      _renderSquadraPicker();
    });
  }

  // Cambia ruolo (tab picker)
  document.querySelectorAll(".squadra-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      _squadraFiltroRuolo = btn.dataset.srole;
      _squadraSearch = "";
      const si = document.getElementById("squadraSearchInput");
      if (si) si.value = "";
      document.querySelectorAll(".squadra-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".squadra-rosa-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(`[data-rrole="${_squadraFiltroRuolo}"]`).forEach(b => b.classList.add("active"));
      _renderSquadraPicker();
      _renderSquadraRosa();
    });
  });

  // Cambia ruolo (tab rosa)
  document.querySelectorAll(".squadra-rosa-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      _squadraFiltroRuolo = btn.dataset.rrole;
      _squadraSearch = "";
      document.querySelectorAll(".squadra-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".squadra-rosa-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(`[data-srole="${_squadraFiltroRuolo}"]`).forEach(b => b.classList.add("active"));
      const si = document.getElementById("squadraSearchInput");
      if (si) si.value = "";
      _renderSquadraPicker();
      _renderSquadraRosa();
    });
  });

  if (deadline) return;

  // Click su giocatore nel picker
  document.getElementById("squadraPickerList")?.addEventListener("click", e => {
    const item = e.target.closest(".squadra-picker-item");
    if (!item || item.dataset.disabled) return;
    const { nome, naz, ruolo } = item.dataset;
    const bozza = _squadraBozza;
    if (!bozza[ruolo]) bozza[ruolo] = [];
    const idx = bozza[ruolo].findIndex(x => x.nome===nome && x.nazione===naz);
    if (idx >= 0) {
      bozza[ruolo].splice(idx, 1); // rimuovi
      // Se era il capitano, azzera
      if (_squadraBozzaCap && _squadraBozzaCap.nome === nome && _squadraBozzaCap.nazione === naz) {
        _squadraBozzaCap = null;
      }
    } else {
      bozza[ruolo].push({ nome, nazione: naz }); // aggiungi
    }
    _renderSquadraUI();
  });

  // Click rimuovi dalla rosa
  document.getElementById("squadraRosaList")?.addEventListener("click", e => {
    const btn = e.target.closest(".squadra-rosa-remove");
    if (!btn) return;
    const { nome, naz, ruolo } = btn.dataset;
    const bozza = _squadraBozza;
    if (!bozza[ruolo]) return;
    bozza[ruolo] = bozza[ruolo].filter(x => !(x.nome===nome && x.nazione===naz));
    // Se il rimosso era il capitano, azzera
    if (_squadraBozzaCap && _squadraBozzaCap.nome === nome && _squadraBozzaCap.nazione === naz) {
      _squadraBozzaCap = null;
    }
    _renderSquadraUI();
  });

  // Click capitano
  document.getElementById("squadraCapList")?.addEventListener("click", e => {
    const item = e.target.closest(".squadra-cap-item");
    if (!item) return;
    const { cnome, cnaz, cruolo } = item.dataset;
    // Toggle: se già capitano, deseleziona
    if (_squadraBozzaCap && _squadraBozzaCap.nome === cnome && _squadraBozzaCap.nazione === cnaz) {
      _squadraBozzaCap = null;
    } else {
      _squadraBozzaCap = { nome: cnome, nazione: cnaz, ruolo: cruolo };
    }
    _renderSquadraCapitano();
  });

  // Salva
  document.getElementById("btnSalvaSquadra")?.addEventListener("click", _salvaSquadra);

  // Ripristina salvata
  document.getElementById("btnResetBozza")?.addEventListener("click", () => {
    const partId = _getMyPartId();
    const rosaSalvata = partId ? (state.rose[partId] || null) : null;
    _squadraBozza = rosaSalvata
      ? JSON.parse(JSON.stringify(rosaSalvata))
      : { P:[], D:[], C:[], A:[] };
    const partReset = _getMyPartId() ? state.partecipanti.find(p => p.id === _getMyPartId()) : null;
    _squadraBozzaCap = null;
    if (partReset?.capitanoGiocatore) {
      for (const [r, arr] of Object.entries(_squadraBozza)) {
        if (r === 'A') continue;
        const found = arr.find(g => g.nome === partReset.capitanoGiocatore);
        if (found) { _squadraBozzaCap = { ...found, ruolo: r }; break; }
      }
    }
    _renderSquadraUI();
    toast("Bozza ripristinata.");
  });
}

async function _salvaSquadra() {
  if (isDeadlinePassata()) { toast("Deadline scaduta!", true); return; }
  const bozza = _squadraBozza;
  // Valida
  for (const [r, n] of Object.entries(ROSA_REQUISITI)) {
    if ((bozza[r]||[]).length !== n) {
      toast(`Servono ${n} ${_ruoloLabel(r).toLowerCase()}${n>1?'i':'e'}! (hai ${(bozza[r]||[]).length})`, true);
      _squadraFiltroRuolo = r;
      _renderSquadraUI();
      return;
    }
  }
  // Controlla 1 giocatore per squadra (globalmente)
  const nazViste = new Map();
  let conflitto = null;
  for (const [r, arr] of Object.entries(bozza)) {
    for (const g of arr) {
      if (nazViste.has(g.nazione)) {
        conflitto = `Hai già un giocatore di ${g.nazione}: ${nazViste.get(g.nazione)} e ${g.nome}!`;
        break;
      }
      nazViste.set(g.nazione, g.nome);
    }
    if (conflitto) break;
  }
  if (conflitto) { toast(conflitto, true); return; }

  // Trova o crea il partecipante associato all'utente
  let partId = _getMyPartId();
  const nome = currentUser.displayName || currentUser.email?.split('@')[0] || "Giocatore";
  if (!partId) {
    // Crea partecipante
    partId = currentUser.uid;
    if (!Array.isArray(state.partecipanti)) state.partecipanti = [];
    state.partecipanti.push({ id: partId, nome, uid: currentUser.uid, capitanoGiocatore: null });
  }

  state.rose[partId] = JSON.parse(JSON.stringify(bozza));
  // Salva capitano
  const part = state.partecipanti.find(p => p.id === partId);
  if (part) part.capitanoGiocatore = _squadraBozzaCap ? _squadraBozzaCap.nome : null;
  syncGiocatori();
  saveState();
  toast("✅ Squadra salvata!");
  // Aggiorna bottone salva
  const btn = document.getElementById("btnSalvaSquadra");
  if (btn) { btn.textContent = "✅ Salvata!"; setTimeout(() => { btn.textContent = "💾 Salva Squadra"; }, 2000); }
}

function _startTimer() {
  if (_timerInterval) clearInterval(_timerInterval);
  const wrap = document.getElementById("squadraTimerWrap");
  if (!wrap) return;

  function updateTimer() {
    const now  = Date.now();
    const dead = new Date(DEADLINE_ISO).getTime();
    const diff = dead - now;
    if (diff <= 0) {
      wrap.innerHTML = `<div class="squadra-timer expired">⏱ Iscrizioni chiuse</div>`;
      clearInterval(_timerInterval);
      return;
    }
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000)  / 60000);
    const secs  = Math.floor((diff % 60000)    / 1000);
    const urgent = diff < 3600000; // < 1 ora
    wrap.innerHTML = `<div class="squadra-timer ${urgent?'urgent':''}">
      ⏱ Chiusura iscrizioni tra
      ${days>0?`<strong>${days}g</strong>`:''}
      <strong>${String(hours).padStart(2,'0')}h</strong>
      <strong>${String(mins).padStart(2,'0')}m</strong>
      <strong>${String(secs).padStart(2,'0')}s</strong>
    </div>`;
  }
  updateTimer();
  _timerInterval = setInterval(updateTimer, 1000);
}
