// ============================================================
// FANTASY ARENA — app.js
// ============================================================

// Lista 20 club Serie A 2026/27 (Monza, Venezia, Frosinone neopromosse)
const SQUADRE = [
  "Atalanta", "Bologna", "Cagliari", "Como", "Fiorentina",
  "Frosinone", "Genoa", "Inter", "Juventus", "Lazio",
  "Lecce", "Milan", "Monza", "Napoli", "Parma",
  "Roma", "Sassuolo", "Torino", "Udinese", "Venezia",
];
const NAZIONALI = SQUADRE; // legacy alias

const RUOLI   = { P:"Portieri", D:"Difensori", C:"Centrocampisti", A:"Attaccanti" };

// Alias nomi club: normalizza varianti CSV/SofaScore → nome canonico
// (da popolare quando si abbinano i nomi SofaScore, es. "AC Milan" → "Milan")
const CLUB_ALIASES = {};
function normalizeClub(n) { return CLUB_ALIASES[n] || n; }
const NAZIONE_ALIASES = CLUB_ALIASES;
function normalizeNazione(n) { return normalizeClub(n); }

// Normalizza chiavi giocatoriSquadra in-memory (fix alias senza riscrivere Firebase)
function normalizeGiocatoriSquadra(obj) {
  if (!obj) return obj;
  for (const [alias, canonical] of Object.entries(NAZIONE_ALIASES)) {
    if (obj[alias]) {
      if (!obj[canonical]) obj[canonical] = [];
      for (const g of obj[alias]) {
        if (!obj[canonical].some(x => x.nome === g.nome)) obj[canonical].push(g);
      }
      delete obj[alias];
    }
  }
  return obj;
}

const SUPERADMIN_PWD_HASH="b056fab42da260419217a7de0a31d107bd6fd385d5b3a03f9f168e7ec90d0d05";
// Gate REALE del pannello superadmin: deve combaciare con l'uid autorizzato a
// scrivere /global nelle regole RTDB. La password da sola (hash nel sorgente)
// non è un confine di sicurezza.
const SUPERADMIN_UID="MUzTsgbmvHOuOc3wEAfNnAeIv4M2";
let superadminUnlocked=false;
let currentLegaId=null;
let currentLegaMeta=null;
let currentUser=null; // Firebase Auth user
// Serie A: 38 giornate di campionato (nessun knockout). Etichette = numero giornata.
const GIORNATE_FALLBACK = Object.fromEntries(Array.from({ length: 38 }, (_, i) => [i + 1, "G" + (i + 1)]));
const GIORNATE = new Proxy({}, { get: (_,id) => { const k="giornate."+id, tv=(typeof t==="function")?t(k):null; return (tv && tv!==k) ? tv : (GIORNATE_FALLBACK[id] || "G"+id); } });
// Opzioni <option> per i menu giornata (38 giornate Serie A)
function giornateOptions(){ return Array.from({length:38},(_,i)=>`<option value="${i+1}">Giornata ${i+1}</option>`).join(""); }

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
function defaultLegaState(){return{partecipanti:[],rose:{},giocatoriSquadra:{},sostituzioni:{},pwdHash:null,deadline:null,_updatedAt:0};}
function defaultGlobalState(){return{voti:{},giornataCorrente:"1",giocatoriSquadra:{},clubEliminati:{},_updatedAt:0};}
function defaultState(){return defaultLegaState();}

// Garantisce che lo state abbia sempre tutti i campi necessari (es. dopo sync Firebase)
function sanitizeLegaState(s){
  if(!s)return defaultLegaState();
  if(!Array.isArray(s.partecipanti))s.partecipanti=[];
  s.partecipanti = s.partecipanti.filter(Boolean); // rimuove null da buchi array Firebase
  if(!s.rose||typeof s.rose!="object")s.rose={};
  if(!s.giocatoriSquadra||typeof s.giocatoriSquadra!="object")s.giocatoriSquadra={};
  normalizeGiocatoriSquadra(s.giocatoriSquadra); // fix alias nomi (es. Congo → RD Congo)
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
  normalizeGiocatoriSquadra(s.giocatoriSquadra); // fix alias nomi (es. Congo → RD Congo)
  // Accetta sia il vecchio formato array sia il nuovo oggetto { club: giornataElim }
  if (Array.isArray(s.clubEliminati)) {
    const migrated = {};
    for (const club of s.clubEliminati) migrated[club] = "8";
    s.clubEliminati = migrated;
  } else if (typeof s.clubEliminati !== "object" || s.clubEliminati === null) {
    s.clubEliminati = {};
  }
  if(!s._updatedAt)s._updatedAt=0;
  return s;
}

// forGiornata: se passato, la nazione è "eliminata" solo nelle giornate successive a quella di eliminazione.
// Se omesso, restituisce true se la nazione è comunque segnata come eliminata (utile per banner globali).
function isClubEliminato(club, forGiornata) {
  const elim = globalState.clubEliminati;
  if (!elim) return false;
  if (Array.isArray(elim)) return elim.includes(club); // legacy
  if (typeof elim !== "object") return false;
  if (!(club in elim)) return false;
  if (forGiornata === undefined || forGiornata === null) return true;
  return Number(forGiornata) > Number(elim[club]);
}
// alias retrocompatibilità
function isNazioneEliminata(naz, forGiornata) { return isClubEliminato(naz, forGiornata); }
function sanitizeState(s){return sanitizeLegaState(s);}

function loadLegaState(id){try{const r=localStorage.getItem("ucl_lega_"+id);if(r)return sanitizeLegaState(JSON.parse(r));}catch(e){}return defaultLegaState();}
function loadGlobalState(){try{const r=localStorage.getItem("ucl_global");if(r)return sanitizeGlobalState(JSON.parse(r));}catch(e){}return defaultGlobalState();}
function loadState(){return defaultLegaState();}

let state=defaultLegaState();
let globalState=loadGlobalState();
let votiUnlocked=false;
let adminUnlocked=false;
let sortBy="totale";

function saveState(){
  state._updatedAt=Date.now();
  if(currentLegaId){try{localStorage.setItem("ucl_lega_"+currentLegaId,JSON.stringify(state));}catch(e){}syncLegaToFirebase();}
}
function saveGlobalState(){
  globalState._updatedAt=Date.now();
  try{localStorage.setItem("ucl_global",JSON.stringify(globalState));}catch(e){}syncGlobalToFirebase();
}
function saveLocalOnly(){if(currentLegaId)try{localStorage.setItem("ucl_lega_"+currentLegaId,JSON.stringify(state));}catch(e){}}

// ── HASH ─────────────────────────────────────────────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}


// ── FIREBASE SYNC con debounce (evita write multipli ravvicinati) ──
// Se l'admin modifica più voti in rapida successione, aspettiamo
// 800ms dall'ultima modifica prima di scrivere su Firebase.
let _fbSyncLegaTimer = null;
let _fbSyncGlobalTimer = null;

function syncLegaToFirebase(){
  if(!window._fbReady||!window._db||!currentLegaId)return;
  clearTimeout(_fbSyncLegaTimer);
  _fbSyncLegaTimer = setTimeout(()=>{
    try{window._set(window._ref(window._db,"leghe/"+currentLegaId+"/state"),state).catch(e=>console.warn("FB:",e));}catch(e){}
  }, 800);
}
function syncGlobalToFirebase(){
  if(!window._fbReady||!window._db)return;
  clearTimeout(_fbSyncGlobalTimer);
  _fbSyncGlobalTimer = setTimeout(()=>{
    try{window._set(window._ref(window._db,"global"),globalState).catch(e=>console.warn("FB:",e));}catch(e){}
  }, 800);
}
function syncToFirebase(){syncLegaToFirebase();}

// ── FIREBASE LISTENERS con Page Visibility API ────────────────
// Manteniamo gli unsubscribe per poter staccare i listener
// quando la tab va in background e riconnetterli al ritorno.
// Questo riduce le connessioni simultanee su Firebase (~50% in meno).
let _fbUnsubGlobal = null;
let _fbUnsubLega   = null;
let fbGlobalListening = false;

function listenLega(legaId){
  if(!window._fbReady||!window._db)return;
  if(_fbUnsubLega){ _fbUnsubLega(); _fbUnsubLega=null; }
  _fbUnsubLega = window._onVal(window._ref(window._db,"leghe/"+legaId+"/state"),(snap)=>{
    const d=snap.val();if(!d)return;
    const isNewer = (d._updatedAt||0) > (state._updatedAt||0);
    const roseVuote = !state.rose || Object.keys(state.rose).length === 0;
    if(!isNewer && !roseVuote)return;
    state=sanitizeLegaState(d);
    mergePlayerRoseIntoState(); // riapplica iscrizioni/rose self-service
    saveLocalOnly();renderPage(currentPage());
    if(isNewer) showSyncBar("🔄 Lega aggiornata",2000); // banner SOLO su cambiamento reale
  });
}
function listenGlobal(){
  if(!window._fbReady||!window._db)return;
  if(_fbUnsubGlobal){ _fbUnsubGlobal(); _fbUnsubGlobal=null; fbGlobalListening=false; }
  if(fbGlobalListening)return;
  fbGlobalListening=true;
  _fbUnsubGlobal = window._onVal(window._ref(window._db,"global"),(snap)=>{
    const d=snap.val();if(!d)return;
    if((d._updatedAt||0)<=(globalState._updatedAt||0))return;
    globalState=sanitizeGlobalState(d);
    localStorage.setItem("ucl_global",JSON.stringify(globalState));
    renderPage(currentPage());showSyncBar("🔄 Dati aggiornati",2000);
  });
}
function listenFirebase(){
  listenGlobal();
  if(currentLegaId){
    listenLega(currentLegaId);
    subscribePlayerSostituzioni(currentLegaId);
    subscribePlayerRose(currentLegaId);
  }
}

// Pausa/riprendi listener al cambio visibilità tab
function _fbDetachAll(){
  if(_fbUnsubGlobal){_fbUnsubGlobal();_fbUnsubGlobal=null;fbGlobalListening=false;}
  if(_fbUnsubLega){_fbUnsubLega();_fbUnsubLega=null;}
  if(_playerSostUnsubscribe){_playerSostUnsubscribe();_playerSostUnsubscribe=null;}
  if(_playerRoseUnsubscribe){_playerRoseUnsubscribe();_playerRoseUnsubscribe=null;}
}
function _fbReattach(){
  // Rileggi da localStorage (cache locale) + riaggiancia i listener live
  if(currentLegaId){
    try{
      const cached=localStorage.getItem("ucl_lega_"+currentLegaId);
      if(cached){const d=JSON.parse(cached);if((d._updatedAt||0)>=(state._updatedAt||0))state=sanitizeLegaState(d);}
    }catch(e){}
  }
  listenFirebase();
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden"){
    _fbDetachAll();
  } else {
    // Tab tornata in primo piano: riconnetti e aggiorna subito
    _fbReattach();
  }
});
// iOS Safari: pagehide/pageshow come fallback a visibilitychange
window.addEventListener("pagehide", _fbDetachAll);
window.addEventListener("pageshow", e => { if(e.persisted) _fbReattach(); });


function saveLocalOnly() {
  try { localStorage.setItem("ucl_state_v1", JSON.stringify(state)); } catch(e){}
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
  if(currentLegaId) localStorage.setItem("ucl_tab", page);
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
  const el=document.getElementById("page-"+page);
  if(el)el.classList.add("active");
  // showLobby() imposta display:block inline sulla lobby: azzeralo entrando in una pagina reale
  const _lb=document.getElementById("page-lobby"); if(_lb && page!=="lobby") _lb.style.display="none";
  document.querySelectorAll('[data-page="'+page+'"]').forEach(b=>b.classList.add("active"));
  const gC=globalState.giornataCorrente||"1";
  ["giornataSelectGiornata","selectGiornata"].forEach(id=>{const e=document.getElementById(id);if(e&&e.value!==gC)e.value=gC;});
  renderPage(page);
  closeMainDrawer();
}

function closeMainDrawer() {
  document.getElementById("navLinks")?.classList.remove("open");
  document.getElementById("drawerOverlay")?.classList.remove("open");
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => navigate(btn.dataset.page));
});
document.getElementById("hamburger")?.addEventListener("click", () => {
  document.getElementById("navLinks")?.classList.toggle("open");
  document.getElementById("drawerOverlay")?.classList.toggle("open");
});
document.getElementById("drawerClose")?.addEventListener("click", closeMainDrawer);
document.getElementById("drawerOverlay")?.addEventListener("click", closeMainDrawer);

function renderPage(p){
  if(p==="home")     { renderHomeButtons(); renderAnnounceBanner(); renderWinnerBanner(); }
  if(p==="classifica")renderClassifica();
  if(p==="stats")    renderStats();
  if(p==="squadra")renderSquadraPage();
  if(p==="giocatori")renderGiocatoriPage();
  if(p==="giornata")renderGiornata();
  if(p==="voti")renderVotiPage();
  if(p==="admin")renderAdminPage();
  if(p==="superadmin")renderSuperadminPage();
  if(p==="chat")renderChat();
}

// ── BANNER ANNUNCIO (sparisce dopo la deadline) ───────────────
function renderAnnounceBanner() {
  const el = document.getElementById("home-announce-banner");
  if (!el) return;
  // Dopo la deadline non ha più senso: nascondi definitivamente
  if (isDeadlinePassata()) { el.style.display = "none"; }
}

