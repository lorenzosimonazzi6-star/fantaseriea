// ============================================================
// ARENA SERIE A — scheduled-poller.js
// Netlify Scheduled Function — cron ogni minuto; shouldPoll guard gestisce la frequenza
// Chiama RapidAPI (SofaScore) per partite attive e scrive voti su Firebase
// ============================================================

const https = require("https");
const admin = require("firebase-admin");

// ── MATCHES ────────────────────────────────────────────────
// Formato kickoff: ISO 8601 UTC
// eventId: trovalo su sofascore.com → URL della partita → ultimo numero
// Gli eventId UCL 2026/27 saranno disponibili con il calendario ufficiale (agosto 2026)
// Serie A: 38 giornate, nessun knockout.
// TODO: incollare qui lo stesso calendario di matches.js (con home/away/kickoff/eventId)
// quando gli eventId SofaScore sono disponibili. Finché gli array restano vuoti il poller è inerte.
const MATCHES = Object.fromEntries(Array.from({ length: 38 }, (_, i) => [String(i + 1), []]));

// Serie A: campionato senza fasi eliminatorie → nessuna giornata "elim" (niente ET/rigori)
const GIORNATE_ELIMINATORIE = new Set();
const FINESTRA_LEAGUE_MS    = 135 * 60 * 1000; // 2h15m — finestra attiva League Phase
const FINESTRA_ELIM_MS      = 180 * 60 * 1000; // 3h — finestra attiva eliminatorie (copre ET + rigori)
const FINESTRA_EXTENDED_MS  =   7 * 60 * 60 * 1000; // 7h extra dopo fine finestra attiva

const POLLING_LIVE_MS       =  15 * 60 * 1000; // 15 min — live normale
const POLLING_ET_MS         =   1 * 60 * 1000; // 1 min  — supplementari rilevati (cron */1)
const POLLING_EXTENDED_MS   =  60 * 60 * 1000; // 60 min — fase estesa post-partita

// ── FIREBASE ADMIN INIT ────────────────────────────────────
let firebaseApp;
function getFirebase() {
  if (!firebaseApp) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  return admin.database();
}

// ── HELPERS ────────────────────────────────────────────────

function getActiveMatches(nowMs) {
  const active = [];
  for (const [gId, matches] of Object.entries(MATCHES)) {
    const finestraLive = GIORNATE_ELIMINATORIE.has(gId) ? FINESTRA_ELIM_MS : FINESTRA_LEAGUE_MS;
    for (const match of matches) {
      if (!match.eventId || !match.kickoff) continue;
      const ko          = new Date(match.kickoff).getTime();
      const endLive     = ko + finestraLive;
      const endExtended = endLive + FINESTRA_EXTENDED_MS;
      if (nowMs >= ko && nowMs <= endLive) {
        active.push({ ...match, giornata: gId, phase: "live" });
      } else if (nowMs > endLive && nowMs <= endExtended) {
        active.push({ ...match, giornata: gId, phase: "extended" });
      }
    }
  }
  return active;
}

async function shouldPoll(db, eventId, nowMs, intervalMs, kickoffMs) {
  const ref  = db.ref(`pollerState/${eventId}/lastPolled`);
  const snap = await ref.once("value");
  // Se non ancora mai pollata, usa kickoff come baseline: primo poll dopo 1 intervallo dal kickoff
  const lastPolled = snap.val() || kickoffMs;
  if (nowMs - lastPolled >= intervalMs) {
    await ref.set(nowMs);
    return true;
  }
  return false;
}

// Verifica se la partita è già stata congelata (rigori rilevati)
async function isMatchFrozen(db, eventId) {
  const snap = await db.ref(`pollerState/${eventId}/frozen`).once("value");
  return snap.val() === true;
}

// Congela la partita: nessun ulteriore aggiornamento dei voti
async function freezeMatch(db, eventId) {
  await db.ref(`pollerState/${eventId}/frozen`).set(true);
  console.log(`[poller] 🔒 Partita ${eventId} congelata — rigori rilevati`);
}