// ── BANNER VINCITORE (appare dopo la finale) ──────────────────
function renderWinnerBanner() {
  const wrap = document.getElementById("home-winner-banner");
  if (!wrap) return;

  // Nascondi se: nessuna lega attiva, torneo non ancora concluso, o nessuna rosa
  if (!currentLegaId || !isFinalePassata() || !state.partecipanti?.length) {
    wrap.innerHTML = ""; return;
  }

  // Calcola classifica finale
  const ranking = state.partecipanti
    .map(p => ({ ...p, punti: calcolaPuntiRosa(p.id) }))
    .sort((a, b) => b.punti - a.punti);

  if (!ranking.length || ranking[0].punti === 0) { wrap.innerHTML = ""; return; }

  const max = ranking[0].punti;
  const vincitori = ranking.filter(p => p.punti === max);
  const legaNome  = currentLegaMeta?.nome || "la tua lega";

  // Top-3 podio (escluso chi è già nei vincitori se parità)
  const podio = ranking.slice(0, Math.min(3, ranking.length));

  const podioHtml = podio.map((p, i) => {
    const medals = ["🥇","🥈","🥉"];
    const isWinner = p.punti === max;
    return `<div class="winner-podio-item${isWinner ? " winner-first" : ""}">
      <span class="winner-medal">${medals[i]}</span>
      <span class="winner-podio-name">${_escHtml(p.nome)}</span>
      <span class="winner-podio-pts">${p.punti.toFixed(1)} pt</span>
    </div>`;
  }).join("");

  const titolo = vincitori.length > 1
    ? vincitori.map(v => v.nome).join(" & ")
    : vincitori[0].nome;

  wrap.innerHTML = `
    <div class="winner-banner">
      <div class="winner-stars">★ ★ ★ ★ ★</div>
      <div class="winner-trophy">🏆</div>
      <h2 class="winner-title">${_escHtml(titolo)}</h2>
      <p class="winner-subtitle">Vincitore di <strong>${legaNome}</strong> · FIFA World Cup 2026</p>
      <div class="winner-score">${max.toFixed(1)} punti</div>
      <div class="winner-podio">${podioHtml}</div>
    </div>`;
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

function safeKey(s) { return String(s).replace(/[.#$[\]]/g, "_"); }

function calcolaTotGiocatore(nomeGioc, ruolo, nazione, partId, soloGiornata) {
  const votiNaz = globalState.voti[normalizeNazione(nazione || "")] || {};
  let tot = 0;
  const gMap = soloGiornata
    ? (votiNaz[soloGiornata] ? {[soloGiornata]: votiNaz[soloGiornata]} : {})
    : votiNaz;
  const part = partId ? state.partecipanti.find(p => p.id === partId) : null;
  const isCap = !!(part && part.capitanoGiocatore === nomeGioc);
  for (const gVoti of Object.values(gMap)) {
    if (!gVoti || typeof gVoti !== "object") continue;
    const entry = gVoti[safeKey(nomeGioc)];
    if (entry === undefined) continue;
    const v = calcVotoGiornata(entry, ruolo, isCap);
    if (v !== null) tot += v;
  }
  return Math.round(tot * 10) / 10;
}

function calcolaPuntiGiornata(partId, gId) {
  // Usa la rosa effettiva (con sostituzioni applicate) per la giornata specifica
  const rosa = getEffectiveRosa(partId, gId) || state.rose[partId];
  if (!rosa) return 0;
  let tot = 0;
  for (const [ruolo, arr] of Object.entries(rosa)) {
    if (!Array.isArray(arr)) continue;
    for (const g of arr) {
      if (!g?.nome) continue;
      tot += calcolaTotGiocatore(g.nome, ruolo, g.nazione, partId, gId);
    }
  }
  return Math.round(tot * 10) / 10;
}

function calcolaPuntiRosa(partId) {
  // Somma calcolaPuntiGiornata per ogni giornata con voti presenti
  // così le sostituzioni vengono applicate giornata per giornata
  const votiNaz = globalState.voti || {};
  const giornateConVoti = new Set();
  for (const naz of Object.values(votiNaz)) {
    for (const gId of Object.keys(naz)) giornateConVoti.add(gId);
  }
  if (!giornateConVoti.size) {
    // Fallback: rosa base senza giornate
    const rosa = state.rose[partId];
    if (!rosa) return 0;
    let tot = 0;
    for (const [ruolo, arr] of Object.entries(rosa)) {
      if (!Array.isArray(arr)) continue;
      for (const g of arr) {
        if (!g?.nome) continue;
        tot += calcolaTotGiocatore(g.nome, ruolo, g.nazione, partId, null);
      }
    }
    return Math.round(tot * 10) / 10;
  }
  let tot = 0;
  for (const gId of giornateConVoti) tot += calcolaPuntiGiornata(partId, gId);
  return Math.round(tot * 10) / 10;
}

// giornata has pending (some players in rosa have no voto yet)
function hasPendingVoti(partId, gId) {
  const rosa = state.rose[partId];
  if (!rosa) return false;
  for (const [, arr] of Object.entries(rosa)) {
    if (!Array.isArray(arr)) continue;
    for (const g of arr) {
      if (!g?.nome) continue;
      const entry = globalState.voti[g.nazione]?.[gId]?.[safeKey(g.nome)];
      if (!entry) return true;
    }
  }
  return false;
}

function countPendingVotiSquadra(naz, gId) {
  const players = getGiocatoriNazione(naz);
  let pending = 0;
  for (const g of players) {
    const entry = globalState.voti[naz]?.[gId]?.[safeKey(g.nome)];
    if (!entry) pending++;
  }
  return pending;
}

// ── CLASSIFICA ───────────────────────────────────────────────
function renderClassifica() {
  const tbody = document.getElementById("classificaTbody");
  const gId   = document.getElementById("giornataSelectGiornata")?.value || "1";
  renderGrafico();
  if (!Array.isArray(state.partecipanti) || !state.partecipanti.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="icon">🏆</div><p>${t("classifica.empty")}</p></div></td></tr>`;
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
      <td><span class="partecipante-name">${_escHtml(r.nome)}</span>${pendingDot}</td>
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

// ── STATISTICHE LEGA ─────────────────────────────────────────
function renderStats() {
  const wrap = document.getElementById("stats-content");
  if (!wrap) return;

  if (!currentLegaId) {
    wrap.innerHTML = `<p class="hint" style="text-align:center;padding:40px 0">Entra in una lega per vedere le statistiche.</p>`;
    return;
  }

  // Assicura che i dati playerRose siano sempre mergiati nello state
  // (necessario se il listener ha sparato mentre eravamo su un'altra pagina)
  mergePlayerRoseIntoState();

  const parts      = state.partecipanti || [];
  const totalParts = parts.filter(p => !!state.rose[p.id]).length;

  if (!totalParts) {
    wrap.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--text2)">
      <span class="material-symbols-outlined" style="font-size:32px;display:block;margin-bottom:8px;animation:spin 1.2s linear infinite">sync</span>
      <p style="margin:0;font-size:14px">Caricamento statistiche...</p>
    </div>`;
    // Retry after 2s in case playerRose data arrives after this render
    setTimeout(() => { if (currentPage() === "stats") renderStats(); }, 2000);
    return;
  }

  // ── Ownership map: chiave "nome||nazione" → { nome, ruolo, nazione, count, owners[] }
  const ownership   = {};
  const captainMap  = {};

  for (const p of parts) {
    const rosa = getEffectiveRosa(p.id, 999);
    if (!rosa) continue;
    for (const [ruolo, arr] of Object.entries(rosa)) {
      if (!Array.isArray(arr)) continue;
      for (const g of arr) {
        if (!g?.nome) continue;
        const naz = normalizeNazione(g.nazione || "");
        const key = g.nome + "||" + naz;
        if (!ownership[key]) ownership[key] = { nome: g.nome, ruolo, nazione: naz, count: 0, owners: [] };
        ownership[key].count++;
        ownership[key].owners.push(p.nome);
      }
    }
    const cap = p.capitanoGiocatore;
    if (cap) {
      if (!captainMap[cap]) captainMap[cap] = { count: 0, owners: [] };
      captainMap[cap].count++;
      captainMap[cap].owners.push(p.nome);
    }
  }

  const allPlayers  = Object.values(ownership).sort((a, b) => b.count - a.count);
  const topPlayers  = allPlayers.slice(0, 10);
  const topCaptains = Object.entries(captainMap).sort((a, b) => b[1].count - a[1].count);

  // Scelte per nazione: per ogni nazione, quali giocatori sono stati scelti e da quanti
  // Struttura: { nazione → { nomeGiocatore → count } }
  const nazioneScelte = {};
  for (const p of parts) {
    const rosa = getEffectiveRosa(p.id, 999);
    if (!rosa) continue;
    for (const [, arr] of Object.entries(rosa)) {
      if (!Array.isArray(arr)) continue;
      for (const g of arr) {
        if (!g?.nome) continue;
        const naz = normalizeNazione(g.nazione || "");
        if (!nazioneScelte[naz]) nazioneScelte[naz] = {};
        nazioneScelte[naz][g.nome] = (nazioneScelte[naz][g.nome] || 0) + 1;
      }
    }
  }
  // Ordina: prima le nazioni con più disaccordo (più scelte diverse), poi per nazione
  const nazioniOrdinate = Object.entries(nazioneScelte)
    .map(([naz, picks]) => {
      const sorted = Object.entries(picks).sort((a, b) => b[1] - a[1]);
      const topCount = sorted[0]?.[1] || 0;
      const unique   = sorted.length; // numero di giocatori diversi scelti
      return { naz, picks: sorted, topCount, unique };
    })
    .sort((a, b) => b.unique - a.unique || a.naz.localeCompare(b.naz));

  // ── Scoring stats ────────────────────────────────────────────
  const hasVoti  = Object.keys(globalState.voti || {}).length > 0;
  let topScorers = [], topCapScorers = [], svPerPart = [], bonusMalusPerPart = [];

  if (hasVoti) {
    // Giocatori più redditizi: punteggio base (senza bonus capitano)
    topScorers = Object.values(ownership)
      .map(g => ({ ...g, pts: calcolaTotGiocatore(g.nome, g.ruolo, g.nazione, null, null) }))
      .filter(g => g.pts > 0)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 8);

    // Rendimento capitani: deduplicati per nome, punteggio con bonus capitano
    const _capMap = {};
    parts
      .filter(p => p.capitanoGiocatore && state.rose[p.id])
      .forEach(p => {
        const capNome = p.capitanoGiocatore;
        let capRuolo = null, capNazione = null;
        for (const [ruolo, arr] of Object.entries(state.rose[p.id] || {})) {
          if (!Array.isArray(arr)) continue;
          const found = arr.find(g => g.nome === capNome);
          if (found) { capRuolo = ruolo; capNazione = found.nazione; break; }
        }
        const pts = capRuolo ? calcolaTotGiocatore(capNome, capRuolo, capNazione, p.id, null) : 0;
        if (!_capMap[capNome]) _capMap[capNome] = { capNome, capNazione, capRuolo, pts, count: 0 };
        _capMap[capNome].count++;
        if (pts > _capMap[capNome].pts) _capMap[capNome].pts = pts;
      });
    topCapScorers = Object.values(_capMap).sort((a, b) => b.pts - a.pts);

    // SV per partecipante
    const giornateConVoti = new Set();
    for (const naz of Object.values(globalState.voti)) {
      for (const gId of Object.keys(naz)) giornateConVoti.add(gId);
    }
    for (const p of parts) {
      let svCount = 0;
      for (const gId of giornateConVoti) {
        const rosa = getEffectiveRosa(p.id, gId) || state.rose[p.id];
        if (!rosa) continue;
        for (const [, arr] of Object.entries(rosa)) {
          if (!Array.isArray(arr)) continue;
          for (const g of arr) {
            if (!g?.nome) continue;
            const naz = normalizeNazione(g.nazione || "");
            const entry = globalState.voti[naz]?.[gId]?.[safeKey(g.nome)];
            if (entry?.sv) svCount++;
          }
        }
      }
      svPerPart.push({ p, svCount });
    }
    svPerPart.sort((a, b) => b.svCount - a.svCount || a.p.nome.localeCompare(b.p.nome));

    // Bonus e malus per partecipante
    for (const p of parts) {
      let totalBonus = 0, totalMalus = 0;
      for (const gId of giornateConVoti) {
        const rosa = getEffectiveRosa(p.id, gId) || state.rose[p.id];
        if (!rosa) continue;
        for (const [ruolo, arr] of Object.entries(rosa)) {
          if (!Array.isArray(arr)) continue;
          for (const g of arr) {
            if (!g?.nome) continue;
            const naz = normalizeNazione(g.nazione || "");
            const entry = globalState.voti[naz]?.[gId]?.[safeKey(g.nome)];
            if (!entry || entry.sv) continue;
            const { bonus, malus } = calcFlagsSeparati(entry.flags || {}, ruolo);
            totalBonus = Math.round((totalBonus + bonus) * 10) / 10;
            totalMalus = Math.round((totalMalus + malus) * 10) / 10;
          }
        }
      }
      bonusMalusPerPart.push({ p, totalBonus, totalMalus });
    }
    bonusMalusPerPart.sort((a, b) => b.totalBonus - a.totalBonus || a.p.nome.localeCompare(b.p.nome));
  }

  // ── HTML ─────────────────────────────────────────────────────
  try { wrap.innerHTML = `
    <div class="stats-grid">

      <!-- Chi ha questo giocatore? -->
      <div class="stats-card stats-card--full stats-search-card">
        <h3 class="stats-card-title">🔍 Chi ha questo giocatore?</h3>
        <div class="stats-search-filters">
          <select class="stats-search-naz"><option value="">– Squadra –</option></select>
          <select class="stats-search-player" disabled><option value="">– Giocatore –</option></select>
        </div>
        <div class="stats-search-result"></div>
      </div>

      <!-- Giocatori più scelti -->
      <div class="stats-card stats-card--wide">
        <h3 class="stats-card-title">🏅 Giocatori più scelti</h3>
        <div class="stats-ownership-list">
          ${topPlayers.map((g, i) => {
            const pct = Math.round((g.count / totalParts) * 100);
            return `<div class="stats-own-row">
              <span class="stats-own-rank">${i + 1}</span>
              <span class="stats-own-name">${_escHtml(g.nome)}</span>
              <span class="stats-own-flag">${_ruoloIcon(g.ruolo)}</span>
              <span class="stats-own-naz">${g.nazione}</span>
              <div class="stats-own-bar-wrap"><div class="stats-own-bar" style="width:${pct}%"></div></div>
              <span class="stats-own-pct">${g.count}/${totalParts}</span>
            </div>`;
          }).join("")}
        </div>
      </div>

      <!-- Capitani più scelti -->
      <div class="stats-card">
        <h3 class="stats-card-title">👑 Capitani più scelti</h3>
        ${topCaptains.length === 0
          ? `<p class="hint">Nessun capitano ancora scelto.</p>`
          : `<div class="stats-cap-list">
              ${topCaptains.map(([nome, d], i) => {
                const pct = Math.round((d.count / totalParts) * 100);
                return `<div class="stats-cap-row">
                  <span class="stats-rank-num">${i + 1}</span>
                  <span class="stats-cap-name">${_escHtml(nome)}</span>
                  <span class="stats-cap-pct">${d.count}/${totalParts} · ${pct}%</span>
                </div>`;
              }).join("")}
            </div>`
        }
      </div>

      <!-- Scelte per nazione -->
      <div class="stats-card">
        <h3 class="stats-card-title">🗺 Scelte per nazione</h3>
        <p class="stats-subtitle">Prima: nazioni con più scelte diverse (disaccordo)</p>
        <div class="stats-naz-scelte-list">
          ${nazioniOrdinate.map(({ naz, picks, unique }) => {
            const picksHtml = picks.map(([nome, cnt]) =>
              `<span class="stats-naz-pick ${cnt === picks[0][1] ? "top" : ""}">${_escHtml(nome)} <em>${cnt}</em></span>`
            ).join("");
            return `<div class="stats-naz-scelta-row">
              <span class="stats-naz-scelta-naz">${naz}</span>
              <div class="stats-naz-scelta-picks">${picksHtml}</div>
            </div>`;
          }).join("")}
        </div>
      </div>


      <!-- Giocatori più redditizi -->
      <div class="stats-card stats-card--wide">
        <h3 class="stats-card-title">⭐ Giocatori più redditizi</h3>
        ${!hasVoti
          ? `<p class="hint">Disponibile dopo l'inserimento dei primi voti.</p>`
          : topScorers.length === 0
            ? `<p class="hint">Nessun voto inserito ancora.</p>`
            : `<div class="stats-scorer-grid">
                ${topScorers.map((g, i) => `
                  <div class="stats-scorer-row">
                    <span class="stats-rank-num">${i + 1}</span>
                    <span class="stats-own-flag">${_ruoloIcon(g.ruolo)}</span>
                    <span class="stats-scorer-name">${_escHtml(g.nome)}</span>
                    <span class="stats-scorer-naz">${g.nazione}</span>
                    <span class="stats-scorer-pts">${g.pts.toFixed(1)}</span>
                  </div>
                `).join("")}
              </div>`
        }
      </div>

      <!-- Rendimento capitani -->
      <div class="stats-card stats-card--wide">
        <h3 class="stats-card-title">🎖 Rendimento capitani</h3>
        ${!hasVoti
          ? `<p class="hint">Disponibile dopo l'inserimento dei primi voti.</p>`
          : topCapScorers.length === 0
            ? `<p class="hint">Nessun capitano con voti ancora.</p>`
            : `<div class="stats-scorer-grid">
                ${topCapScorers.map((c, i) => `
                  <div class="stats-scorer-row">
                    <span class="stats-rank-num">${i + 1}</span>
                    <span class="stats-own-flag">${_ruoloIcon(c.capRuolo)}</span>
                    <span class="stats-scorer-name">${_escHtml(c.capNome)}</span>
                    ${c.count > 1 ? `<span class="stats-scorer-sub">×${c.count}</span>` : `<span class="stats-scorer-sub"></span>`}
                    <span class="stats-scorer-naz">${c.capNazione || ""}</span>
                    <span class="stats-scorer-pts">${c.pts.toFixed(1)}</span>
                  </div>
                `).join("")}
              </div>`
        }
      </div>

      <!-- SV per partecipante -->
      <div class="stats-card stats-card--wide">
        <h3 class="stats-card-title">🚑 Giocatori SV per partecipante</h3>
        ${!hasVoti
          ? `<p class="hint">Disponibile dopo l'inserimento dei primi voti.</p>`
          : `<div class="stats-scorer-grid">
              ${svPerPart.map((item, i) => {
                const cls = item.svCount === 0 ? "stats-sv-zero" : item.svCount <= 3 ? "stats-sv-mid" : "stats-sv-high";
                return `<div class="stats-scorer-row">
                  <span class="stats-rank-num">${i + 1}</span>
                  <span class="stats-scorer-name">${_escHtml(item.p.nome)}</span>
                  <span class="stats-sv-count ${cls}">${item.svCount}</span>
                </div>`;
              }).join("")}
            </div>`
        }
      </div>

      <!-- Bonus e malus per partecipante -->
      <div class="stats-card stats-card--wide">
        <h3 class="stats-card-title">⚡ Bonus e malus per partecipante</h3>
        ${!hasVoti
          ? `<p class="hint">Disponibile dopo l'inserimento dei primi voti.</p>`
          : `<div class="stats-bm-grid">
              <div class="stats-bm-header">
                <span></span><span></span>
                <span class="stats-bm-col-label bns">Bns</span>
                <span class="stats-bm-col-label mls">Mls</span>
              </div>
              ${bonusMalusPerPart.map((item, i) => `
                <div class="stats-bm-row">
                  <span class="stats-rank-num">${i + 1}</span>
                  <span class="stats-bm-nome">${_escHtml(item.p.nome)}</span>
                  <span class="stats-bm-bns">+${item.totalBonus.toFixed(1)}</span>
                  <span class="stats-bm-mls">${item.totalMalus > 0 ? `-${item.totalMalus.toFixed(1)}` : "–"}</span>
                </div>
              `).join("")}
            </div>`
        }
      </div>

      <!-- Tracker Sostituzioni -->
      <div class="stats-card stats-card--full">
        <h3 class="stats-card-title">🔄 Tracker Sostituzioni</h3>
        <div class="stats-sost-list">
          ${parts.map(p => {
            const sost    = getSostEffective(p.id);
            // Primo passaggio: conta il totale
            let totalUsed = 0;
            for (const fId of Object.keys(FINESTRE_TIMING)) totalUsed += (sost[fId] || []).length;
            // Secondo passaggio: costruisce lo storico per finestra
            const finestreHtml = Object.entries(FINESTRE_TIMING).map(([fId, f]) => {
              const sostArr = sost[fId] || [];
              if (!sostArr.length) return "";
              return `<div class="stats-sost-finestra">
                <span class="stats-sost-finestra-label">${f.label}</span>
                <div class="stats-sost-swaps">
                  ${sostArr.map(s => {
                    const outNome = s.outNome || s.out || "?";
                    const inNome  = s.inNome  || s.in  || "?";
                    return `<span class="stats-sost-swap">${_ruoloIcon(s.ruolo)} <span class="out">${_escHtml(outNome)}</span> → <span class="in">${_escHtml(inNome)}</span></span>`;
                  }).join("")}
                </div>
              </div>`;
            }).join("");
            const pct = Math.round(totalUsed / MAX_SOST_TOTALI * 100);
            return `<div class="stats-sost-row">
              <div class="stats-sost-header">
                <span class="stats-sost-nome">${_escHtml(p.nome)}</span>
                <span class="stats-sost-count ${totalUsed === MAX_SOST_TOTALI ? "full" : totalUsed >= MAX_SOST_TOTALI - 1 ? "low" : ""}">${totalUsed}/${MAX_SOST_TOTALI}</span>
              </div>
              <div class="stats-sost-bar-wrap"><div class="stats-sost-bar ${totalUsed === MAX_SOST_TOTALI ? "full" : ""}" style="width:${pct}%"></div></div>
              ${finestreHtml || `<p class="hint" style="margin:4px 0 0;font-size:12px">Nessuna sostituzione effettuata.</p>`}
            </div>`;
          }).join("")}
        </div>
      </div>

    </div>
  `; } catch(e) {
    console.error("[renderStats] errore rendering:", e);
    wrap.innerHTML = `<p style="color:var(--accent2);padding:20px">Errore rendering statistiche: ${e.message}</p>`;
  }

  // ── Sezione ricerca proprietario ─────────────────────────────
  const nazOpts = SQUADRE.map(n => `<option value="${n}">${n}</option>`).join("");
  const searchCard = wrap.querySelector(".stats-search-card");
  if (searchCard) {
    searchCard.querySelector(".stats-search-naz").innerHTML = `<option value="">– Squadra –</option>${nazOpts}`;
    searchCard.querySelector(".stats-search-player").innerHTML = `<option value="">– Giocatore –</option>`;
    searchCard.querySelector(".stats-search-player").disabled = true;
    searchCard.querySelector(".stats-search-result").innerHTML = "";
  }

  const selNaz    = wrap.querySelector(".stats-search-naz");
  const selPlayer = wrap.querySelector(".stats-search-player");
  const resEl     = wrap.querySelector(".stats-search-result");

  if (selNaz && selPlayer && resEl) {
    selNaz.addEventListener("change", () => {
      const naz = selNaz.value;
      selPlayer.innerHTML = `<option value="">– Giocatore –</option>`;
      resEl.innerHTML = "";
      if (!naz) { selPlayer.disabled = true; return; }
      const seen = new Map();
      for (const p of state.partecipanti) {
        const rosa = getEffectiveRosa(p.id, 999);
        if (!rosa) continue;
        for (const [ruolo, arr] of Object.entries(rosa)) {
          if (!Array.isArray(arr)) continue;
          for (const g of arr) {
            if (g?.nome && normalizeNazione(g.nazione || "") === normalizeNazione(naz))
              seen.set(g.nome, ruolo);
          }
        }
      }
      const giocatori = [...seen.entries()].map(([nome, ruolo]) => ({ nome, ruolo })).sort((a, b) => a.nome.localeCompare(b.nome));
      selPlayer.innerHTML = `<option value="">– Giocatore –</option>` +
        giocatori.map(g => `<option value="${_escHtml(g.nome)}" data-ruolo="${g.ruolo}">${_escHtml(g.nome)}</option>`).join("");
      selPlayer.disabled = false;
    });

    selPlayer.addEventListener("change", () => {
      const nome = selPlayer.value;
      const naz  = selNaz.value;
      resEl.innerHTML = "";
      if (!nome) return;
      const normNaz = normalizeNazione(naz);
      const owners = [];
      for (const p of state.partecipanti) {
        const rosa = getEffectiveRosa(p.id, 999);
        if (!rosa) continue;
        for (const arr of Object.values(rosa)) {
          if (!Array.isArray(arr)) continue;
          if (arr.some(g => g.nome === nome && normalizeNazione(g.nazione || "") === normNaz)) {
            owners.push(p.nome); break;
          }
        }
      }
      if (!owners.length) {
        resEl.innerHTML = `<p class="hint" style="margin:12px 0 0">Nessun partecipante ha scelto questo giocatore.</p>`;
        return;
      }
      resEl.innerHTML = `<table class="stats-search-table">
        <thead><tr><th>#</th><th>Partecipante</th></tr></thead>
        <tbody>${owners.map((n, i) => `<tr><td>${i + 1}</td><td>${_escHtml(n)}</td></tr>`).join("")}</tbody>
      </table>`;
    });
  }
}

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
      <span class="summary-chip-name">${_escHtml(item.p.nome)}</span>
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
    const rosa = getEffectiveRosa(p.id, gId) || state.rose[p.id];
    const cap  = p.capitanoGiocatore;
    let body = "";

    // Rosa nascosta dal proprietario, visibile solo dopo il calcio d'inizio.
    // Il proprietario vede sempre la propria.
    const isMine      = currentUser && p.uid === currentUser.uid;
    const isNascosta  = p.uid && !!_playerRoseState[p.uid]?.nascosta && !isDeadlinePassata();
    const isHidden    = isNascosta && !isMine;   // nascosta agli ALTRI
    const isMineHidden= isNascosta && isMine;    // la MIA rosa è nascosta (mostro il lucchetto anche a me)

    if (isHidden) {
      body = `<div style="padding:28px 12px;color:var(--text2);font-size:13px;text-align:center">
        <span class="material-symbols-outlined" style="font-size:34px;opacity:.55">lock</span>
        <p style="margin:8px 0 0;font-weight:600">Rosa nascosta dal proprietario</p>
        <p style="margin:2px 0 0;font-size:11px">Sarà visibile dopo il calcio d'inizio</p>
      </div>`;
    } else if (!rosa || !Object.values(rosa).some(a=>a.length)) {
      body = `<div style="padding:12px;color:var(--text2);font-size:12px;text-align:center">Rosa non caricata</div>`;
    } else {
      const trows = Object.keys(RUOLI).map(ruolo => {
        const arr = rosa[ruolo] || [];
        if (!arr.length) return "";
        const sep = `<tr><td colspan="5" style="padding:6px 12px;background:rgba(255,255,255,.02);font-size:11px;color:var(--text2)">
          <span class="ruolo-badge ruolo-${ruolo}" style="font-size:10px;padding:2px 6px">${ruolo}</span>
          <span style="margin-left:6px;font-weight:600">${RUOLI[ruolo]} · ${arr.length}</span></td></tr>`;
        const rows = arr.map(g => {
          const entry  = globalState.voti[g.nazione]?.[gId]?.[safeKey(g.nome)];
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
                ? `<span class="cap-star cap-active" title="${t('common.captain')} +2">⭐+2</span>`
                : `<span class="cap-star" title="${t('common.captain')}">⭐</span>`)
            : "";

          const elimNaz = isNazioneEliminata(g.nazione, gId);
          const elimStyle = elimNaz ? "opacity:.45;text-decoration:line-through;" : "";
          const elimBadge = elimNaz ? ' <span title="Club eliminato" style="font-size:10px;text-decoration:none;display:inline-block">🚫</span>' : "";

          return `<tr${isSV?' class="sv"':''}${elimNaz?' class="elim-row"':""}>
            <td class="left" style="font-size:12px;padding:10px 12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;${elimStyle}">${_escHtml(g.nome)}${capBadge}${elimBadge} <span style="font-size:10px;color:var(--text2);opacity:.8;margin-left:4px">${g.nazione}</span></td>
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
    const lockIcon = isHidden
      ? ` <span title="Rosa nascosta dal proprietario" style="font-size:12px">🔒</span>`
      : isMineHidden
      ? ` <span title="La tua rosa è nascosta agli altri" style="font-size:11px;opacity:.7">🔒</span>`
      : "";
    return `<div class="acc-item" id="acc_${p.id}" style="width:100%;box-sizing:border-box;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
      <div class="acc-header" style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;transition:background .15s;" data-id="${p.id}">
        <span style="font-family:'Outfit',sans-serif;font-size:18px;color:${rankColor(i)};flex-shrink:0">${i<3?medals[i]:i+1}</span>
        <span style="font-family:'Outfit',sans-serif;font-size:16px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(p.nome)}${lockIcon}${pendingWarn}</span>
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
  // Voti gestiti centralmente (poller live + superadmin via ?sa=1 / Ctrl+Shift+S):
  // pagina in sola lettura per gli admin di lega, perché le regole RTDB ora
  // consentono la scrittura su /global solo all'account superadmin.
  const note = document.getElementById("votiReadonlyNote");
  votiUnlocked = false;
  adminCtrl.style.display = "none";
  loginCtrl.style.display = "none";
  btnSalva.style.display  = "none";
  if (note) note.style.display = "block";
  renderVoti();
}

document.getElementById("btnUnlock")?.addEventListener("click", unlockVoti);
document.getElementById("pwdInput")?.addEventListener("keydown", e => { if(e.key==="Enter") unlockVoti(); });
async function unlockVoti(){
  const val=document.getElementById("pwdInput").value;
  const hash=await sha256(val);
  if(hash===SUPERADMIN_PWD_HASH && currentUser?.uid===SUPERADMIN_UID){superadminUnlocked=true;navigate("superadmin");return;}
  if(hash===state.pwdHash){votiUnlocked=true;renderVotiPage();}
  else{document.getElementById("pwdError").textContent="❌ Password errata";document.getElementById("pwdInput").value="";}
}
document.getElementById("btnLogout")?.addEventListener("click", () => { votiUnlocked=false; renderVotiPage(); toast("Sessione terminata."); });

// ── VOTI SQUADRE ─────────────────────────────────────────────
function renderVoti() {
  const sel = document.getElementById("selectSquadra");
  if (sel.options.length <= 1) {
    let opts = '<option value="">– Seleziona –</option>';
    for (const n of SQUADRE) opts += `<option value="${n}">${n}</option>`;
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
      if (!Array.isArray(arr)) continue;
      for (const g of arr) {
        if (g?.nazione === naz && !giocSet.has(g.nome)) giocSet.set(g.nome, { nome:g.nome, ruolo });
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
  const nazElim   = isNazioneEliminata(naz, gId);
  const isEdit    = votiUnlocked && !nazElim;
  const savedVoti = (globalState.voti[naz]||{})[gId]||{};

  // eliminated banner (priorità massima)
  if (nazElim) {
    banner.className = "voti-banner elim";
    banner.textContent = `🚫 ${naz} è stata eliminata dal torneo — i voti sono bloccati`;
    banner.style.display = "block";
  }

  // pending banner
  const pending = countPendingVotiSquadra(naz, gId);
  if (!nazElim && pending > 0) {
    banner.className = "voti-banner warn";
    banner.textContent = `⚠ ${pending} giocator${pending===1?"e":"i"} senza voto in questa giornata`;
    banner.style.display = "block";
  } else if (!nazElim && giocatori.length > 0) {
    banner.className = "voti-banner ok";
    banner.textContent = `✅ Tutti i voti inseriti per questa giornata`;
    banner.style.display = "block";
  } else {
    banner.style.display = "none";
  }

  const rows = giocatori.map(g => {
    const entry = savedVoti[safeKey(g.nome)] || {};
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
          return `<span class="flag-multi-wrap ${f.cls}${isActive?" active":""}" data-flag="${f.key}" data-nome="${safeKey(g.nome)}">
            <button class="flag-multi-dec" data-flag="${f.key}" data-nome="${safeKey(g.nome)}" title="Rimuovi ${f.label}" ${count===0?"disabled":""}>−</button>
            <span class="flag-multi-label" title="${f.label}">${f.label.split(' ')[0]} <span class="flag-multi-count">${count}</span></span>
            <button class="flag-multi-inc" data-flag="${f.key}" data-nome="${safeKey(g.nome)}" title="Aggiungi ${f.label}">+</button>
          </span>`;
        } else {
          const isActive = !!val;
          return `<button class="flag-btn ${f.cls}${isActive?" active":""}" data-flag="${f.key}" data-multi="false" data-nome="${safeKey(g.nome)}" title="${f.label}">
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
      ? `<input type="number" class="inp-v" data-nome="${safeKey(g.nome)}" value="${v}" step="0.5" min="0" max="10" placeholder="–" ${isSV?"disabled style='opacity:.4'":""}>`
      : `<span style="font-weight:600">${isSV?"<em style='color:var(--text2)'>SV</em>":v!==""?parseFloat(v).toFixed(1):"–"}</span>`;

    const svBtn = isEdit
      ? `<button class="sv-btn${isSV?" active":""}" data-nome="${safeKey(g.nome)}" title="Senza Voto">SV</button>`
      : "";

    return `<tr data-nome="${safeKey(g.nome)}" data-ruolo="${g.ruolo}"${isSV?' class="sv-row"':""}>
      <td><span class="ruolo-badge ruolo-${g.ruolo}">${g.ruolo}</span></td>
      <td style="font-weight:600;font-size:14px">${_escHtml(g.nome)}</td>
      <td class="center">${vInput}${svBtn}</td>
      <td><div class="flags-wrap">${flagsHtml}</div></td>
      <td class="center"><span class="totale-voto-cell${totCls}" id="vtot_${safeId(g.nome)}">${isSV?"SV":v!==""?tot.toFixed(1):"–"}</span></td>
      ${isEdit?`<td class="center" style="display:flex;gap:4px;justify-content:center;align-items:center"><button class="btn-icon" data-delvoto="${_escHtml(g.nome)}" title="Elimina voto" style="color:var(--orange)">✕</button><button class="btn-icon" data-rm="${_escHtml(g.nome)}" title="Rimuovi giocatore">🗑</button></td>`:"<td></td>"}
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
    const waMsg=encodeURIComponent(`🏆 Entra nella mia lega ArenaSerieA "${nome}" per la Serie A 2026/27!\n👉 ${link}`);
    banner.innerHTML=`
      <span>🏆 <strong>${_escHtml(nome)}</strong> · <span style="font-size:11px;opacity:.7">${currentLegaId}</span></span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button class="btn-sec" style="font-size:11px;padding:3px 10px"
          onclick="navigator.clipboard.writeText('${link}').then(()=>toast('📋 Link copiato!'))">📋 Copia link</button>
        <a href="https://wa.me/?text=${waMsg}" target="_blank" rel="noopener"
          style="display:inline-flex;align-items:center;gap:4px;background:#25D366;color:#fff;border:none;border-radius:6px;font-size:11px;padding:3px 10px;cursor:pointer;text-decoration:none;font-weight:600">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.529 5.855L.057 23.882l6.198-1.625A11.935 11.935 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.659-.504-5.186-1.385l-.372-.22-3.679.965.98-3.585-.242-.379A9.943 9.943 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
          WhatsApp
        </a>
        ${navigator.share ? `<button class="btn-sec" style="font-size:11px;padding:3px 10px"
          onclick="navigator.share({title:'ArenaSerieA – ${_escHtml(nome).replace(/'/g,"\\'")}',text:'Entra nella mia lega ArenaSerieA per la Serie A 2026/27!',url:'${link}'}).catch(()=>{})">↗ Condividi</button>` : ''}
      </div>`;
    banner.style.display="flex";
  }
  renderPartecipantiList();
  renderCapitanoForm();
  renderSostituzioni();
  renderAdminDeadline();
  populateSel("selectPartecipanteImport",state.partecipanti,"nome","id","– Seleziona –","");
  renderRoseStatus();
  loadPushSubCount();
}

// ── ADMIN PUSH NOTIFICATIONS ─────────────────────────────
async function loadPushSubCount() {
  const el = document.getElementById("pushSubCount");
  if (!el || !currentLegaId || !window._db) return;
  try {
    const snap = await new Promise(resolve =>
      window._onVal(window._ref(window._db, `leghe/${currentLegaId}/pushSubscriptions`), resolve, { onlyOnce: true })
    );
    const count = snap.val() ? Object.keys(snap.val()).length : 0;
    el.textContent = count
      ? `🔔 ${count} partecipant${count !== 1 ? "i" : "e"} con notifiche attive`
      : "Nessun partecipante ha attivato le notifiche";
  } catch(e) { el.textContent = ""; }
}

async function sendAdminPush(title, body) {
  const t_ = title || document.getElementById("pushTitle")?.value?.trim() || "Fantasy Arena";
  const b_ = body  || document.getElementById("pushBody")?.value?.trim() || "";
  const resEl = document.getElementById("pushSendResult");
  const btn   = document.getElementById("btnSendPush");

  if (!currentLegaId) { toast("Nessuna lega attiva", true); return; }
  if (!b_) { toast("Inserisci un messaggio", true); return; }

  if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Invio..."; }
  if (resEl) resEl.textContent = "";

  try {
    const res = await fetch(".netlify/functions/push-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        legaId: currentLegaId,
        title: t_,
        body: b_,
        url: `${location.origin}${location.pathname}?lega=${currentLegaId}`,
        secret: "push"   // corrisponde a ADMIN_PUSH_SECRET su Netlify
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (resEl) resEl.innerHTML = `<span style="color:var(--green)">✓ Inviate: ${data.sent ?? "?"} · Fallite: ${data.failed ?? 0}</span>`;
    toast(`🔔 Push inviata a ${data.sent ?? "?"} utenti!`);
  } catch(e) {
    if (resEl) resEl.innerHTML = `<span style="color:var(--red)">Errore: ${e.message}</span>`;
    toast("Errore invio push", true);
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined">send</span> Invia a tutti'; }
  }
}

function renderGiornataCorrenteAdmin() {
  const sel = document.getElementById("adminGiornataCorrente");
  if (!sel) return;
  sel.value = globalState.giornataCorrente || "1";
}

function renderAdminDeadline(){
  const inp = document.getElementById("adminDeadlineInput");
  const st  = document.getElementById("adminDeadlineStatus");
  if(!inp) return;
  const dl = state?.deadline;
  if(dl){
    const d = new Date(dl);
    const pad = n => String(n).padStart(2,'0');
    inp.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if(st) st.textContent = isDeadlinePassata()
      ? `🔒 Deadline superata (${d.toLocaleString('it-IT')}): rose bloccate, solo sostituzioni.`
      : `⏳ Deadline: ${d.toLocaleString('it-IT')} — rose modificabili fino ad allora.`;
  } else {
    inp.value = "";
    if(st) st.textContent = "Nessuna scadenza impostata: le rose sono sempre modificabili.";
  }
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
    await window._set(window._ref(window._db, "indice/" + currentLegaId), null);
    await window._set(window._ref(window._db, "leghe/" + currentLegaId), null);
    // Rimuovi da users se loggato
    if (currentUser) {
      await window._set(window._ref(window._db, "users/" + currentUser.uid + "/leghe/" + currentLegaId), null);
    }
    toast("Lega eliminata.");
    exitLega();
  } catch(e) {
    console.error("eliminaLega error:", e);
    const msg = e.code === "PERMISSION_DENIED"
      ? "Permesso negato — assicurati di essere l'admin e di aver aggiornato le regole Firebase."
      : "Errore durante l'eliminazione: " + e.message;
    toast(msg, true);
  }
}

document.addEventListener("click", e => {
  if (e.target && e.target.id === "btnResetPartecipanti") resetPartecipantiERose();
  if (e.target && e.target.id === "btnEliminaLega") eliminaLega();
  if (e.target && e.target.id === "btnSalvaDeadline") {
    const inp = document.getElementById("adminDeadlineInput");
    if (!inp || !inp.value) { toast("Inserisci una data/ora.", true); return; }
    state.deadline = new Date(inp.value).toISOString();
    saveState(); renderAdminDeadline(); toast("Deadline salvata.");
  }
  if (e.target && e.target.id === "btnRimuoviDeadline") {
    state.deadline = null;
    saveState(); renderAdminDeadline(); toast("Deadline rimossa: rose sempre modificabili.");
  }
  if (e.target && e.target.id === "btnSendPush") sendAdminPush();
  if (e.target && e.target.id === "btnPushPresetVoti") {
    const gLabel = GIORNATE[globalState.giornataCorrente || "1"];
    sendAdminPush("⚽ Voti disponibili!", `I voti della ${gLabel} sono pronti. Controlla la classifica!`);
  }
  if (e.target && e.target.id === "btnPushPresetClassifica") {
    sendAdminPush("🏆 Classifica aggiornata!", "La classifica è stata aggiornata. Vieni a vedere la tua posizione!");
  }
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
      <span>${_escHtml(p.nome)}</span>
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
      ?nonAtt.map(g=>`<option value="${_escHtml(g.nome)}" ${p.capitanoGiocatore===g.nome?"selected":""}>${_escHtml(g.nome)} (${g.ruolo}) – ${g.nazione}</option>`).join("")
      :"<option value=''>Carica prima la rosa</option>";
    return `<div class="capitano-row">
      <span>${_escHtml(p.nome)}</span>
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
  a.href = url; a.download = `fantasy_arena_backup_${new Date().toISOString().slice(0,10)}.json`;
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
    const squadra = normalizeNazione(parts[iSquadra]);
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
      if(!Array.isArray(arr))continue;
      for(const g of arr){
        if(!g?.nome)continue;
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
      <div class="manual-ruolo-title"><span class="ruolo-badge ruolo-${ruolo}">${ruolo}</span><span>${_escHtml(nome)}</span></div>
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
  const opts=SQUADRE.map(n=>`<option value="${n}" ${n===nazione?"selected":""}>${n}</option>`).join("");
  return `<div class="manual-gioc-row" data-ruolo="${ruolo}">
    <input type="text" class="inp-man-nome" placeholder="Nome giocatore" value="${_escHtml(nome)}">
    <select class="inp-man-naz"><option value="">– Nazione –</option>${opts}</select>
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
let _graficoChart = null;
let _graficoFilterMode = "top5"; // "top5" | "top10" | "tutti"

function renderGrafico() {
  const wrap = document.getElementById("graficoWrap");
  if (!wrap) return;

  if (!state.partecipanti || !state.partecipanti.length) {
    if (_graficoChart) { _graficoChart.destroy(); _graficoChart = null; }
    wrap.innerHTML = `<div class="empty-state"><div class="icon">📈</div><p>Nessun dato disponibile.</p></div>`;
    return;
  }

  if (typeof Chart === "undefined") {
    wrap.innerHTML = `<div class="empty-state"><p>Grafico non disponibile offline.</p></div>`;
    return;
  }

  // Kickoff per giornata derivati dal calendario reale (matches.js):
  // una giornata entra nel grafico solo dopo il suo primo calcio d'inizio.
  // Le giornate senza kickoff noto (calendario non ancora pubblicato) sono
  // trattate come future e non compaiono.
  const GIORNATE_KICKOFF = {};
  {
    const _cal = (typeof MATCHES !== "undefined" ? MATCHES : {});
    for (const [gId, partite] of Object.entries(_cal)) {
      const ts = (partite || []).map(m => Date.parse(m.kickoff)).filter(n => !isNaN(n));
      if (ts.length) GIORNATE_KICKOFF[Number(gId)] = Math.min(...ts);
    }
  }
  const now       = Date.now();
  const giornateIds = Object.keys(GIORNATE_FALLBACK).map(Number).sort((a, b) => a - b);
  const playedIds   = giornateIds.filter(id => now >= (GIORNATE_KICKOFF[id] ?? Infinity));

  if (!playedIds.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="icon">📈</div><p>Il torneo non è ancora iniziato.</p></div>`;
    return;
  }

  const allParts = state.partecipanti;

  // Punteggio cumulativo per ogni partecipante ad ogni giornata disputata
  const cumScore = {}; // [partId][gId]
  for (const p of allParts) {
    cumScore[p.id] = {};
    let cum = 0;
    for (const gId of playedIds) {
      cum += calcolaPuntiGiornata(p.id, String(gId));
      cumScore[p.id][gId] = parseFloat(cum.toFixed(1));
    }
  }

  // Rank di ogni partecipante ad ogni giornata disputata
  const rankAt = {}; // [partId][gId]
  for (const gId of playedIds) {
    const sorted = [...allParts].sort((a, b) =>
      (cumScore[b.id][gId] ?? 0) - (cumScore[a.id][gId] ?? 0)
    );
    sorted.forEach((p, i) => {
      if (!rankAt[p.id]) rankAt[p.id] = {};
      rankAt[p.id][gId] = i + 1;
    });
  }

  // Classifica finale per scegliere top N
  const lastGId  = playedIds[playedIds.length - 1];
  const totals   = allParts
    .map(p => ({ p, rank: rankAt[p.id]?.[lastGId] ?? 9999 }))
    .sort((a, b) => a.rank - b.rank);

  const N    = _graficoFilterMode === "top5" ? 5 : _graficoFilterMode === "top10" ? 10 : allParts.length;
  let shown  = totals.slice(0, N).map(x => x.p);

  // Utente loggato: sempre incluso, messo per ultimo (renderizzato sopra)
  const myPartId = _getMyPartId?.();
  const myPart   = myPartId ? allParts.find(p => p.id === myPartId) : null;
  const meInTop  = myPart && shown.some(p => p.id === myPartId);
  if (myPart && !meInTop) shown = [...shown, myPart];
  if (myPart) { shown = shown.filter(p => p.id !== myPartId); shown.push(myPart); }

  const palette = ["#ff6b35","#2ecc71","#3498db","#9b59b6","#e74c3c","#f39c12","#1abc9c","#e91e8c","#00bcd4","#ff5722","#8bc34a","#607d8b"];
  const labels  = giornateIds.map(id => GIORNATE_FALLBACK[id]);

  const datasets = shown.map((p, ci) => {
    const isMe = p.id === myPartId;
    const data = giornateIds.map(gId =>
      now < (GIORNATE_KICKOFF[gId] ?? Infinity) ? null : (rankAt[p.id]?.[gId] ?? null)
    );
    const color = isMe ? "#e8ff3a" : palette[ci % palette.length];
    return {
      label: isMe ? `⭐ ${_escHtml(p.nome)}` : p.nome,
      data,
      borderColor: color,
      backgroundColor: color + "20",
      pointBackgroundColor: color,
      pointRadius: isMe ? 6 : 4,
      pointHoverRadius: isMe ? 9 : 7,
      borderWidth: isMe ? 3.5 : 2,
      tension: 0,   // linee angolari — stile bump chart
      fill: false,
    };
  });

  // maxRank reale: il rank più alto tra i partecipanti mostrati
  const allRankVals = shown.flatMap(p => playedIds.map(gId => rankAt[p.id]?.[gId] ?? 0)).filter(r => r > 0);
  const maxRank     = allRankVals.length ? Math.max(...allRankVals) : shown.length;

  const isMobile    = window.innerWidth < 600;
  const chartHeight = isMobile ? 340 : 420;
  const rightPad    = isMobile ? 80 : 110;
  const labelFont   = isMobile ? 10 : 11;

  // Barra filtri
  const filterBtns = [
    { mode: "top5",  label: "Top 5"  },
    { mode: "top10", label: "Top 10" },
    { mode: "tutti", label: "Tutti"  },
  ].map(({ mode, label }) =>
    `<button class="grafico-filter-btn${_graficoFilterMode === mode ? " grafico-filter-btn--active" : ""}" data-mode="${mode}">${label}</button>`
  ).join("");
  const meBadge = myPart && !meInTop
    ? `<span class="grafico-me-badge">+ ${_escHtml(myPart.nome)} (tu)</span>` : "";

  if (_graficoChart) { _graficoChart.destroy(); _graficoChart = null; }

  wrap.innerHTML = `
    <div class="grafico-filter-bar">
      <div class="grafico-filter-btns">${filterBtns}${meBadge}</div>
    </div>
    <div style="position:relative;height:${chartHeight}px;width:100%"><canvas id="graficoCanvas"></canvas></div>`;

  wrap.querySelectorAll(".grafico-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => { _graficoFilterMode = btn.dataset.mode; renderGrafico(); });
  });

  // Plugin: label a destra del chartArea, ancorate all'ultimo rank noto
  const endLabelPlugin = {
    id: "endLabels",
    afterDraw(chart) {
      const ctx  = chart.ctx;
      const area = chart.chartArea;
      const entries = [];
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        let lastPt = null;
        for (let i = meta.data.length - 1; i >= 0; i--) {
          if (ds.data[i] !== null) { lastPt = meta.data[i]; break; }
        }
        if (!lastPt) return;
        entries.push({ y: lastPt.y, text: ds.label.replace("⭐ ", ""), color: ds.borderColor, bold: ds.label.startsWith("⭐") });
      });
      entries.sort((a, b) => a.y - b.y);
      const gap = labelFont + 3;
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].y - entries[i - 1].y < gap) entries[i].y = entries[i - 1].y + gap;
      }
      entries.forEach(e => {
        const y = Math.max(area.top + 6, Math.min(area.bottom - 6, e.y));
        ctx.save();
        ctx.font = `${e.bold ? "bold " : ""}${labelFont}px -apple-system,sans-serif`;
        ctx.fillStyle = e.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(e.text, area.right + 6, y);
        ctx.restore();
      });
    }
  };

  _graficoChart = new Chart(document.getElementById("graficoCanvas").getContext("2d"), {
    type: "line",
    plugins: [endLabelPlugin],
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { right: rightPad } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1e2535",
          titleColor: "#e2e8f0",
          bodyColor: "#8892a4",
          borderColor: "rgba(255,255,255,.1)",
          borderWidth: 1,
          padding: 10,
          itemSort: (a, b) => a.parsed.y - b.parsed.y,
          callbacks: {
            label: ctx => {
              const name = ctx.dataset.label.replace("⭐ ", "");
              const p    = allParts.find(x => x.nome === name);
              const gId  = playedIds[ctx.dataIndex] ?? null;
              const pts  = p && gId ? (cumScore[p.id]?.[gId] ?? 0) : 0;
              return ` ${ctx.dataset.label}: ${ctx.parsed.y}° · ${pts} pt`;
            },
            labelColor: ctx => ({ borderColor: ctx.dataset.borderColor, backgroundColor: ctx.dataset.borderColor }),
          }
        }
      },
      scales: {
        x: { ticks: { color: "#8892a4", font: { size: isMobile ? 9 : 10 }, maxRotation: isMobile ? 45 : 0 }, grid: { color: "rgba(255,255,255,.06)" } },
        y: {
          position: "left",
          reverse: true,
          min: 0.5,
          max: maxRank + 0.5,
          ticks: {
            color: "#8892a4",
            font: { size: isMobile ? 9 : 10 },
            stepSize: 1,
            callback: v => Number.isInteger(v) ? `${v}°` : "",
          },
          grid: { color: "rgba(255,255,255,.06)" }
        }
      }
    }
  });
}