// Rileva se i supplementari sono iniziati dagli incident di SofaScore
function detectExtraTime(incidents) {
  const incList = incidents?.incidents || [];
  return incList.some(inc => {
    const period = (inc.period || "").toLowerCase();
    return period === "extra1" || period === "extra2" ||
           period === "et1"    || period === "et2"    ||
           period.includes("extra");
  });
}

// Rileva se la lotteria dei rigori è iniziata dagli incident di SofaScore
function detectShootout(incidents) {
  const incList = incidents?.incidents || [];
  for (const inc of incList) {
    // SofaScore usa incidentClass "shootout" o period "penalties"/"shootout" per i tiri
    if (inc.incidentClass === "shootout")       return true;
    if (inc.incidentClass === "penaltyShootout") return true;
    if (inc.period === "shootout")              return true;
    if (inc.period === "penalties")             return true;
    // Fallback: incidentType "penaltyShootout"
    if (inc.incidentType === "penaltyShootout") return true;
  }
  return false;
}

// Rimuove dagli incidents tutti gli eventi appartenenti alla lotteria dei rigori,
// così i voti scritti al momento del freeze riflettono solo i 120' di gioco.
function filterPreShootoutIncidents(incidents) {
  const shootoutPeriods = new Set(["shootout", "penalties"]);
  const filtered = (incidents?.incidents || []).filter(inc => {
    const period = (inc.period || "").toLowerCase();
    if (shootoutPeriods.has(period)) return false;
    if (inc.incidentClass === "shootout" || inc.incidentClass === "penaltyShootout") return false;
    if (inc.incidentType === "penaltyShootout") return false;
    return true;
  });
  return { ...incidents, incidents: filtered };
}

// ── NAME NORMALISATION ─────────────────────────────────────
// Normalizza rimuovendo accenti e punteggiatura ma mantenendo gli spazi.
// Es. "A. González" → "a gonzalez",  "Armando González" → "armando gonzalez"
function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Ritorna l'ultima parola significativa (>1 char) come proxy del cognome.
// "a gonzalez" → "gonzalez",  "armando gonzalez" → "gonzalez",  "chavez" → "chavez"
function lastName(normalized) {
  const words = normalized.split(" ").filter(w => w.length > 1);
  return words[words.length - 1] || normalized;
}

// Costruisce un indice { nazione: { normalizedName → dbName } } da giocatoriSquadra
async function loadPlayerIndex(db) {
  const snap = await db.ref("global/giocatoriSquadra").once("value");
  const squadre = snap.val() || {};
  const index = {};
  for (const [nazione, players] of Object.entries(squadre)) {
    index[nazione] = {};
    const arr = Array.isArray(players) ? players : Object.values(players);
    for (const p of arr) {
      if (p?.nome) index[nazione][normalizeName(p.nome)] = p.nome;
    }
  }
  return index;
}

// Carica la mappa manuale: { nazione: { nomeSofaScore → nomeDB } }
// Editabile dal superadmin su Firebase: global/playerAliases/{nazione}/{nomeSofaScore}
async function loadPlayerAliases(db) {
  const snap = await db.ref("global/playerAliases").once("value");
  return snap.val() || {};
}