// ── CHAT DI LEGA ─────────────────────────────────────────
let _chatUnsubscribe = null;

function renderChat() {
  const wrap = document.getElementById("chatWrap");
  const msgEl = document.getElementById("chatMessages");
  if (!wrap) return;

  if (!currentLegaId) {
    if (msgEl) msgEl.innerHTML = `<div class="chat-empty">Entra in una lega per usare la chat.</div>`;
    return;
  }
  if (!currentUser) {
    if (msgEl) msgEl.innerHTML = `<div class="chat-empty">Accedi per usare la chat.</div>`;
    return;
  }

  // Cleanup previous listener
  _stopChatListener();

  if (msgEl) msgEl.innerHTML = '';

  // Real-time listener
  const chatRef = window._query(
    window._ref(window._db, `leghe/${currentLegaId}/chat`),
    window._limitToLast(100)
  );

  _chatUnsubscribe = window._onChildAdded(chatRef, snap => {
    const msg = snap.val();
    if (!msg || !msg.text) return;
    _appendChatMessage(msg, snap.key);
  });

  // Bind send button
  const input = document.getElementById("chatInput");
  const btn = document.getElementById("btnChatSend");
  if (btn && !btn._chatBound) {
    btn._chatBound = true;
    const sendFn = () => {
      const text = input?.value?.trim();
      if (!text) return;
      _sendChatMessage(text);
      if (input) input.value = '';
    };
    btn.addEventListener("click", sendFn);
    input?.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFn(); } });
  }
}