// Risolve un nome SofaScore nel corrispondente nome nel nostro DB.
// Strategia (in ordine di priorità):
//   0) Alias manuale in Firebase (global/playerAliases) — priorità assoluta
//   1) Match esatto normalizzato
//   2) Match su cognome — ultima parola significativa (gestisce "A. Gonzalez" ↔ "Armando González")
//   3) Word-set match — stesse parole in ordine diverso (gestisce "Son Heung-min" ↔ "Heung-min Son")
//   4) Contenimento senza spazi come fallback
function resolvePlayerName(sofaName, nationIndex, nationAliases) {
  // 0) Alias (chiave = safeKey del nome SofaScore, per compatibilità Firebase)
  if (nationAliases?.[safeKey(sofaName)]) return nationAliases[safeKey(sofaName)];

  if (!nationIndex) return sofaName;
  const norm     = normalizeName(sofaName);
  const sofaLast = lastName(norm);
  const sofaWords = norm.split(" ").filter(w => w.length > 1);

  // 1) Exact normalized match
  if (nationIndex[norm]) return nationIndex[norm];

  // 2) Last-name match — disambigua per prefisso del primo token
  //    Gestisce: "D. Gomez"→"Diego Gomez", "Li."↔"Lisandro", "La."↔"Lautaro",
  //    "Lautaro Martinez"→"La. Martinez" (prefix), "L. Martinez" ambiguo→alias manuale
  {
    const lnMatches = [];
    for (const [normDb, dbName] of Object.entries(nationIndex)) {
      if (lastName(normDb) === sofaLast && sofaLast.length >= 3) {
        lnMatches.push({ normDb, dbName });
      }
    }
    if (lnMatches.length === 1) return lnMatches[0].dbName;
    if (lnMatches.length > 1) {
      const sofaFirst = norm.split(" ")[0]; // "d", "li", "lautaro", ecc.
      if (sofaFirst) {
        // 2a) Exact first-word match ("li" === "li")
        const exact = lnMatches.find(({ normDb }) => normDb.split(" ")[0] === sofaFirst);
        if (exact) return exact.dbName;
        // 2b) Prefix match: uno è prefisso dell'altro ("d"⊂"diego", "lautaro"⊃"la")
        const prefixed = lnMatches.filter(({ normDb }) => {
          const dbFirst = normDb.split(" ")[0];
          return dbFirst.startsWith(sofaFirst) || sofaFirst.startsWith(dbFirst);
        });
        if (prefixed.length === 1) return prefixed[0].dbName;
      }
      return lnMatches[0].dbName;
    }
  }

  // 3) Word-set match (gestisce nomi con ordine invertito, es. "Son Heung-min" ↔ "Heung-min Son")
  if (sofaWords.length >= 2) {
    const sofaSet = new Set(sofaWords);
    for (const [normDb, dbName] of Object.entries(nationIndex)) {
      const dbWords = normDb.split(" ").filter(w => w.length > 1);
      if (dbWords.length === sofaWords.length && dbWords.every(w => sofaSet.has(w))) return dbName;
    }
  }

  // 4) Containment fallback
  const normFlat = norm.replace(/ /g, "");
  for (const [normDb, dbName] of Object.entries(nationIndex)) {
    const dbFlat = normDb.replace(/ /g, "");
    if (dbFlat.length >= 4 && (normFlat.includes(dbFlat) || dbFlat.includes(normFlat))) return dbName;
  }

  return sofaName;
}

function mapPosition(pos) {
  if (!pos) return "C";
  const p = pos.toUpperCase();
  if (["G","GK","GOALKEEPER"].includes(p)) return "P";
  if (["D","DEFENDER","DC","DL","DR","WB"].includes(p)) return "D";
  if (["M","MIDFIELDER","MC","ML","MR","AM","DM"].includes(p)) return "C";
  if (["F","FORWARD","ATTACKER","ST","SS","LW","RW"].includes(p)) return "A";
  return "C";
}

function fetchRapidAPI(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "sofascore.p.rapidapi.com",
      path,
      method: "GET",
      headers: {
        "x-rapidapi-host": "sofascore.p.rapidapi.com",
        "x-rapidapi-key":  process.env.RAPIDAPI_KEY,
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if (res.statusCode !== 200) {
          const err = new Error(`RapidAPI status ${res.statusCode}`);
          err.status = res.statusCode;
          reject(err);
          return;
        }
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error("Risposta non JSON")); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function parseCardsFromIncidents(incidents) {
  const cards = {};
  const penaltyScored = {};
  const incList = incidents.incidents || [];
  console.log(`[poller] incidents totali: ${incList.length}`);
  for (const inc of incList) {
    if (inc.incidentType === "card" && inc.player) {
      const name = inc.player.name;
      console.log(`[poller] cartellino: ${name} → ${inc.incidentClass}`);
      if (!cards[name]) cards[name] = { amm: false, esp: false };
      if (inc.incidentClass === "yellow") {
        cards[name].amm = true;
      } else if (inc.incidentClass === "red" || inc.incidentClass === "yellowRed") {
        cards[name].esp = true;
        cards[name].amm = false;
      }
    }
    if (inc.incidentType === "goal" && inc.incidentClass === "penalty" && inc.player) {
      penaltyScored[inc.player.name] = (penaltyScored[inc.player.name] || 0) + 1;
    }
  }
  return { cards, penaltyScored };
}

function extractFlags(stats, ruolo, goalsAgainst, goalsAgainstPenalty, cardInfo) {
  const flags = {};

  // Gol — Sofascore può usare "goals" o "goalNormal"
  const gol = (stats?.goals || 0) + (stats?.goalNormal || 0);
  if (gol > 0) flags.gol = gol;

  // Assist
  if ((stats?.goalAssist || 0) > 0) flags.assist = stats.goalAssist;

  // Autogol
  if ((stats?.ownGoals || 0) > 0) flags.aut = stats.ownGoals;

  // Rigore sbagliato
  if ((stats?.penaltyMiss || 0) > 0) flags.rig = true;

  // Cartellini (da incidents — più affidabili delle stats)
  if (cardInfo?.amm) flags.amm = true;
  if (cardInfo?.esp) flags.esp = true;

  // Solo portiere
  if (ruolo === "P") {
    const minPlayed = stats?.minutesPlayed || 0;
    const hasPlayed = minPlayed > 0;

    if (hasPlayed) {
      // Rigore parato: penaltyFaced - rigori segnati contro
      const faced  = stats?.penaltyFaced || 0;
      const rigPar = Math.max(0, faced - (goalsAgainstPenalty || 0));
      if (rigPar > 0) flags.rigpar = rigPar;

      // Gol subiti: usa il dato individuale Sofascore se disponibile
      // (corretto per portieri sostituiti — ciascuno vede solo i gol presi durante il suo turno)
      const gs = stats?.goalsConceded !== undefined ? stats.goalsConceded : goalsAgainst;
      if (gs === 0) flags.pi = 1;
      if (gs > 0)   flags.gs = gs;
    }
  }

  return flags;
}

async function parseLineups(lineups, incidents, match, playerIndex, playerAliases) {
  const result = {};
  const { cards, penaltyScored } = parseCardsFromIncidents(incidents);

  // Gol totali per squadra (inclusi autogol avversari)
  const goalsHome = (lineups.home?.players || [])
    .reduce((s, e) => s + (e.statistics?.goals    || 0), 0)
    + (lineups.away?.players || []).reduce((s, e) => s + (e.statistics?.ownGoals || 0), 0);
  const goalsAway = (lineups.away?.players || [])
    .reduce((s, e) => s + (e.statistics?.goals    || 0), 0)
    + (lineups.home?.players || []).reduce((s, e) => s + (e.statistics?.ownGoals || 0), 0);

  // Rigori segnati contro ciascuna squadra
  const penaltyAgainstHome = Object.entries(penaltyScored)
    .filter(([name]) => (lineups.away?.players || []).some(e => e.player.name === name))
    .reduce((s, [,v]) => s + v, 0);
  const penaltyAgainstAway = Object.entries(penaltyScored)
    .filter(([name]) => (lineups.home?.players || []).some(e => e.player.name === name))
    .reduce((s, [,v]) => s + v, 0);

  for (const [side, nazione] of [["home", match.home], ["away", match.away]]) {
    result[nazione] = {};
    const goalsAgainst   = side === "home" ? goalsAway  : goalsHome;
    const penaltyAgainst = side === "home" ? penaltyAgainstHome : penaltyAgainstAway;
    const players = lineups[side]?.players || [];
    console.log(`[poller] ${nazione} — goals against: ${goalsAgainst}, players: ${players.length}`);

    if (players[0]) {
      console.log(`[poller] sample stats ${players[0].player.name}: ${JSON.stringify(players[0].statistics)}`);
    }

    for (const entry of players) {
      const p            = entry.player;
      const stats        = entry.statistics;
      const ruolo        = mapPosition(entry.position || p.position);
      const rating       = stats?.rating ? Math.round(parseFloat(stats.rating) * 100) / 100 : null;
      const sv           = entry.substitute === true && !(stats?.minutesPlayed > 0);
      const flags        = extractFlags(stats, ruolo, goalsAgainst, penaltyAgainst, cards[p.name]);
      const resolvedName = resolvePlayerName(p.name, playerIndex?.[nazione], playerAliases?.[nazione]);

      if (resolvedName !== p.name) {
        console.log(`[poller] 🔤 nome risolto: "${p.name}" → "${resolvedName}"`);
      } else if (!playerIndex?.[nazione]?.[normalizeName(p.name)]) {
        console.log(`[poller] ⚠️ nome non trovato nel DB: "${p.name}" (${nazione})`);
      }

      if (Object.keys(flags).length > 0) {
        console.log(`[poller] flags ${resolvedName} (${ruolo}): ${JSON.stringify(flags)}`);
      }

      if (sv) {
        result[nazione][resolvedName] = { sv: true, flags, source: "sofascore" };
      } else if (rating !== null) {
        result[nazione][resolvedName] = { v: rating, sv: false, flags, source: "sofascore" };
      }
    }

    // Giocatori assenti dalla convocazione (infortuni, squalifiche) → SV automatico
    if (players.length > 0 && playerIndex?.[nazione]) {
      for (const dbName of Object.values(playerIndex[nazione])) {
        if (result[nazione][dbName] === undefined) {
          result[nazione][dbName] = { sv: true, source: "sofascore-absent" };
          console.log(`[poller] 🏥 assente dalla conv.: "${dbName}" (${nazione}) → SV`);
        }
      }
    }
  }
  return result;
}

function safeKey(s) { return String(s).replace(/[.#$[\]]/g, "_"); }

async function writeVoti(db, giornata, votiNuovi) {
  const writes = [];
  for (const [nazione, giocatori] of Object.entries(votiNuovi)) {
    for (const [nome, dati] of Object.entries(giocatori)) {
      const ref  = db.ref(`global/voti/${nazione}/${giornata}/${safeKey(nome)}`);
      const snap = await ref.once("value");
      const existing = snap.val() || {};
      // Assenti: non sovrascrivere se esiste già un voto o SV (manuale o da import precedente)
      if (dati.source === "sofascore-absent" && (existing.v !== undefined || existing.sv !== undefined)) {
        continue;
      }
      // Preserva flags solo se modificati manualmente dal superadmin
      const useExistingFlags = existing.flags &&
        Object.keys(existing.flags).length > 0 &&
        existing.source !== "sofascore";
      writes.push(ref.set({
        ...dati,
        flags: useExistingFlags ? existing.flags : (dati.flags || {}),
      }));
    }
  }
  await Promise.all(writes);
  await db.ref("global/_updatedAt").set(Date.now());
}

// ── HANDLER PRINCIPALE ─────────────────────────────────────
exports.handler = async function () {
  const now = Date.now();
  const activeMatches = getActiveMatches(now);

  if (!activeMatches.length) {
    console.log(`[poller] Nessuna partita attiva alle ${new Date(now).toISOString()}`);
    return { statusCode: 200, body: "Nessuna partita attiva" };
  }

  console.log(`[poller] ${activeMatches.length} partite attive: ${activeMatches.map(m => `${m.home}-${m.away}`).join(", ")}`);

  let db;
  try {
    db = getFirebase();
  } catch (err) {
    console.error("[poller] Errore init Firebase:", err.message);
    return { statusCode: 500, body: "Errore Firebase" };
  }

  // Indice nomi + alias manuali: usati per normalizzare i nomi SofaScore
  let playerIndex = {}, playerAliases = {};
  try {
    [playerIndex, playerAliases] = await Promise.all([loadPlayerIndex(db), loadPlayerAliases(db)]);
  } catch (err) {
    console.warn("[poller] Impossibile caricare playerIndex/aliases:", err.message);
  }

  const results = [];
  for (const match of activeMatches) {
    const isElim = GIORNATE_ELIMINATORIE.has(match.giornata);

    // Salta se la partita è già stata congelata (rigori rilevati in precedenza)
    const frozen = await isMatchFrozen(db, match.eventId);
    if (frozen) {
      console.log(`[poller] 🔒 ${match.home}-${match.away}: congelato (rigori)`);
      results.push(`🔒 ${match.home}-${match.away}: congelato`);
      continue;
    }

    // Eliminatorie in fase extended: salta se la partita è andata ai supplementari.
    // La finestra live (150 min) copre già tutto l'ET; l'extended serve solo
    // per partite finite nei 90' dove Sofascore finalizza i rating dopo il fischio.
    if (isElim && match.phase === "extended") {
      const etSnap = await db.ref(`pollerState/${match.eventId}/etDetected`).once("value");
      if (etSnap.val()) {
        console.log(`[poller] ⏭ ${match.home}-${match.away}: ET rilevato → skip extended`);
        results.push(`⏭ ${match.home}-${match.away}: ET → no extended`);
        continue;
      }
    }

    // Determina intervallo di polling in base alla fase e all'eventuale ET rilevato
    let intervalMs = POLLING_LIVE_MS;
    if (match.phase === "extended") {
      intervalMs = POLLING_EXTENDED_MS;
    } else if (isElim) {
      const etSnap = await db.ref(`pollerState/${match.eventId}/etDetected`).once("value");
      if (etSnap.val()) intervalMs = POLLING_ET_MS;
    }

    const kickoffMs = new Date(match.kickoff).getTime();
    const doPoll = await shouldPoll(db, match.eventId, now, intervalMs, kickoffMs);
    if (!doPoll) {
      console.log(`[poller] ⏭ Skip ${match.home}-${match.away} (< ${intervalMs / 60000} min fa)`);
      results.push(`⏭ ${match.home}-${match.away}: skipped`);
      continue;
    }

    try {
      const [lineups, incidents] = await Promise.all([
        fetchRapidAPI(`/matches/get-lineups?matchId=${match.eventId}`),
        fetchRapidAPI(`/matches/get-incidents?matchId=${match.eventId}`),
      ]);

      // Eliminatorie: rigori rilevati → congela senza scrivere.
      // I rating Sofascore si aggiornano in tempo reale durante la lotteria,
      // quindi l'ultimo poll pre-rigori è il dato più pulito da preservare.
      if (isElim && detectShootout(incidents)) {
        await freezeMatch(db, match.eventId);
        results.push(`⚠️ ${match.home}-${match.away}: rigori rilevati → congelato`);
        console.log(`[poller] ⚠️ ${match.home}-${match.away}: shootout rilevato, voti NON aggiornati`);
        continue;
      }

      // Eliminatorie live: rileva inizio supplementari → passa a polling 5 min
      if (isElim && match.phase === "live" && detectExtraTime(incidents)) {
        await db.ref(`pollerState/${match.eventId}/etDetected`).set(true);
        console.log(`[poller] ⚡ ${match.home}-${match.away}: supplementari rilevati → polling 5 min`);
      }

      const voti = await parseLineups(lineups, incidents, match, playerIndex, playerAliases);
      await writeVoti(db, match.giornata, voti);
      const nHome = Object.keys(voti[match.home] || {}).length;
      const nAway = Object.keys(voti[match.away] || {}).length;
      const phaseLabel = match.phase === "extended" ? " [ext]" : "";
      results.push(`✓ ${match.home}(${nHome}) - ${match.away}(${nAway})${phaseLabel}`);
      console.log(`[poller] ✓ ${match.home}-${match.away}: ${nHome}+${nAway} voti (${match.phase})`);
    } catch (err) {
      results.push(`✗ ${match.home}-${match.away}: ${err.message}`);
      console.error(`[poller] ✗ ${match.home}-${match.away}:`, err.message);
    }
  }

  return { statusCode: 200, body: results.join("\n") };
};