function _appendChatMessage(msg, key) {
  const msgEl = document.getElementById("chatMessages");
  if (!msgEl) return;
  const isMine = currentUser && msg.uid === currentUser.uid;
  const time = msg.ts ? new Date(msg.ts).toLocaleTimeString("it-IT", { hour:"2-digit", minute:"2-digit" }) : "";
  const div = document.createElement("div");
  div.className = `chat-msg${isMine ? " mine" : ""}`;
  div.dataset.key = key;
  div.innerHTML = `
    ${!isMine ? `<span class="chat-msg-author">${_escHtml(msg.nome || "?")}</span>` : ""}
    <div class="chat-msg-bubble">
      <span class="chat-msg-text">${_escHtml(msg.text)}</span>
      <span class="chat-msg-time">${time}</span>
    </div>`;
  msgEl.appendChild(div);
  msgEl.scrollTop = msgEl.scrollHeight;
}

function _escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function _sendChatMessage(text) {
  if (!currentLegaId || !currentUser || !text) return;
  if (!window._push || !window._db) { toast("Firebase non disponibile", true); return; }
  const nome = currentUser.displayName || currentUser.email?.split("@")[0] || "Anonimo";
  try {
    await window._push(window._ref(window._db, `leghe/${currentLegaId}/chat`), {
      uid: currentUser.uid,
      nome,
      text: text.slice(0, 300),
      ts: Date.now()
    });
  } catch(e) {
    toast("Errore invio messaggio", true);
    console.error(e);
  }
}

function _stopChatListener() {
  if (_chatUnsubscribe) {
    try { _chatUnsubscribe(); } catch(e) {}
    _chatUnsubscribe = null;
  }
}

// ── PUSH NOTIFICATIONS ───────────────────────────────────
const VAPID_PUBLIC_KEY = "BAMW9MzIXvTQKFEDku4vae2VdvkSzCowiAFYba0XZtLMdukws9fxJVooyOmuJ7I3xkucpTvhVNxLoIFOtzGLr6A";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    toast("Push non supportato dal browser", true); return;
  }
  if (!currentLegaId || !currentUser) {
    toast("Entra in una lega per attivare le notifiche", true); return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { toast("Notifiche non autorizzate", true); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    const res = await fetch(".netlify/functions/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), legaId: currentLegaId, uid: currentUser.uid })
    });
    if (!res.ok) throw new Error("Server error");
    toast("🔔 Notifiche attivate!");
    _updatePushBtn(true);
  } catch(e) {
    console.error(e);
    toast("Errore attivazione notifiche", true);
  }
}

async function unsubscribeFromPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    toast("🔕 Notifiche disattivate");
    _updatePushBtn(false);
  } catch(e) {
    toast("Errore disattivazione notifiche", true);
  }
}

async function _updatePushBtn(subscribed) {
  const btn = document.getElementById("btnPushToggle");
  if (!btn) return;
  btn.textContent = subscribed ? "🔕 Disattiva notifiche" : "🔔 Attiva notifiche";
  btn.onclick = subscribed ? unsubscribeFromPush : subscribeToPush;
}

async function initPushBtn() {
  const btn = document.getElementById("btnPushToggle");
  if (!btn || !("PushManager" in window)) {
    if (btn) btn.style.display = "none";
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    _updatePushBtn(!!sub);
  } catch(e) {
    if (btn) btn.style.display = "none";
  }
}

// ── SOSTITUZIONI ─────────────────────────────────────────────
// SERIE A: una finestra ogni 5 giornate (dopo G5, G10, ... G30 = 6 finestre;
// nessuna finestra prima di G36). Le sost. della finestra N valgono da G(5N+1) in poi.
// Limite: max 3 cambi PER RUOLO in tutta la stagione (nessun cap totale separato).
const FINESTRE = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  label: `Finestra ${i + 1}`,
  desc: `Dopo G${(i + 1) * 5} · prima di G${(i + 1) * 5 + 1}`,
}));
const MAX_SOST_PER_RUOLO = 3;                    // max per ruolo in tutta la stagione
const MAX_SOST_TOTALI    = MAX_SOST_PER_RUOLO * 4; // 12 = 3 × 4 ruoli (il vincolo reale è per-ruolo)

// Finestre allineate al calendario: aprono ~4 giorni prima della giornata
// successiva (5N+1) e chiudono poco prima del suo primo fischio d'inizio.
const FINESTRE_TIMING = {
  1: { open: "2026-10-07T12:00:00Z", close: "2026-10-11T12:00:00Z", label: "Finestra 1" }, // prima di G6
  2: { open: "2026-11-04T12:00:00Z", close: "2026-11-08T12:00:00Z", label: "Finestra 2" }, // prima di G11
  3: { open: "2026-12-16T12:00:00Z", close: "2026-12-20T12:00:00Z", label: "Finestra 3" }, // prima di G16
  4: { open: "2027-01-20T12:00:00Z", close: "2027-01-24T12:00:00Z", label: "Finestra 4" }, // prima di G21
  5: { open: "2027-02-24T12:00:00Z", close: "2027-02-28T12:00:00Z", label: "Finestra 5" }, // prima di G26
  6: { open: "2027-04-07T12:00:00Z", close: "2027-04-11T12:00:00Z", label: "Finestra 6" }, // prima di G31
};

// Stato UI locale per sostituzioni (non salvato)
let _sostSelectedPart = "";
let _finestreAperte = {}; // { "pid_fid": true }

// Stato globale player self-service sost (sincronizzato da Firebase)
// { [uid]: { [finestraId]: [ { outNome, outNazione, ruolo, inNome, inNazione } ] } }
let _playerSostState = {};
let _sostEditMode    = null; // { finestraId, idx, sost } quando si modifica una sost esistente
let _playerSostUnsubscribe = null;

// ── ISCRIZIONE E ROSA SELF-SERVICE (playerRose) ───────────────
// Ogni utente scrive il proprio nodo leghe/{id}/playerRose/{uid}.
// È così che i partecipanti si auto-registrano senza intervento admin.
let _playerRoseState = {};
let _playerRoseUnsubscribe = null;

function subscribePlayerRose(legaId) {
  if (_playerRoseUnsubscribe) { _playerRoseUnsubscribe(); _playerRoseUnsubscribe = null; }
  if (!window._onVal || !window._db) return;
  const path = window._ref(window._db, `leghe/${legaId}/playerRose`);
  _playerRoseUnsubscribe = window._onVal(path, snap => {
    _playerRoseState = snap.val() || {};
    mergePlayerRoseIntoState();
    renderPage(currentPage());
  }, err => {
    console.warn("⚠️ subscribePlayerRose error:", err.code, "— retry in 5s");
    _playerRoseUnsubscribe = null;
    setTimeout(() => { if (currentLegaId === legaId) subscribePlayerRose(legaId); }, 5000);
  });
}

// Fonde i partecipanti/rose auto-registrati nello state in-memory.
// I membri auto-iscritti gestiscono la propria rosa (fonte di verità = playerRose);
// i partecipanti aggiunti manualmente dall'admin (senza uid) restano intatti.
function mergePlayerRoseIntoState() {
  if (!_playerRoseState || typeof _playerRoseState !== "object") return;
  if (!Array.isArray(state.partecipanti)) state.partecipanti = [];
  state.partecipanti = state.partecipanti.filter(Boolean);
  if (!state.rose || typeof state.rose !== "object") state.rose = {};
  for (const [uid, data] of Object.entries(_playerRoseState)) {
    if (!data) continue;
    let part = state.partecipanti.find(p => p && p.uid === uid);
    if (!part) {
      part = { id: uid, nome: data.nome || "Giocatore", uid, capitanoGiocatore: null };
      state.partecipanti.push(part);
    } else if (data.nome && !part._adminNome) {
      part.nome = data.nome;
    }
    if (data.rosa && typeof data.rosa === "object") {
      state.rose[part.id] = data.rosa;
    }
    if (data.capitano !== undefined) {
      part.capitanoGiocatore = data.capitano || null;
    }
  }
}

// Scrive la propria iscrizione/rosa su Firebase (nodo self-service)
async function _saveMyPlayerRose(patch) {
  if (!currentUser || !currentLegaId || !window._db || !window._set || !window._ref) return false;
  const uid = currentUser.uid;
  const nomeDefault = currentUser.displayName || currentUser.email?.split('@')[0] || "Giocatore";
  const existing = _playerRoseState[uid] || {};
  const payload = {
    nome:     existing.nome || nomeDefault,
    joinedAt: existing.joinedAt || Date.now(),
    rosa:     existing.rosa || null,
    capitano: existing.capitano ?? null,
    nascosta: existing.nascosta ?? false,
    ...patch,
    updatedAt: Date.now()
  };
  try {
    await window._set(window._ref(window._db, `leghe/${currentLegaId}/playerRose/${uid}`), payload);
    _playerRoseState[uid] = payload;
    mergePlayerRoseIntoState();
    return true;
  } catch(e) { console.warn("_saveMyPlayerRose:", e); return false; }
}

// Registra l'utente come membro della lega al primo ingresso (se non già presente)
async function _ensureMyMembership() {
  if (!currentUser || !currentLegaId || !window._db || !window._onVal || !window._ref) return;
  const uid = currentUser.uid;
  // Se l'admin mi ha già aggiunto come partecipante per uid, non serve
  if (state.partecipanti?.find(p => p.uid === uid)) return;
  try {
    const snap = await new Promise((res, rej) => {
      try { window._onVal(window._ref(window._db, `leghe/${currentLegaId}/playerRose/${uid}`), res, { onlyOnce: true }); }
      catch(e) { rej(e); }
    });
    if (snap.exists()) return; // già iscritto: non sovrascrivere la rosa esistente
    const nome = currentUser.displayName || currentUser.email?.split('@')[0] || "Giocatore";
    await window._set(window._ref(window._db, `leghe/${currentLegaId}/playerRose/${uid}`), {
      nome, joinedAt: Date.now(), rosa: null, capitano: null, updatedAt: Date.now()
    });
  } catch(e) { console.warn("_ensureMyMembership:", e); }
}

// Ritorna l'id della finestra attualmente aperta (1|2|3) o null
function getCurrentFinestraAperta() {
  const now = Date.now();
  for (const [id, f] of Object.entries(FINESTRE_TIMING)) {
    const openMs  = new Date(f.open).getTime();
    const closeMs = f.close ? new Date(f.close).getTime() : Infinity;
    if (now >= openMs && now < closeMs) return Number(id);
  }
  return null;
}

// Sostituzioni effettive per un partecipante:
// le sost. admin (state.sostituzioni) hanno priorità su quelle self-service
function getSostEffective(partId) {
  const uid = state.partecipanti?.find(p => p.id === partId)?.uid;
  const adminSost  = state.sostituzioni?.[partId] || {};
  const playerSost = uid ? (_playerSostState[uid] || {}) : {};
  const merged = {};
  const allFid = new Set([...Object.keys(adminSost), ...Object.keys(playerSost)]);
  for (const fId of allFid) {
    const a = adminSost[fId];
    merged[fId] = (Array.isArray(a) && a.length > 0) ? a : (playerSost[fId] || []);
  }
  return merged;
}

// Rosa effettiva per un partecipante in una giornata specifica (applica sost.)
// Finestra N vale dalla giornata N+1 in poi
function getEffectiveRosa(partId, gId) {
  const base = state.rose[partId];
  if (!base) return null;
  let rosa = JSON.parse(JSON.stringify(base));
  const giornataNum = Number(gId);
  const allSost = getSostEffective(partId);
  const capitano = state.partecipanti?.find(p => p.id === partId)?.capitanoGiocatore || null;
  for (const [fIdStr, sosts] of Object.entries(allSost)) {
    const fId = Number(fIdStr);
    if (giornataNum <= fId) continue; // finestra N vale da giornata N+1
    for (const s of (sosts || [])) {
      if (capitano && s.outNome === capitano) continue; // il capitano non può essere sostituito
      const arr = rosa[s.ruolo];
      if (!arr) continue;
      const idx = arr.findIndex(g => g.nome === s.outNome && g.nazione === s.outNazione);
      if (idx !== -1) arr[idx] = { nome: s.inNome, nazione: s.inNazione };
    }
  }
  return rosa;
}

// Listener Firebase per playerSostituzioni di tutta la lega
function subscribePlayerSostituzioni(legaId) {
  if (_playerSostUnsubscribe) { _playerSostUnsubscribe(); _playerSostUnsubscribe = null; }
  if (!window._onVal || !window._db) return;
  const path = window._ref(window._db, `leghe/${legaId}/playerSostituzioni`);
  _playerSostUnsubscribe = window._onVal(path, snap => {
    _playerSostState = snap.val() || {};
    // Re-render se siamo nella pagina classifica, giornata, squadra o stats
    const activePage = document.querySelector(".page.active")?.id;
    if (activePage === "page-classifica") renderClassifica();
    if (activePage === "page-giornata")   renderGiornata();
    if (activePage === "page-squadra")    renderSostSelfService();
    if (activePage === "page-stats")      renderStats();
  });
}

function getSostituzioniPartecipante(partId) {
  if (!state.sostituzioni) state.sostituzioni = {};
  if (!state.sostituzioni[partId]) state.sostituzioni[partId] = {};
  return state.sostituzioni[partId];
}
function countSostTotali(partId) {
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
    `<option value="${p.id}" ${_sostSelectedPart===p.id?"selected":""}>${_escHtml(p.nome)}</option>`
  ).join("");

  const filterBar = `<div class="sost-filter-bar">
    <div class="filter-item">
      <label>Partecipante</label>
      <select id="sostPartSelect">${partOpts}</select>
    </div>
  </div>`;

  // Usa il primo partecipante se nessuno selezionato
  if (!_sostSelectedPart && state.partecipanti.length) {
    _sostSelectedPart = state.partecipanti[0].id;
  }
  const p = state.partecipanti.find(x => x.id === _sostSelectedPart);
  if (!p) { div.innerHTML = filterBar; return; }

  const rosa = state.rose[p.id];
  const totUsate = countSostTotali(p.id);
  const totRim = MAX_SOST_TOTALI - totUsate;

  // ── Storico effettivo (admin + player) ──
  const uid = state.partecipanti.find(x => x.id === p.id)?.uid;
  const sostEffective = getSostEffective(p.id);
  const storicoRows = FINESTRE.flatMap(f => {
    const arr = sostEffective[f.id] || [];
    if (!arr.length) return [];
    const isAdminFin = Array.isArray(state.sostituzioni?.[p.id]?.[f.id]) && state.sostituzioni[p.id][f.id].length > 0;
    return arr.map((s, si) => {
      // Supporta sia vecchio formato admin (out/in/nazione) sia nuovo (outNome/inNome/outNazione)
      const outNome = isAdminFin ? (s.outNome || s.out)     : s.outNome;
      const inNome  = isAdminFin ? (s.inNome  || s.in)      : s.inNome;
      const naz     = isAdminFin ? (s.outNazione || s.nazione) : s.outNazione;
      const typeBadge = isAdminFin
        ? '<span class="sost-admin-badge">admin</span>'
        : '<span class="sost-player-badge">player</span>';
      return `<div class="sost-storico-row">
        <span class="sost-finestra-badge">F${f.id}</span>
        <span class="ruolo-badge ruolo-${s.ruolo}">${s.ruolo}</span>
        ${typeBadge}
        <span class="sost-out">▼ ${_escHtml(outNome)}</span>
        <span class="sost-arrow">→</span>
        <span class="sost-in">▲ ${_escHtml(inNome)}</span>
        <span class="sost-naz">(${naz})</span>
        <button class="sost-edit-admin" data-pid="${p.id}" data-fid="${f.id}" data-idx="${si}" data-type="${isAdminFin ? 'admin' : 'player'}" data-uid="${uid || ''}" title="Modifica">✏️</button>
        <button class="btn-del sost-del" data-pid="${p.id}" data-fid="${f.id}" data-idx="${si}" data-type="${isAdminFin ? 'admin' : 'player'}" data-uid="${uid || ''}" title="Elimina">🗑️</button>
      </div>`;
    });
  }).join("");

  // ── Finestre ──
  const finestreHtml = FINESTRE.map(f => {
    const ruoliUsatiQuesta = getRuoliUsatiInFinestra(p.id, f.id);
    // Conta utilizzi per ruolo su TUTTE le finestre — escludi se raggiunto MAX_SOST_PER_RUOLO
    const roleCount = {};
    for (const f2 of FINESTRE) {
      for (const s of (sostEffective[f2.id] || [])) {
        roleCount[s.ruolo] = (roleCount[s.ruolo] || 0) + 1;
      }
    }
    const ruoliEsclusiAdmin = new Set(
      Object.keys(RUOLI).filter(r =>
        ruoliUsatiQuesta.includes(r) || (roleCount[r] || 0) >= MAX_SOST_PER_RUOLO
      )
    );
    const ruoliUsati = ruoliUsatiQuesta; // per badge (solo questa finestra)
    const ruoliDisp  = Object.keys(RUOLI).filter(r => !ruoliEsclusiAdmin.has(r));
    const limitRagg  = totUsate >= MAX_SOST_TOTALI;
    const key        = `${p.id}_${f.id}`;
    const isAperta   = !!_finestreAperte[key];

    // Header finestra con pulsante apri/chiudi
    const usedBadge = ruoliUsati.length
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
          <p style="font-size:12px;color:var(--accent);font-weight:700;margin-bottom:10px">✏️ Nuovo giocatore — nazione e ruolo verranno ereditati automaticamente</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div class="filter-item" style="flex:1;min-width:150px">
              <label>Nome giocatore</label>
              <input type="text" class="sost-nuovo-nome" placeholder="Es. Camavinga" data-pid="${p.id}" data-fid="${f.id}">
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              <label style="font-size:11px;color:var(--text2)">Nazione</label>
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
      ? `<p class="hint" style="margin:0;color:var(--red)">Limite di ${MAX_SOST_TOTALI} sostituzioni totali raggiunto.</p>`
      : ruoliDisp.length === 0
      ? `<p class="hint" style="margin:0">Tutti i ruoli già usati in questa finestra.</p>`
      : "";

    return `<div class="sost-finestra-block">
      <div class="sost-finestra-title">
        <span class="sost-finestra-badge">F${f.id}</span>
        <span style="font-weight:700">${f.label}</span>
        <span class="hint" style="margin:0;font-size:11px">${f.desc}</span>
        ${usedBadge}
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
        <span class="sost-part-nome">${_escHtml(p.nome)}</span>
        <span class="sost-counter ${totRim===0?"zero":totRim<=1?"low":""}">${totUsate}/${MAX_SOST_TOTALI} sostituzioni usate</span>
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

  // Populate OUT when ruolo changes
  div.querySelectorAll(".sost-sel-ruolo").forEach(sel => {
    populateSostOut(sel);
    sel.addEventListener("change", function() { populateSostOut(this); });
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
  // Usa la rosa effettiva a quella finestra (applica sost. finestre precedenti)
  const rosa   = getEffectiveRosa(pid, Number(fid)) || state.rose[pid];
  if (!rosa || !ruolo) return;

  const capitanoNomeAdmin = state.partecipanti?.find(p => p.id === pid)?.capitanoGiocatore || null;
  outSel.innerHTML = `<option value="">– Seleziona –</option>` +
    (rosa[ruolo] || [])
      .filter(g => g.nome !== capitanoNomeAdmin)  // il capitano non può essere sostituito
      .map(g => `<option value="${_escHtml(g.nome)}" data-naz="${g.nazione}">${_escHtml(g.nome)} (${g.nazione})</option>`)
      .join("");
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
      candidati.map(g => `<option value="${_escHtml(g.nome)}">${_escHtml(g.nome)}</option>`).join("") +
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

  // Aggiungi a giocatoriSquadra se nuovo (senza mutare la rosa base)
  if (!state.giocatoriSquadra[naz]) state.giocatoriSquadra[naz] = [];
  if (!state.giocatoriSquadra[naz].some(g => g.nome === inNome)) {
    state.giocatoriSquadra[naz].push({ nome: inNome, ruolo });
  }

  // Stesso formato delle sost. player: delta applicato da getEffectiveRosa
  state.sostituzioni[pid][fid].push({ ruolo, outNome, outNazione: naz, inNome, inNazione: naz });
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

  // Elimina sostituzione
  if (e.target && e.target.classList.contains("sost-del")) {
    const pid  = e.target.dataset.pid;
    const fid  = parseInt(e.target.dataset.fid);
    const idx  = parseInt(e.target.dataset.idx);
    const type = e.target.dataset.type;
    const uid  = e.target.dataset.uid;
    if (!confirm("Eliminare questa sostituzione?")) return;
    _adminDeleteSost(pid, fid, idx, type, uid).then(() => {
      renderAdmin();
      toast("Sostituzione eliminata.");
    });
  }

  // Modifica sostituzione (delete + riapri form)
  if (e.target && e.target.classList.contains("sost-edit-admin")) {
    const pid  = e.target.dataset.pid;
    const fid  = parseInt(e.target.dataset.fid);
    const idx  = parseInt(e.target.dataset.idx);
    const type = e.target.dataset.type;
    const uid  = e.target.dataset.uid;
    _adminDeleteSost(pid, fid, idx, type, uid).then(() => {
      _finestreAperte[`${pid}_${fid}`] = true;
      renderAdmin();
      toast("Sostituzione rimossa — modifica e riconferma.");
    });
  }
});

async function _adminDeleteSost(pid, fid, idx, type, uid) {
  if (type === "admin") {
    const sost = state.sostituzioni?.[pid]?.[fid]?.[idx];
    if (sost) {
      // Formato vecchio (out/in/nazione): ripristina la rosa base che era stata mutata
      if (sost.out !== undefined) {
        const rosa = state.rose[pid];
        if (rosa && rosa[sost.ruolo]) {
          const i = rosa[sost.ruolo].findIndex(g => g.nome === sost.in);
          if (i !== -1) rosa[sost.ruolo][i] = { nome: sost.out, nazione: sost.nazione };
        }
      }
      // Formato nuovo (outNome/inNome): niente da ripristinare, era solo un delta
      state.sostituzioni[pid][fid].splice(idx, 1);
    }
    saveState();
  } else {
    // player sost: rimuovi da Firebase
    if (!uid || !currentLegaId || !window._db || !window._set || !window._ref) return;
    const existing = (_playerSostState[uid]?.[fid]) || [];
    const updated  = existing.filter((_, i) => i !== idx);
    await window._set(
      window._ref(window._db, `leghe/${currentLegaId}/playerSostituzioni/${uid}/${fid}`),
      updated.length > 0 ? updated : null
    );
  }
}

// ── HELPERS ───────────────────────────────────────────────────
function populateSel(id,items,labelKey,valueKey,placeholder,placeholderVal) {
  const sel=document.getElementById(id);
  if (!sel) return;
  const prev=sel.value;
  sel.innerHTML=`<option value="${placeholderVal}">${placeholder}</option>`+
    items.map(i=>`<option value="${_escHtml(i[valueKey])}">${_escHtml(i[labelKey])}</option>`).join("");
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
        <div class="sidebar-username">${_escHtml(currentUser.displayName || "Utente")}</div>
        <div class="sidebar-email">${_escHtml(currentUser.email)}</div>
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
      window._onVal(window._ref(window._db, "users/" + currentUser.uid + "/leghe"), async uSnap => {
        const userLeghe = Object.entries(await _aliveUserLeghe(uSnap.val()));
        const list = document.getElementById("sidebarLegheList");
        if (!list) return;
        if (!userLeghe.length) {
          list.innerHTML = '<div class="sidebar-no-leghe">Nessuna lega ancora.<br>Creane una dalla home.</div>';
          return;
        }
        list.innerHTML = userLeghe.map(([id, l]) => `
          <div class="sidebar-lega-item${currentLegaId===id?" active":""}" data-id="${id}">
            <span class="sidebar-lega-name">${_escHtml(l.nome||id)}</span>
          </div>`).join("");
        list.querySelectorAll(".sidebar-lega-item").forEach(item => {
          item.addEventListener("click", function() { joinLegaById(this.dataset.id, closeSidebar); });
        });
      }, {onlyOnce:true});
    }
  } else {
    // Not logged in: show login form
    content.innerHTML = `
      <div class="sidebar-auth-header">${t("sidebar.login_header")}</div>
      <div class="auth-tabs" style="margin-bottom:16px">
        <button class="auth-tab active" data-tab="login">${t("sidebar.tab_login")}</button>
        <button class="auth-tab" data-tab="register">${t("sidebar.tab_register")}</button>
      </div>
      <div id="sidebarAuthLogin" class="auth-form">
        <div class="field-group"><label>Email</label><input type="email" id="sidebarEmail" placeholder="tua@email.com" autocomplete="email"></div>
        <div class="field-group"><label>Password</label><input type="password" id="sidebarPwd" placeholder="Password" autocomplete="current-password"></div>
        <button class="btn-primary" id="btnSidebarLogin" style="width:100%">${t("sidebar.btn_login")}</button>
        <p class="pwd-error" id="sidebarLoginErr"></p>
        <p style="text-align:center;margin-top:8px">
          <button id="btnForgotPwd" style="background:none;border:none;color:var(--text2);font-size:12px;cursor:pointer;text-decoration:underline;padding:0;transition:color .2s" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text2)'">${t("sidebar.forgot_pwd")}</button>
        </p>
      </div>
      <div id="sidebarAuthReset" class="auth-form" style="display:none">
        <p style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.5">${t("sidebar.reset_desc")}</p>
        <div class="field-group"><label>Email</label><input type="email" id="sidebarResetEmail" placeholder="tua@email.com" autocomplete="email"></div>
        <button class="btn-primary" id="btnSidebarReset" style="width:100%">${t("sidebar.reset_btn")}</button>
        <p class="pwd-error" id="sidebarResetErr"></p>
        <p style="text-align:center;margin-top:8px">
          <button id="btnBackToLogin" style="background:none;border:none;color:var(--text2);font-size:12px;cursor:pointer;text-decoration:underline;padding:0;transition:color .2s" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text2)'">← ${t("sidebar.back_login")}</button>
        </p>
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
        content.querySelectorAll(".auth-tab").forEach(tab2=>tab2.classList.remove("active"));
        this.classList.add("active");
        document.getElementById("sidebarAuthLogin").style.display = this.dataset.tab==="login"?"":"none";
        document.getElementById("sidebarAuthRegister").style.display = this.dataset.tab==="register"?"":"none";
      });
    });

    // ── Forgot password ──────────────────────────────────────
    document.getElementById("btnForgotPwd")?.addEventListener("click", () => {
      const email = document.getElementById("sidebarEmail")?.value.trim();
      document.getElementById("sidebarAuthLogin").style.display = "none";
      document.getElementById("sidebarAuthReset").style.display = "";
      if (email) document.getElementById("sidebarResetEmail").value = email;
      document.getElementById("sidebarAuthReset").querySelector("input")?.focus();
    });
    document.getElementById("btnBackToLogin")?.addEventListener("click", () => {
      document.getElementById("sidebarAuthReset").style.display = "none";
      document.getElementById("sidebarAuthLogin").style.display = "";
      document.getElementById("sidebarResetErr").textContent = "";
    });
    document.getElementById("btnSidebarReset")?.addEventListener("click", async () => {
      const email = document.getElementById("sidebarResetEmail").value.trim();
      const err = document.getElementById("sidebarResetErr");
      const btn = document.getElementById("btnSidebarReset");
      if (!email) { err.textContent = "Inserisci la tua email."; err.style.color="var(--red)"; return; }
      btn.textContent = "⏳..."; btn.disabled = true;
      const res = await resetPassword(email);
      btn.disabled = false;
      if (res.error) {
        err.textContent = res.error; err.style.color = "var(--red)";
        btn.textContent = t("sidebar.reset_btn");
      } else {
        err.style.color = "var(--green)";
        err.textContent = t("sidebar.reset_sent");
        btn.textContent = "✓ Inviata";
      }
    });

    document.getElementById("btnSidebarLogin")?.addEventListener("click", async () => {
      const email = document.getElementById("sidebarEmail").value.trim();
      const pwd = document.getElementById("sidebarPwd").value;
      const err = document.getElementById("sidebarLoginErr");
      if (!email||!pwd) { err.textContent="Compila tutti i campi!"; return; }
      document.getElementById("btnSidebarLogin").textContent="⏳...";
      const res = await signIn(email, pwd);
      if (res.error) { err.textContent=res.error; document.getElementById("btnSidebarLogin").textContent=t("sidebar.btn_login"); return; }
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
      <button class="btn-primary" onclick="toggleSidebar()">${t("sidebar.my_leagues")}</button>
      <button class="btn-primary" onclick="renderHomeCreateForm()">${t("sidebar.create_league")}</button>
      <button class="btn-sec" onclick="renderHomeJoinForm()">${t("sidebar.join_league")}</button>`;
  } else {
    btnsWrap.innerHTML = `
      <button class="btn-primary" onclick="toggleSidebar()">${t("hero.login")}</button>
      <button class="btn-sec" onclick="toggleSidebarRegister()">${t("hero.register")}</button>`;
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

    // Carica leghe pubbliche dall'indice (dati non sensibili)
    window._onVal(window._ref(window._db, "indice"), snap => {
      const idx = snap.val() || {};
      const listEl = document.getElementById("joinLegheList");
      if (!listEl) return;
      const pubbliche = Object.entries(idx).filter(([,l]) => l.pubblica);
      if (!pubbliche.length) {
        listEl.innerHTML = '<p style="color:var(--text2);font-size:13px;">Nessuna lega pubblica disponibile.</p>';
      } else {
        listEl.innerHTML = pubbliche.map(([id, l]) => {
          return `<div class="lega-card" style="margin-bottom:8px">
            <div class="lega-card-name">${_escHtml(l.nome || id)}</div>
            <button class="btn-primary lega-join-btn" style="margin-top:6px;width:100%" data-id="${id}">Entra →</button>
          </div>`;
        }).join('');
        listEl.querySelectorAll('.lega-join-btn').forEach(btn => {
          btn.addEventListener('click', () => joinLegaById(btn.dataset.id, closeSidebar));
        });
      }
    }, {onlyOnce: true});

    // Codice privato — stesso pattern di sbEntra che già funziona
    document.getElementById("btnJoinCodice")?.addEventListener("click", () => {
      const codice = document.getElementById("joinCodiceInput")?.value.trim().toUpperCase();
      const errEl = document.getElementById("joinEntraErr");
      if (!codice) { errEl.textContent = "Inserisci un codice!"; return; }
      errEl.textContent = "⏳ Ricerca...";
      _resolveCodice(codice).then(id => {
        if (id) joinLegaById(id, closeSidebar);
        else errEl.textContent = "❌ Codice non trovato.";
      });
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
        const waMsg = encodeURIComponent(`🏆 Ho creato la lega "${nome}" su ArenaSerieA per la Serie A 2026/27!\nEntra qui 👉 ${link}`);
        res.style.color="var(--green)";
        res.innerHTML=`
          <div style="margin-bottom:8px">✓ Lega <strong>${legaId}</strong> creata!</div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:10px">Condividi il link con i tuoi amici:</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn-sec" style="font-size:11px;padding:4px 10px"
              onclick="navigator.clipboard.writeText('${link}').then(()=>toast('📋 Link copiato!'))">📋 Copia link</button>
            <a href="https://wa.me/?text=${waMsg}" target="_blank" rel="noopener"
              style="display:inline-flex;align-items:center;gap:4px;background:#25D366;color:#fff;border:none;border-radius:6px;font-size:11px;padding:4px 10px;cursor:pointer;text-decoration:none;font-weight:600">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.529 5.855L.057 23.882l6.198-1.625A11.935 11.935 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.659-.504-5.186-1.385l-.372-.22-3.679.965.98-3.585-.242-.379A9.943 9.943 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
              WhatsApp
            </a>
          </div>`;
        setTimeout(()=>{ closeSidebar(); entraInLega(legaId, meta); }, 3000);
      }
    });

    document.getElementById("btnSbEntra")?.addEventListener("click", () => {
      const codice = document.getElementById("sbCodiceInput").value.trim().toUpperCase();
      const err = document.getElementById("sbEntraErr");
      if (!codice) { err.textContent="Inserisci un codice!"; return; }
      err.textContent="⏳ Ricerca...";
      _resolveCodice(codice).then(id=>{
        if(id) joinLegaById(id, closeSidebar);
        else err.textContent="❌ Codice non trovato.";
      });
    });
  }, 60);
}

function exitLega() {
  currentLegaId = null; currentLegaMeta = null;
  state = defaultLegaState();
  if (_playerRoseUnsubscribe) { _playerRoseUnsubscribe(); _playerRoseUnsubscribe = null; }
  _playerRoseState = {};
  adminUnlocked = false; votiUnlocked = false; superadminUnlocked = false;
  aggiornaTabAdmin();
  localStorage.removeItem("ucl_lastLega"); localStorage.removeItem("ucl_lastLegaMeta");
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

async function resetPassword(email) {
  if (!window._fbAuth) return { error: "Firebase Auth non disponibile" };
  try {
    const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    await sendPasswordResetEmail(window._fbAuth, email);
    return { ok: true };
  } catch(e) { return { error: translateAuthError(e.code) }; }
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
          <select id="superGiornata">${giornateOptions()}</select>
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
        <button class="btn-sec" id="btnSuperFixNazioni" style="margin-left:8px">🔧 Fix nomi nazioni</button>
        <p class="parse-result" id="superGiocatoriResult" style="margin-top:10px"></p>
        <div id="superGiocatoriPreview" style="margin-top:12px"></div>
      </div>
      <div class="admin-card" style="grid-column:1/-1">
        <h3>🔴 Partite Live – Voti Sofascore</h3>
        <p class="hint">Il poller aggiorna i voti automaticamente ogni 5 minuti durante le partite. Qui puoi vedere lo stato e forzare un aggiornamento manuale per singola partita.</p>
        <div class="field-group" style="margin-bottom:12px">
          <label>Giornata</label>
          <select id="superLiveGiornata">${giornateOptions()}</select>
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
            <select id="superSelectGiornata">${giornateOptions()}</select>
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
    await window._set(window._ref(window._db, "indice"), null);
    Object.keys(localStorage).filter(k => k.startsWith("ucl_lega_")).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem("ucl_lastLega"); localStorage.removeItem("ucl_lastLegaMeta");
    toast("Leghe eliminate."); renderSuperadminPage();
  });
  document.getElementById("btnDelAll")?.addEventListener("click", async () => {
    if (!confirm("RESET TOTALE?")) return;
    if (!confirm("Sicuro sicuro?")) return;
    await window._set(window._ref(window._db, "leghe"), null);
    await window._set(window._ref(window._db, "indice"), null);
    await window._set(window._ref(window._db, "global"), null);
    localStorage.clear(); location.reload();
  });

  const sel = document.getElementById("superSelectSquadra");
  let opts = '<option value="">– Seleziona –</option>';
  const squadreList = typeof SQUADRE !== "undefined" ? SQUADRE : [];
  for (const n of squadreList) opts += `<option value="${n}">${n}</option>`;
  sel.innerHTML = opts;
  sel.addEventListener("change", renderSuperVotiTable);
  document.getElementById("superSelectGiornata")?.addEventListener("change", renderSuperVotiTable);
  document.getElementById("superBtnSalvaVoti")?.addEventListener("click", saveSuperVoti);

  // (sezione Migrazione Nomi Rose + Alias Sofascore rimossa dal pannello superadmin)

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
            `<strong>${sq}</strong>: ${gioc.map(g=>`${_escHtml(g.nome)} (${g.ruolo})`).join(', ')}`
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

  document.getElementById("btnSuperFixNazioni")?.addEventListener("click", async () => {
    const resEl = document.getElementById("superGiocatoriResult");
    const gs = globalState.giocatoriSquadra || {};
    const aliasKeys = Object.keys(NAZIONE_ALIASES).filter(a => gs[a]);
    if (!aliasKeys.length) {
      resEl.style.color = "var(--text2)";
      resEl.textContent = "✅ Nessun alias da correggere nel database.";
      return;
    }
    normalizeGiocatoriSquadra(gs);
    globalState.giocatoriSquadra = gs;
    saveGlobalState();
    resEl.style.color = "var(--green)";
    resEl.textContent = "✅ Corretti: " + aliasKeys.join(", ") + " → nomi canonici.";
    toast("Fix nomi nazioni completato!");
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
  if (now < ko)        return { label: t("match_status.upcoming"), cls: "match-status-upcoming", icon: "🕐" };
  if (now <= end)      return { label: t("match_status.live"),     cls: "match-status-live",     icon: "🔴" };
  if (now <= finalized)return { label: t("match_status.recent"),   cls: "match-status-recent",   icon: "✅" };
  return                      { label: t("match_status.done"),     cls: "match-status-done",     icon: "✔️" };
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
    const res = await fetch(`.netlify/functions/sofascore-proxy?eventId=${eventId}&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`);
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
        const key = safeKey(p.name);
        const existing = globalState.voti[nazione][gId][key] || {};
        // Preserva modifiche manuali ai flags se già presenti
        const flagsDaUsare = (existing.source === "sofascore" && existing.flags && Object.keys(existing.flags).length > 0)
          ? existing.flags
          : (p.flags || {});
        if (p.didNotPlay || (p.minutesPlayed === 0 && p.rating === null)) {
          globalState.voti[nazione][gId][key] = { sv: true, flags: flagsDaUsare, source: "sofascore" };
        } else if (p.rating !== null) {
          globalState.voti[nazione][gId][key] = { v: p.rating, sv: false, flags: flagsDaUsare, source: "sofascore" };
          if (side === "home") countHome++; else countAway++;
        }
      }
      // Giocatori assenti dalla formazione (infortunati, non convocati) → SV
      if (players.length > 0) {
        for (const g of (globalState.giocatoriSquadra?.[nazione] || [])) {
          if (!g?.nome) continue;
          const key = safeKey(g.nome);
          if (!globalState.voti[nazione][gId][key]) {
            globalState.voti[nazione][gId][key] = { sv: true, source: "sofascore" };
          }
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
  if (isNazioneEliminata(naz, gId)) {
    wrap.insertAdjacentHTML("beforebegin", `<div id="superElimBanner" style="background:rgba(239,68,68,.12);border:1px solid #ef4444;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#fca5a5">🚫 <strong>${naz}</strong> è eliminata — i voti sono bloccati per gli admin lega. Qui puoi comunque fare correzioni.</div>`);
  } else {
    document.getElementById("superElimBanner")?.remove();
  }
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
    const entry = savedVoti[safeKey(g.nome)] || {};
    const isSV = !!entry.sv; const v = entry.v !== undefined ? entry.v : "";
    const flags = entry.flags || {}; const bns = calcFlagsBonus(flags, g.ruolo);
    const tot = isSV ? 0 : (parseFloat(v) || 0) + bns;
    const fromSofa = entry.source === "sofascore";
    const fd = getFlagsForRuolo(g.ruolo);
    const fh = fd.map(f => {
      const val = flags[f.key];
      if (f.multi) { const cnt = val || 0; return `<span class="flag-multi-wrap ${f.cls}${cnt > 0 ? " active" : ""}" data-flag="${f.key}" data-nome="${safeKey(g.nome)}"><button class="flag-multi-dec" data-flag="${f.key}" data-nome="${safeKey(g.nome)}" ${cnt === 0 ? "disabled" : ""}>−</button><span class="flag-multi-label">${f.label.split(" ")[0]} <span class="flag-multi-count">${cnt}</span></span><button class="flag-multi-inc" data-flag="${f.key}" data-nome="${safeKey(g.nome)}">+</button></span>`; }
      return `<button class="flag-btn ${f.cls}${val ? " active" : ""}" data-flag="${f.key}" data-multi="false" data-nome="${safeKey(g.nome)}">${f.label}</button>`;
    }).join("");
    return `<tr data-nome="${safeKey(g.nome)}" data-ruolo="${g.ruolo}"><td><span class="ruolo-badge ruolo-${g.ruolo}">${g.ruolo}</span></td><td style="font-weight:600">${fromSofa ? '<span title="Voto Sofascore" style="font-size:10px;margin-right:4px">🔴</span>' : ""}${_escHtml(g.nome)}</td><td class="center"><input type="number" class="inp-v" data-nome="${safeKey(g.nome)}" value="${v}" step="0.5" min="0" max="10" placeholder="–" ${isSV ? "disabled style='opacity:.4'" : ""}><button class="sv-btn${isSV ? " active" : ""}" data-nome="${safeKey(g.nome)}">SV</button></td><td><div class="flags-wrap">${fh}</div></td><td class="center"><span class="totale-voto-cell${tot < 0 ? " totale-voto-neg" : ""}" id="svtot_${safeId(g.nome)}">${isSV ? "SV" : v !== "" ? tot.toFixed(1) : "–"}</span></td><td class="center"><button class="btn-icon" data-svdel="${safeKey(g.nome)}" style="color:var(--orange)">✕</button></td></tr>`;
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
// ── Helper letture leghe (compatibili con le regole: meta pubblico, resto per-membro) ──
function _fetchLegaMeta(id){
  return new Promise(res=>{
    if(!window._fbReady||!window._db||!window._onVal){ res(null); return; }
    try{ window._onVal(window._ref(window._db, `leghe/${id}/meta`), s=>res(s.val()), {onlyOnce:true}); }
    catch(e){ res(null); }
  });
}
// Risolve un codice (legaId diretto oppure meta.codice via indice pubblico) -> legaId
async function _resolveCodice(codice){
  const cu = String(codice||"").toUpperCase();
  if(!cu) return null;
  if(await _fetchLegaMeta(cu)) return cu;
  return new Promise(res=>{
    try{ window._onVal(window._ref(window._db, "indice"), s=>{
      const all=s.val()||{};
      const found=Object.entries(all).find(([,l])=>String(l.codice||"").toUpperCase()===cu);
      res(found?found[0]:null);
    }, {onlyOnce:true}); }
    catch(e){ res(null); }
  });
}
// Entra in una lega dato l'id: valida via meta (pubblico), poi entraInLega (che crea la membership).
async function joinLegaById(id, closeFn){
  if(!id) return;
  if(!currentUser){ toast("Accedi per entrare in una lega.", true); return; }
  const meta = await _fetchLegaMeta(id);
  if(!meta){ toast("Lega non trovata!", true); return; }
  if(typeof closeFn==="function") closeFn();
  await entraInLega(id, meta);
}
// Ritorna solo le leghe dell'utente ancora esistenti (meta presente) e rimuove
// dall'indice utente quelle eliminate (es. dal superadmin), che il proprietario
// dell'account può ripulire da sé (le regole vietano di toccare users altrui).
async function _aliveUserLeghe(obj){
  const entries = Object.entries(obj || {});
  const checked = await Promise.all(entries.map(async ([id, v]) => [id, v, await _fetchLegaMeta(id)]));
  const alive = {};
  for (const [id, v, meta] of checked){
    if (meta) alive[id] = v;
    else if (currentUser) { try { await window._set(window._ref(window._db, `users/${currentUser.uid}/leghe/${id}`), null); } catch(e){} }
  }
  return alive;
}

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
    // Indice pubblico (dati non sensibili) per lobby/ricerca codice
    await window._set(window._ref(window._db, "indice/" + legaId), {
      nome, pubblica, codice: meta.codice, adminUid: uid, createdAt: meta.createdAt
    });
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

async function entraInLega(legaId, legaMeta) {
  currentLegaId = legaId; currentLegaMeta = legaMeta || null;
  state = sanitizeLegaState(null);
  localStorage.setItem("ucl_lastLega", legaId);
  if (legaMeta) localStorage.setItem("ucl_lastLegaMeta", JSON.stringify(legaMeta));
  // Update URL
  history.pushState(null, '', '?lega=' + legaId);
  const navLinks = document.querySelector(".nav-links");
  const hamburger = document.getElementById("hamburger");
  if (navLinks) navLinks.style.display = "";
  if (hamburger) hamburger.style.display = "flex";
  // Auto-sblocco admin per il creatore della lega
  if (isCreatoreCorrente()) {
    adminUnlocked = true;
    ["adminLockIcon","adminLockIconMobile"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="🔓";});
  } else {
    adminUnlocked = false;
    ["adminLockIcon","adminLockIconMobile"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="🔒";});
  }
  aggiornaTabAdmin();
  // Membership PRIMA di leggere state/rose/chat: le regole RTDB le consentono
  // solo ai membri (playerRose/uid) o all'admin. _ensureMyMembership scrive il
  // proprio nodo playerRose, sbloccando le letture successive.
  if (currentUser) { await _ensureMyMembership(); addLegaToUser(currentUser.uid, legaId, legaMeta?.nome || legaId); }
  listenGlobal(); listenLega(legaId);
  subscribePlayerSostituzioni(legaId);
  subscribePlayerRose(legaId);
  const savedTab = localStorage.getItem("ucl_tab");
  navigate(savedTab && savedTab !== "home" ? savedTab : "home");
  initPushBtn();
}

function exitLega() {
  currentLegaId = null; currentLegaMeta = null;
  state = defaultLegaState();
  if (_playerRoseUnsubscribe) { _playerRoseUnsubscribe(); _playerRoseUnsubscribe = null; }
  _playerRoseState = {};
  adminUnlocked = false; votiUnlocked = false; superadminUnlocked = false;
  aggiornaTabAdmin();
  localStorage.removeItem("ucl_lastLega"); localStorage.removeItem("ucl_lastLegaMeta");
  localStorage.removeItem("ucl_tab");
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
    const pubbliche = Object.entries(leghe).filter(([,l]) => l.pubblica);

    let html = '';

    // ── Auth section ──
    if (user) {
      html += `<div class="lobby-section lobby-user-section">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span>👤 <strong>${_escHtml(user.displayName || user.email)}</strong></span>
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
            <div class="lega-card-name">${_escHtml(l.nome || id)}</div>
            <div class="lega-card-badge">${l.pubblica ? "🌍 Pubblica" : "🔒 Privata"}</div>
            ${l.adminUid === user.uid ? '<div style="font-size:10px;color:var(--accent);font-weight:700">👑 Admin</div>' : ''}
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
            <div class="lega-card-name">${_escHtml(l.nome || id)}</div>
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
      // onAuthStateChanged gestisce render lobby ed eventuale ingresso ultima lega
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
      if (hash === SUPERADMIN_PWD_HASH && currentUser?.uid === SUPERADMIN_UID) {
        superadminUnlocked = true;
        // Show nav
        const nl=document.querySelector(".nav-links"); if(nl) nl.style.display="";
        const hb=document.getElementById("hamburger"); if(hb) hb.style.display="flex";
        // Hide lobby explicitly
        const lobby=document.getElementById("page-lobby");
        if(lobby){lobby.classList.remove("active");lobby.style.display="none";}
        // Navigate to superadmin
        navigate("superadmin");
      } else { document.getElementById("superPwdError").textContent = hash === SUPERADMIN_PWD_HASH ? "Accedi con l'account amministratore." : "❌ Password errata"; }
    });
    document.getElementById("superPwdInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") document.getElementById("btnSuperSubmit")?.click();
    });

    // ── Join buttons ──
    wrap.querySelectorAll(".lega-join-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        this.textContent = "⏳..."; this.disabled = true;
        joinLegaById(this.dataset.id);
      });
    });

    // ── Join private ──
    document.getElementById("btnEntraPrivata")?.addEventListener("click", () => {
      const codice = document.getElementById("legaCodiceInput").value.trim().toUpperCase();
      const errEl = document.getElementById("legaCodiceError");
      if (!codice) { errEl.textContent = "Inserisci un codice!"; return; }
      errEl.textContent = "⏳ Ricerca...";
      _resolveCodice(codice).then(id => {
        if (id) joinLegaById(id);
        else errEl.textContent = "❌ Codice non trovato.";
      });
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
        setTimeout(() => entraInLega(legaId, meta), 1500);
      }
    });
  }

  if (window._fbReady && window._db) {
    // Load user leghe if logged in
    if (currentUser) {
      window._onVal(window._ref(window._db, "users/" + currentUser.uid + "/leghe"), async snap => {
        currentUser._leghe = await _aliveUserLeghe(snap.val());
        window._onVal(window._ref(window._db, "indice"), allSnap => {
          buildLobby(allSnap.val() || {});
        }, { onlyOnce: true });
      }, { onlyOnce: true });
    } else {
      buildLobby({});
    }
  } else {
    buildLobby({});
  }
}

function checkUrlLega() {
  if (currentLegaId) return true; // già in una lega (es. entrati via onAuthStateChanged): non riaprire la lobby
  const params = new URLSearchParams(location.search);
  const legaId = params.get("lega")?.toUpperCase();
  if (legaId) localStorage.setItem("ucl_lastLega", legaId);
  // L'ingresso effettivo richiede auth + membership: lo esegue onAuthStateChanged
  // appena l'utente è noto. Qui mostriamo la lobby se c'è un target da aprire.
  if (legaId || localStorage.getItem("ucl_lastLega")) { showLobby(); return true; }
  return false;
}


// ── SUPERADMIN MODAL ──
// Accesso via Ctrl+Shift+S (desktop) o ?sa=1 in URL (mobile)
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === "S") {
    document.getElementById("superadminModal").style.display = "flex";
    setTimeout(() => document.getElementById("superModalPwd")?.focus(), 50);
  }
});
if (new URLSearchParams(location.search).get("sa") === "1") {
  window.history.replaceState({}, "", location.pathname);
  const _openSuperModal = () => {
    document.getElementById("superadminModal").style.display = "flex";
    setTimeout(() => document.getElementById("superModalPwd")?.focus(), 50);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _openSuperModal);
  } else {
    _openSuperModal();
  }
}
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnSuperModalSubmit")?.addEventListener("click", async () => {
    const val = document.getElementById("superModalPwd").value;
    const hash = await sha256(val);
    if (hash === SUPERADMIN_PWD_HASH && currentUser?.uid === SUPERADMIN_UID) {
      superadminUnlocked = true;
      document.getElementById("superadminModal").style.display = "none";
      document.getElementById("superModalPwd").value = "";
      // Show nav tabs for superadmin
      document.getElementById("navLinks").style.display = "";
      document.getElementById("hamburger").style.display = "flex";
      navigate("superadmin");
    } else {
      document.getElementById("superModalErr").textContent = hash === SUPERADMIN_PWD_HASH ? "Accedi con l'account amministratore." : "❌ Password errata";
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
  if (typeof applyTranslations === "function") applyTranslations();
  listenGlobal();
  if (window._fbReady && window._db) {
    window._onVal(window._ref(window._db,"global"), snap=>{
      const d=snap.val();
      if(d&&(d._updatedAt||0)>(globalState._updatedAt||0)){
        globalState=sanitizeGlobalState(d);
        localStorage.setItem("ucl_global",JSON.stringify(globalState));
      }
      if(!checkUrlLega()){
        renderHomeButtons();
        navigate("home");
      }
      _hideAuthLoader();
    },{onlyOnce:true});
  } else {
    if(!checkUrlLega()){ renderHomeButtons(); navigate("home"); }
    _hideAuthLoader();
  }
}

function _hideAuthLoader() {
  const el = document.getElementById("authLoader");
  if (!el) return;
  el.classList.add("hidden");
  setTimeout(() => el.remove(), 250);
}

function initAuth() {
  if(!window._fbAuth){_hideAuthLoader();startApp();return;}
  import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js").then(({onAuthStateChanged})=>{
    onAuthStateChanged(window._fbAuth, user=>{
      currentUser=user;
      if(!currentLegaId){
        const params = new URLSearchParams(location.search);
        const target = (params.get("lega")?.toUpperCase()) || localStorage.getItem("ucl_lastLega");
        if(user && target){ joinLegaById(target); return; }
        renderHomeButtons();
        renderSidebar();
      }
    });
  }).catch(()=>{_hideAuthLoader();startApp();});
}

// First load
setTimeout(()=>{
  if(window._fbReady) { initAuth(); startApp(); }
  else{
    const chk=setInterval(()=>{if(window._fbReady){clearInterval(chk);initAuth();startApp();}},200);
    setTimeout(()=>{clearInterval(chk);_hideAuthLoader();if(!currentLegaId){renderHomeButtons();navigate("home");}},4000);
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

  const RUOLO_LABEL = { P:t("roles.P"), D:t("roles.D"), C:t("roles.C"), A:t("roles.A") };
  const RUOLO_ICON  = { P:"🧤", D:"🛡", C:"⚙️", A:"⚽" };

  let totalCount = 0;
  let html = "";

  // Serie A: iterazione flat su tutti i club presenti nel db (nessun girone)
  const ordine = { P:0, D:1, C:2, A:3 };
  const squadreOrdinate = SQUADRE.length > 0 ? SQUADRE : Object.keys(db).sort();
  let clubHtml = "";
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
    giocatori.sort((a,b) => (ordine[a.ruolo]??9) - (ordine[b.ruolo]??9) || a.nome.localeCompare(b.nome));
    clubHtml += `<div class="gioc-squadra-card">
      <div class="gioc-squadra-header">${squadra}</div>
      <div class="gioc-players-list">
        ${giocatori.map(g => `
          <div class="gioc-player-row gioc-role-${g.ruolo.toLowerCase()}">
            <span class="gioc-role-badge">${RUOLO_ICON[g.ruolo] || g.ruolo}</span>
            <span class="gioc-player-name">${_escHtml(g.nome)}</span>
            <span class="gioc-role-label">${RUOLO_LABEL[g.ruolo] || g.ruolo}</span>
          </div>`).join("")}
      </div>
    </div>`;
  });
  if (clubHtml) {
    html += `<div class="gioc-squadre-grid">${clubHtml}</div>`;
  }

  if (!html) {
    wrap.innerHTML = `<div class="gioc-empty"><span class="material-symbols-outlined" style="font-size:40px;color:var(--text2)">search_off</span><p>Nessun risultato trovato.</p></div>`;
  } else {
    wrap.innerHTML = html;
  }

  const countEl = document.getElementById("giocatoriCount");
  if (countEl) countEl.textContent = totalCount > 0 ? `${totalCount} giocator${totalCount===1?"e":"i"}` : "";
}


// ── LA MIA SQUADRA ───────────────────────────────────────────
const ROSA_REQUISITI = { P:3, D:6, C:6, A:5 };
const ROSA_TOTALE    = 20; // 3+6+6+5 — 1 giocatore per club Serie A (20 club)
const DEADLINE_ISO   = "2026-08-22T16:30:00Z"; // prima della prima partita Serie A G1 (22 ago ore 18:30 CEST)
const FINALE_ISO     = "2027-05-31T00:00:00Z"; // dopo l'ultima giornata Serie A 2026/27 (G38 = 30/05/2027)

function isDeadlinePassata() {
  // Deadline impostata dall'admin di lega (state.deadline). Se assente, la rosa
  // è sempre creabile/modificabile. Le finestre di sostituzione restano invariate.
  const dl = (typeof state !== "undefined" && state) ? state.deadline : null;
  if (!dl) return false;
  return Date.now() >= new Date(dl).getTime();
}
function isFinalePassata() {
  return Date.now() >= new Date(FINALE_ISO).getTime();
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
        <p class="subtitle" style="margin:4px 0 0">Scegli un giocatore per ogni squadra · 6P · 15D · 15C · 12A</p>
      </div>
      <div id="squadraTimerWrap" class="squadra-timer-wrap"></div>
    </div>

    <div class="squadra-progress-bar-wrap">
      <div class="squadra-req-row" id="squadraReqRow"></div>
      <div class="squadra-save-row">
        ${deadline
          ? ``
          : `<button class="btn-primary" id="btnSalvaSquadra" disabled>💾 Salva Squadra</button>
             <button class="btn-sec" id="btnResetBozza">↺ Ripristina salvata</button>
             <span id="squadraPrivacySlot"></span>`
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
  if (deadline) renderSostSelfService();
  else _renderRosaPrivacyToggle();
}

// Toggle "nascondi la mia rosa agli altri" (visibile solo se ho una rosa salvata)
function _renderRosaPrivacyToggle() {
  const el = document.getElementById("squadraPrivacySlot");
  if (!el || !currentUser) return;
  const mine = _playerRoseState[currentUser.uid];
  const hasRosa = mine?.rosa && Object.values(mine.rosa).some(a => Array.isArray(a) && a.length);
  if (!hasRosa) { el.innerHTML = ""; return; }
  const nascosta = !!mine.nascosta;
  el.innerHTML = `<button class="btn-sec" id="btnToggleNascondi" style="font-size:13px" title="${nascosta ? 'La tua rosa è nascosta agli altri' : 'Nascondi la tua rosa agli altri fino al calcio d\'inizio'}">
    ${nascosta ? "👁 Visibile" : "🙈 Nascondi"}
  </button>`;
  document.getElementById("btnToggleNascondi")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnToggleNascondi");
    if (btn) btn.disabled = true;
    const ok = await _saveMyPlayerRose({ nascosta: !nascosta });
    if (ok) { toast(nascosta ? "✅ Rosa ora visibile agli altri" : "🔒 Rosa nascosta agli altri fino all'11 giugno"); }
    else if (btn) btn.disabled = false;
    _renderRosaPrivacyToggle();
  });
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

// ── SOSTITUZIONI SELF-SERVICE ─────────────────────────────────

function renderSostSelfService() {
  const wrap = document.getElementById("squadraRosaSolo");
  if (!wrap) return;

  const partId = _getMyPartId();
  if (!partId || !currentUser) {
    wrap.innerHTML = `<p class="hint" style="margin-top:24px">Accedi per gestire le tue sostituzioni.</p>`;
    return;
  }

  const finestraId = getCurrentFinestraAperta();
  const uid        = currentUser.uid;
  const mySost     = _playerSostState[uid] || {};
  const adminSost  = state.sostituzioni?.[partId] || {};
  const rosaBase   = state.rose[partId];
  const effectiveRosa = getEffectiveRosa(partId, 999) || rosaBase || {};
  const capitano   = state.partecipanti?.find(p => p.id === partId)?.capitanoGiocatore || null;
  const partNome   = state.partecipanti?.find(p => p.id === partId)?.nome || "";

  // Conta sost totali già fatte (player + admin per ogni finestra)
  const sostTotali = Object.values(getSostEffective(partId))
    .reduce((tot, arr) => tot + (arr?.length || 0), 0);
  const rimanenti  = MAX_SOST_TOTALI - sostTotali;

  // Rosa registrata (con sost applicate)
  const rosaHtml = effectiveRosa ? `<div class="my-rosa-section">
    <div class="my-rosa-header">
      <span class="my-rosa-title">La mia rosa</span>
      ${partNome ? `<span style="font-size:12px;color:var(--text2)">${_escHtml(partNome)}</span>` : ''}
    </div>
    ${['P','D','C','A'].map(r => {
      const players = effectiveRosa[r] || [];
      if (!players.length) return '';
      return `<div class="my-rosa-ruolo">
        <div class="my-rosa-ruolo-label">${_ruoloIcon(r)} ${_ruoloLabel(r)}</div>
        <div class="my-rosa-players">
          ${players.map(g => `<span class="my-rosa-player${g.nome === capitano ? ' my-rosa-cap' : ''}">
            <span class="my-rosa-nome">${g.nome === capitano ? '⭐ ' : ''}${_escHtml(g.nome)}</span><span class="my-rosa-naz">${g.nazione}</span>
          </span>`).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>` : '';

  // Header stato
  let headerHtml = `<div class="sost-self-header">
    <h3 class="sost-self-title">🔄 Le mie Sostituzioni</h3>
    <span class="sost-self-counter">${sostTotali}/${MAX_SOST_TOTALI} usate · ${rimanenti} rimanenti</span>
  </div>`;

  // Stato finestra
  let finestraHtml = "";
  if (finestraId) {
    const f = FINESTRE_TIMING[finestraId];
    const closeStr = f.close
      ? new Date(f.close).toLocaleString("it-IT", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })
      : "TBD";
    finestraHtml = `<div class="sost-finestra-badge open">
      ✅ ${f.label} aperta · chiude il ${closeStr}
    </div>`;
  } else {
    // Determina prossima finestra
    const now = Date.now();
    const prossima = Object.entries(FINESTRE_TIMING).find(([, f]) => new Date(f.open).getTime() > now);
    if (prossima) {
      const [, fp] = prossima;
      const openStr = new Date(fp.open).toLocaleString("it-IT", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
      finestraHtml = `<div class="sost-finestra-badge closed">⏳ Finestra chiusa · prossima apertura il ${openStr}</div>`;
    } else {
      finestraHtml = `<div class="sost-finestra-badge closed">⏹ Tutte le finestre di sostituzione sono terminate.</div>`;
    }
  }

  // Assicura che _sostEditMode sia per la finestra ancora aperta
  if (_sostEditMode && _sostEditMode.finestraId !== finestraId) _sostEditMode = null;
  const editMode = _sostEditMode !== null;

  // Sostituzioni già effettuate (per tutte le finestre)
  let historyHtml = "";
  for (const [fIdStr, sosts] of Object.entries(getSostEffective(partId))) {
    if (!sosts?.length) continue;
    const fId     = Number(fIdStr);
    const label   = FINESTRE_TIMING[fId]?.label || `Finestra ${fId}`;
    const isAdmin = (Array.isArray(adminSost[fId]) && adminSost[fId].length > 0);
    const canEdit = !isAdmin && fId === finestraId;
    historyHtml += `<div class="sost-history-group">
      <div class="sost-history-label">${label}${isAdmin ? ' <span class="sost-admin-badge">admin</span>' : ''}</div>
      ${sosts.map((s, idx) => {
        const isBeingEdited = editMode && _sostEditMode.finestraId === fId && _sostEditMode.idx === idx;
        return `<div class="sost-history-row${isBeingEdited ? ' sost-row-editing' : ''}">
          <span class="sost-out">${_ruoloIcon(s.ruolo)} ${_escHtml(s.outNome)} <span class="sost-naz">${s.outNazione}</span></span>
          <span class="sost-arrow">→</span>
          <span class="sost-in">${_ruoloIcon(s.ruolo)} ${_escHtml(s.inNome)} <span class="sost-naz">${s.inNazione}</span></span>
          ${canEdit ? `<button class="sost-edit-btn" data-fid="${fId}" data-idx="${idx}" title="Modifica">✏️</button><button class="sost-delete-btn" data-fid="${fId}" data-idx="${idx}" title="Elimina">🗑️</button>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  // Form nuova sostituzione (solo se finestra aperta e rimanenti > 0, oppure in edit mode)
  let formHtml = "";
  if (finestraId && (rimanenti > 0 || editMode) && rosaBase) {
    // Ruoli usati nella finestra corrente, escludendo quello in editing
    const sostFinestra = mySost[finestraId] || [];
    const ruoliUsatiQuesta = sostFinestra
      .map((s, i) => (editMode && _sostEditMode.idx === i) ? null : s.ruolo)
      .filter(Boolean);

    // Conta utilizzi per ruolo su TUTTE le finestre — escludi se raggiunto MAX_SOST_PER_RUOLO
    const allSostEff = getSostEffective(partId);
    const roleCount = {};
    for (const [, sosts] of Object.entries(allSostEff)) {
      for (const s of (sosts || [])) {
        roleCount[s.ruolo] = (roleCount[s.ruolo] || 0) + 1;
      }
    }

    const ruoliEsclusi = new Set(
      Object.keys(ROSA_REQUISITI).filter(r =>
        ruoliUsatiQuesta.includes(r) || (roleCount[r] || 0) >= MAX_SOST_PER_RUOLO
      )
    );
    const ruoliDisponibili = Object.keys(ROSA_REQUISITI)
      .filter(r => !ruoliEsclusi.has(r));

    if (ruoliDisponibili.length === 0) {
      formHtml = `<p class="hint">Hai già usato un cambio per ogni ruolo in questa finestra.</p>`;
    } else {
      const ruoloOpts = ruoliDisponibili.map(r =>
        `<option value="${r}">${_ruoloIcon(r)} ${_ruoloLabel(r)}</option>`
      ).join('');
      const formTitle = editMode
        ? `✏️ Modifica sostituzione (${FINESTRE_TIMING[finestraId].label})`
        : `➕ Nuova sostituzione (${FINESTRE_TIMING[finestraId].label})`;
      const btnLabel = editMode ? '💾 Aggiorna sostituzione' : '💾 Conferma sostituzione';

      formHtml = `
        <div class="sost-form${editMode ? ' sost-form--edit' : ''}" id="sostSelfForm">
          <div class="sost-form-title">${formTitle}</div>
          <div class="sost-form-row">
            <label>Ruolo</label>
            <select id="sostFormRuolo" class="sost-select">${ruoloOpts}</select>
          </div>
          <div class="sost-form-row">
            <label>Esci</label>
            <select id="sostFormOut" class="sost-select"><option value="">– seleziona –</option></select>
          </div>
          <div class="sost-form-row">
            <label>Entra</label>
            <select id="sostFormIn" class="sost-select" disabled><option value="">– seleziona –</option></select>
          </div>
          <div class="sost-form-btns">
            <button class="btn-primary" id="btnSalvaSost" disabled>${btnLabel}</button>
            ${editMode ? `<button class="sost-annulla-btn" id="btnAnnullaEditSost">✕ Annulla modifica</button>` : ''}
          </div>
        </div>`;
    }
  }

  wrap.innerHTML = `
    <div class="sost-split-layout">
      <div class="sost-split-rosa">${rosaHtml}</div>
      <div class="sost-split-sost">
        <div class="sost-self-wrap">
          ${headerHtml}
          ${finestraHtml}
          ${historyHtml ? `<div class="sost-history">${historyHtml}</div>` : ''}
          ${formHtml}
        </div>
      </div>
    </div>`;

  // Bottoni modifica sulle righe dello storico
  wrap.querySelectorAll(".sost-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const fid  = Number(btn.dataset.fid);
      const idx  = Number(btn.dataset.idx);
      const sosts = _playerSostState[uid]?.[fid] || [];
      if (sosts[idx]) {
        _sostEditMode = { finestraId: fid, idx, sost: sosts[idx] };
        renderSostSelfService();
      }
    });
  });

  // Bottoni elimina sulle righe dello storico
  wrap.querySelectorAll(".sost-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const fid = Number(btn.dataset.fid);
      const idx = Number(btn.dataset.idx);
      if (!confirm("Eliminare questa sostituzione?")) return;
      _sostEditMode = null;
      await _deleteSostSelfService(uid, fid, idx);
    });
  });

  // Annulla modifica
  document.getElementById("btnAnnullaEditSost")?.addEventListener("click", () => {
    _sostEditMode = null;
    renderSostSelfService();
  });

  // Popola select "Esci" al cambio ruolo, e bind eventi form
  if (finestraId && (rimanenti > 0 || editMode) && rosaBase) {
    _bindSostForm(partId, uid, finestraId, rosaBase);
  }
}

function _buildOutOptions(ruolo, rosaBase, capitanoNome) {
  const arr = rosaBase[ruolo] || [];
  return arr
    .filter(g => g.nome !== capitanoNome)  // il capitano non può essere sostituito
    .map(g => `<option value="${_escHtml(g.nome)}|${g.nazione}">${_escHtml(g.nome)} (${g.nazione})</option>`)
    .join('');
}

function _buildInOptions(ruolo, nazione, rosaBase) {
  // globalState.giocatoriSquadra è { nazione: [{nome, ruolo}] }
  const inRosa = new Set((rosaBase[ruolo] || []).map(g => g.nome));
  const candidati = (globalState.giocatoriSquadra?.[nazione] || []);
  const lista = candidati
    .filter(g => g.ruolo === ruolo && !inRosa.has(g.nome))
    .map(g => g.nome);
  if (!lista.length) return `<option value="">Nessun giocatore disponibile</option>`;
  return lista.map(n => `<option value="${n}">${n}</option>`).join('');
}

function _bindSostForm(partId, uid, finestraId, rosaBase) {
  const selRuolo = document.getElementById("sostFormRuolo");
  const selOut   = document.getElementById("sostFormOut");
  const selIn    = document.getElementById("sostFormIn");
  const btnSalva = document.getElementById("btnSalvaSost");
  if (!selRuolo || !selOut || !selIn || !btnSalva) return;

  const part = state.partecipanti?.find(p => p.id === partId);
  const capitanoNome = part?.capitanoGiocatore || null;

  const aggiornaOut = () => {
    selOut.innerHTML = `<option value="">– seleziona –</option>` + _buildOutOptions(selRuolo.value, rosaBase, capitanoNome);
    selIn.innerHTML  = `<option value="">– seleziona –</option>`;
    selIn.disabled   = true;
    btnSalva.disabled = true;
  };

  const aggiornaIn = () => {
    const [nome, nazione] = (selOut.value || "").split("|");
    if (!nome || !nazione) { selIn.disabled = true; btnSalva.disabled = true; return; }
    selIn.innerHTML = `<option value="">– seleziona –</option>` + _buildInOptions(selRuolo.value, nazione, rosaBase);
    selIn.disabled  = false;
    btnSalva.disabled = true;
  };

  // Pre-popola se in edit mode
  if (_sostEditMode && _sostEditMode.finestraId === finestraId) {
    const old = _sostEditMode.sost;
    if (selRuolo.querySelector(`option[value="${old.ruolo}"]`)) selRuolo.value = old.ruolo;
    aggiornaOut();
    const outVal = `${old.outNome}|${old.outNazione}`;
    if (selOut.querySelector(`option[value="${outVal}"]`)) selOut.value = outVal;
    aggiornaIn();
    if (selIn.querySelector(`option[value="${old.inNome}"]`)) selIn.value = old.inNome;
    btnSalva.disabled = !selIn.value;
  } else {
    aggiornaOut();
  }

  selRuolo.addEventListener("change", aggiornaOut);
  selOut.addEventListener("change", aggiornaIn);
  selIn.addEventListener("change", () => { btnSalva.disabled = !selIn.value; });

  btnSalva.addEventListener("click", async () => {
    const ruolo = selRuolo.value;
    const [outNome, outNazione] = (selOut.value || "").split("|");
    const inNome = selIn.value;
    if (!ruolo || !outNome || !outNazione || !inNome) { toast("Compila tutti i campi!", true); return; }
    if (capitanoNome && outNome === capitanoNome) { toast("Non puoi sostituire il capitano!", true); return; }
    await _saveSostSelfService(uid, finestraId, { outNome, outNazione, ruolo, inNome, inNazione: outNazione });
  });
}

async function _saveSostSelfService(uid, finestraId, nuovaSost) {
  if (!currentLegaId || !window._db || !window._set || !window._ref) {
    toast("Errore connessione Firebase", true); return;
  }
  const existing = (_playerSostState[uid]?.[finestraId]) || [];
  let updated;
  if (_sostEditMode && _sostEditMode.finestraId === finestraId) {
    updated = [...existing];
    updated[_sostEditMode.idx] = nuovaSost;
    _sostEditMode = null;
  } else {
    updated = [...existing, nuovaSost];
  }
  try {
    await window._set(
      window._ref(window._db, `leghe/${currentLegaId}/playerSostituzioni/${uid}/${finestraId}`),
      updated
    );
    toast("✅ Sostituzione salvata!");
    // _playerSostState verrà aggiornato dal listener Firebase
  } catch(e) {
    console.error("_saveSostSelfService error:", e);
    toast("Errore salvataggio: " + (e.message || e), true);
  }
}

async function _deleteSostSelfService(uid, finestraId, idx) {
  if (!currentLegaId || !window._db || !window._set || !window._ref) {
    toast("Errore connessione Firebase", true); return;
  }
  const existing = (_playerSostState[uid]?.[finestraId]) || [];
  const updated  = existing.filter((_, i) => i !== idx);
  try {
    await window._set(
      window._ref(window._db, `leghe/${currentLegaId}/playerSostituzioni/${uid}/${finestraId}`),
      updated.length > 0 ? updated : null
    );
    toast("✅ Sostituzione eliminata!");
  } catch(e) {
    console.error("_deleteSostSelfService error:", e);
    toast("Errore eliminazione: " + (e.message || e), true);
  }
}

function _ruoloIcon(r) {
  return {P:'🧤',D:'🛡',C:'⚙️',A:'⚽'}[r] || r;
}

function _ruoloLabel(r) {
  return t("roles."+r) || r;
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
      <span class="squadra-picker-nome">${_escHtml(g.nome)}</span>
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
  const canBeCap = ruolo !== 'A'; // gli attaccanti non possono essere capitano
  const capAttuale = _squadraBozzaCap;

  if (!arr.length) {
    listEl.innerHTML = `<div class="squadra-rosa-empty">Nessun ${_ruoloLabel(ruolo).toLowerCase()} selezionato</div>`;
    return;
  }

  listEl.innerHTML = arr.map((g,i) => {
    const isCap = canBeCap && capAttuale && capAttuale.nome === g.nome && capAttuale.nazione === g.nazione;
    const nomeQ = g.nome.replace(/"/g,'&quot;');
    const nazQ  = g.nazione.replace(/"/g,'&quot;');
    return `
    <div class="squadra-rosa-item${isCap ? ' is-captain' : ''}">
      <span class="squadra-rosa-num">${i+1}</span>
      <span class="squadra-rosa-naz">${g.nazione}</span>
      <span class="squadra-rosa-nome">${_escHtml(g.nome)}</span>
      ${canBeCap ? `<button class="squadra-rosa-cap${isCap ? ' active' : ''}"
        data-cnome="${nomeQ}" data-cnaz="${nazQ}" data-cruolo="${ruolo}"
        title="${isCap ? 'Rimuovi capitano' : 'Imposta come capitano'}">⭐</button>` : ''}
      <button class="squadra-rosa-remove" data-nome="${nomeQ}"
        data-naz="${nazQ}" data-ruolo="${ruolo}" title="Rimuovi">✕</button>
    </div>`;
  }).join('');
}

function _renderSquadraCapitano() {
  const section = document.getElementById("squadraCapSection");
  const listEl  = document.getElementById("squadraCapList");
  if (!section || !listEl) return;

  const bozza = _squadraBozza || {P:[],D:[],C:[],A:[]};
  const hasCandidati = [...(bozza.P||[]),...(bozza.D||[]),...(bozza.C||[])].length > 0;

  if (!hasCandidati) { section.style.display = 'none'; return; }
  section.style.display = '';

  const cap = _squadraBozzaCap;
  if (cap) {
    listEl.innerHTML = `<div class="squadra-cap-summary selected">
      <span class="squadra-cap-summary-role">${_ruoloIcon(cap.ruolo)}</span>
      <span class="squadra-cap-summary-name">⭐ ${_escHtml(cap.nome)}</span>
      <span class="squadra-cap-summary-naz">${cap.nazione}</span>
      <button class="squadra-cap-remove-btn"
        data-cnome="${cap.nome.replace(/"/g,'&quot;')}"
        data-cnaz="${cap.nazione.replace(/"/g,'&quot;')}"
        title="Rimuovi capitano">✕</button>
    </div>`;
  } else {
    listEl.innerHTML = `<div class="squadra-cap-summary empty">
      Nessun capitano · clicca ⭐ su un giocatore (P/D/C)
    </div>`;
  }
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
    // Click sul bottone ⭐ capitano inline
    const capBtn = e.target.closest(".squadra-rosa-cap");
    if (capBtn) {
      const { cnome, cnaz, cruolo } = capBtn.dataset;
      if (_squadraBozzaCap && _squadraBozzaCap.nome === cnome && _squadraBozzaCap.nazione === cnaz) {
        _squadraBozzaCap = null;
      } else {
        _squadraBozzaCap = { nome: cnome, nazione: cnaz, ruolo: cruolo };
        // Animazione pop
        capBtn.classList.add('active', 'pop');
        setTimeout(() => capBtn.classList.remove('pop'), 300);
      }
      _renderSquadraRosa();
      _renderSquadraCapitano();
      return;
    }
    // Click sul bottone ✕ rimuovi giocatore
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

  // Click ✕ rimuovi capitano dal riepilogo
  document.getElementById("squadraCapList")?.addEventListener("click", e => {
    const btn = e.target.closest(".squadra-cap-remove-btn");
    if (!btn) return;
    _squadraBozzaCap = null;
    _renderSquadraRosa();
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
        conflitto = `Hai due giocatori di ${g.nazione}: ${nazViste.get(g.nazione)} e ${_escHtml(g.nome)}!`;
        break;
      }
      nazViste.set(g.nazione, g.nome);
    }
    if (conflitto) break;
  }
  if (conflitto) { toast(conflitto, true); return; }

  if (!currentUser) { toast("Devi accedere per salvare la squadra.", true); return; }

  // Salva la rosa nel nodo self-service (scrivibile dall'utente stesso).
  // L'admin NON deve fare nulla: il merge mostrerà subito il partecipante.
  const capitanoNome = _squadraBozzaCap ? _squadraBozzaCap.nome : null;
  const ok = await _saveMyPlayerRose({
    rosa: JSON.parse(JSON.stringify(bozza)),
    capitano: capitanoNome
  });
  if (!ok) { toast("Errore nel salvataggio. Riprova.", true); return; }

  renderPage(currentPage());
  toast("✅ Squadra salvata!");
  // Aggiorna bottone salva
  const btn = document.getElementById("btnSalvaSquadra");
  if (btn) { btn.textContent = "✅ Salvata!"; setTimeout(() => { btn.textContent = "💾 Salva Squadra"; }, 2000); }
}

function _startTimer() {
  if (_timerInterval) clearInterval(_timerInterval);
  const wrap = document.getElementById("squadraTimerWrap");
  if (!wrap) return;

  const deadlineMs = (state && state.deadline) ? new Date(state.deadline).getTime() : null;

  function fmtDiff(diff) {
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000)  / 60000);
    const secs  = Math.floor((diff % 60000)    / 1000);
    return (days > 0 ? `<strong>${days}g</strong> ` : "") +
      `<strong>${String(hours).padStart(2,'0')}h</strong> ` +
      `<strong>${String(mins).padStart(2,'0')}m</strong> ` +
      `<strong>${String(secs).padStart(2,'0')}s</strong>`;
  }

  function updateTimer() {
    const now = Date.now();

    // Nessuna deadline impostata: rose sempre aperte
    if (!deadlineMs) {
      wrap.innerHTML = `<div class="squadra-timer active">🔓 Iscrizioni aperte</div>`;
      return;
    }

    // Prima della deadline iscrizioni: countdown classico
    if (now < deadlineMs) {
      const diff   = deadlineMs - now;
      const urgent = diff < 3600000;
      wrap.innerHTML = `<div class="squadra-timer ${urgent ? 'urgent' : ''}">
        ⏱ Chiusura iscrizioni tra ${fmtDiff(diff)}
      </div>`;
      return;
    }

    // Dopo la deadline: countdown finestre sostituzioni
    const entries = Object.entries(FINESTRE_TIMING);
    for (const [id, f] of entries) {
      const openMs  = new Date(f.open).getTime();
      const closeMs = f.close ? new Date(f.close).getTime() : Infinity;

      if (now >= openMs && now < closeMs) {
        // Finestra attualmente aperta
        if (closeMs === Infinity) {
          wrap.innerHTML = `<div class="squadra-timer active">🔓 ${f.label} aperta</div>`;
        } else {
          const diff   = closeMs - now;
          const urgent = diff < 3600000;
          wrap.innerHTML = `<div class="squadra-timer active ${urgent ? 'urgent' : ''}">
            🔓 ${f.label} — chiude tra ${fmtDiff(diff)}
          </div>`;
        }
        return;
      }

      if (now < openMs) {
        // Prossima finestra non ancora aperta (gap tra finestre)
        const diff = openMs - now;
        wrap.innerHTML = `<div class="squadra-timer upcoming">
          🔒 ${f.label} apre tra ${fmtDiff(diff)}
        </div>`;
        return;
      }
    }

    // Tutte le finestre chiuse
    wrap.innerHTML = `<div class="squadra-timer expired">🔒 Finestre di cambio chiuse</div>`;
    clearInterval(_timerInterval);
  }

  updateTimer();
  _timerInterval = setInterval(updateTimer, 1000);
}
