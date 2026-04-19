// ============================================================
// FANTA SERIE A 2025/26 — scheduled-poller.js
// Netlify Scheduled Function — cron ogni 5 min
// Chiama RapidAPI ogni 15 min per partita attiva
// ============================================================

const https = require("https");
const admin = require("firebase-admin");

// ── MATCHES ────────────────────────────────────────────────
// Le partite sono definite direttamente qui (mirrors di matches.js)
// perché le Netlify functions non hanno accesso ai file del frontend.
//
// ISTRUZIONI: quando inserisci un eventId in matches.js,
// riportalo anche qui nella stessa giornata/partita.
//
// Formato kickoff: ISO 8601 UTC
// eventId: trovalo su sofascore.com → URL della partita → ultimo numero
const MATCHES = {
  "1":  [], "2":  [], "3":  [], "4":  [], "5":  [],
  "6":  [], "7":  [], "8":  [], "9":  [], "10": [],
  "11": [], "12": [], "13": [], "14": [], "15": [],
  "16": [], "17": [], "18": [], "19": [], "20": [],
  "21": [], "22": [], "23": [], "24": [], "25": [],
  "26": [], "27": [], "28": [], "29": [], "30": [],
  "31": [], "32": [],

  // ── GIORNATA 33 — 18-19/04/2026 ─────────────────────────
  // Orari italiani (CEST) convertiti in UTC (-2h)
  "33": [
    { eventId: "13981743", home: "Cremonese",  away: "Torino",      kickoff: "2026-04-19T10:30:00Z" },
    { eventId: "", home: "Inter",      away: "Cagliari",    kickoff: "2026-04-18T11:30:00Z" },
    { eventId: "", home: "Juventus",   away: "Bologna",     kickoff: "2026-04-18T11:30:00Z" },
    { eventId: "", home: "Lecce",      away: "Fiorentina",  kickoff: "2026-04-18T11:30:00Z" },
    { eventId: "", home: "Napoli",     away: "Lazio",       kickoff: "2026-04-18T15:00:00Z" },
    { eventId: "13980100", home: "Pisa",       away: "Genoa",       kickoff: "2026-04-19T16:00:00Z" },
    { eventId: "", home: "Roma",       away: "Atalanta",    kickoff: "2026-04-18T15:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Como",        kickoff: "2026-04-18T15:00:00Z" },
    { eventId: "", home: "Udinese",    away: "Parma",       kickoff: "2026-04-18T17:45:00Z" },
    { eventId: "", home: "Verona",     away: "Milan",       kickoff: "2026-04-18T17:45:00Z" },
  ],

  // ── GIORNATA 34 — 24-27/04/2026 ─────────────────────────
  // Orari italiani (CEST) convertiti in UTC (-2h)
  "34": [
    { eventId: "13980105", home: "Napoli",     away: "Cremonese",   kickoff: "2026-04-24T16:45:00Z" },
    { eventId: "13980107", home: "Parma",      away: "Pisa",        kickoff: "2026-04-25T11:00:00Z" },
    { eventId: "13980113", home: "Bologna",    away: "Roma",        kickoff: "2026-04-25T14:00:00Z" },
    { eventId: "13980114", home: "Verona",     away: "Lecce",       kickoff: "2026-04-25T16:45:00Z" },
    { eventId: "13980110", home: "Fiorentina", away: "Sassuolo",    kickoff: "2026-04-26T08:30:00Z" },
    { eventId: "13980109", home: "Genoa",      away: "Como",        kickoff: "2026-04-26T11:00:00Z" },
    { eventId: "13980104", home: "Torino",     away: "Inter",       kickoff: "2026-04-26T14:00:00Z" },
    { eventId: "13980106", home: "Milan",      away: "Juventus",    kickoff: "2026-04-26T16:45:00Z" },
    { eventId: "13980111", home: "Cagliari",   away: "Atalanta",    kickoff: "2026-04-27T14:30:00Z" },
    { eventId: "13980112", home: "Lazio",      away: "Udinese",     kickoff: "2026-04-27T16:45:00Z" },
  ],

  // ── GIORNATA 35 — 01-04/05/2026 ─────────────────────────
  "35": [
    { eventId: "", home: "Pisa",       away: "Lecce",       kickoff: "2026-05-01T18:45:00Z" },
    { eventId: "", home: "Udinese",    away: "Torino",      kickoff: "2026-05-02T13:00:00Z" },
    { eventId: "", home: "Como",       away: "Napoli",      kickoff: "2026-05-02T16:00:00Z" },
    { eventId: "", home: "Atalanta",   away: "Genoa",       kickoff: "2026-05-02T18:45:00Z" },
    { eventId: "", home: "Bologna",    away: "Cagliari",    kickoff: "2026-05-03T10:30:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Milan",       kickoff: "2026-05-03T13:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Verona",      kickoff: "2026-05-03T16:00:00Z" },
    { eventId: "", home: "Inter",      away: "Parma",       kickoff: "2026-05-03T18:45:00Z" },
    { eventId: "", home: "Cremonese",  away: "Lazio",       kickoff: "2026-05-04T16:30:00Z" },
    { eventId: "", home: "Roma",       away: "Fiorentina",  kickoff: "2026-05-04T18:45:00Z" },
  ],

  // ── GIORNATE 36-38 — date ancora da stabilire ─────────────
  "36": [], "37": [], "38": [],
};

// In Serie A non ci sono supplementari → finestra fissa 120 min
const FINESTRA_MS         = 120 * 60 * 1000; // 120 min dopo kickoff
const POLLING_INTERVAL_MS =   5 * 60 * 1000; // polling ogni 5 min (= cron interval)

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
    for (const match of matches) {
      if (!match.eventId || !match.kickoff) continue;
      const ko  = new Date(match.kickoff).getTime();
      const end = ko + FINESTRA_MS;
      if (nowMs >= ko && nowMs <= end) {
        active.push({ ...match, giornata: gId });
      }
    }
  }
  return active;
}

async function shouldPoll(db, eventId, nowMs) {
  const ref  = db.ref(`pollerState/${eventId}/lastPolled`);
  const snap = await ref.once("value");
  const lastPolled = snap.val() || 0;
  if (nowMs - lastPolled >= POLLING_INTERVAL_MS) {
    await ref.set(nowMs);
    return true;
  }
  return false;
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
    // Rigore parato
    const faced  = stats?.penaltyFaced || 0;
    const rigPar = Math.max(0, faced - (goalsAgainstPenalty || 0));
    if (rigPar > 0) flags.rigpar = rigPar;

    // Porta inviolata: ha giocato e non ha subito gol
    const hasPlayed = !!(stats?.rating) || (stats?.minutesPlayed || 0) >= 60;
    if (hasPlayed && goalsAgainst === 0) flags.pi = 1;

    // Gol subiti
    if (goalsAgainst > 0) flags.gs = goalsAgainst;
  }

  return flags;
}

async function parseLineups(lineups, incidents, match) {
  const result = {};
  const { cards, penaltyScored } = parseCardsFromIncidents(incidents);

  const goalsHome = (lineups.home?.players || [])
    .reduce((s, e) => s + (e.statistics?.goals    || 0), 0)
    + (lineups.away?.players || []).reduce((s, e) => s + (e.statistics?.ownGoals || 0), 0);
  const goalsAway = (lineups.away?.players || [])
    .reduce((s, e) => s + (e.statistics?.goals    || 0), 0)
    + (lineups.home?.players || []).reduce((s, e) => s + (e.statistics?.ownGoals || 0), 0);

  const penaltyAgainstHome = Object.entries(penaltyScored)
    .filter(([name]) => (lineups.away?.players || []).some(e => e.player.name === name))
    .reduce((s, [,v]) => s + v, 0);
  const penaltyAgainstAway = Object.entries(penaltyScored)
    .filter(([name]) => (lineups.home?.players || []).some(e => e.player.name === name))
    .reduce((s, [,v]) => s + v, 0);

  for (const [side, squadra] of [["home", match.home], ["away", match.away]]) {
    result[squadra] = {};
    const goalsAgainst   = side === "home" ? goalsAway  : goalsHome;
    const penaltyAgainst = side === "home" ? penaltyAgainstHome : penaltyAgainstAway;
    const players = lineups[side]?.players || [];
    console.log(`[poller] ${squadra} — goals against: ${goalsAgainst}, players: ${players.length}`);

    // Log stats del primo giocatore per vedere i campi disponibili
    if (players[0]) {
      console.log(`[poller] sample stats ${players[0].player.name}: ${JSON.stringify(players[0].statistics)}`);
    }

    for (const entry of players) {
      const p      = entry.player;
      const stats  = entry.statistics;
      const ruolo  = mapPosition(entry.position || p.position);
      const rating = stats?.rating ? Math.round(parseFloat(stats.rating) * 10) / 10 : null;
      const sv     = entry.substitute === true && !(stats?.minutesPlayed > 0);
      const flags  = extractFlags(stats, ruolo, goalsAgainst, penaltyAgainst, cards[p.name]);
      if (Object.keys(flags).length > 0) {
        console.log(`[poller] flags ${p.name} (${ruolo}): ${JSON.stringify(flags)}`);
      }

      if (sv) {
        result[squadra][p.name] = { sv: true, flags, source: "sofascore" };
      } else if (rating !== null) {
        result[squadra][p.name] = { v: rating, sv: false, flags, source: "sofascore" };
      }
    }
  }
  return result;
}

async function writeVoti(db, giornata, votiNuovi) {
  const writes = [];
  for (const [squadra, giocatori] of Object.entries(votiNuovi)) {
    for (const [nome, dati] of Object.entries(giocatori)) {
      const ref  = db.ref(`global/voti/${squadra}/${giornata}/${nome}`);
      const snap = await ref.once("value");
      const existing = snap.val() || {};
      // Preserva eventuali modifiche manuali ai flags del superadmin
      const existingFlags = existing.flags || {};
      const hasManualEdits = existing.source === "sofascore" &&
        JSON.stringify(existingFlags) !== JSON.stringify(dati.flags || {});
      writes.push(ref.set({
        ...dati,
        flags: hasManualEdits ? existingFlags : (dati.flags || {}),
      }));
    }
  }
  await Promise.all(writes);
  // Aggiorna _updatedAt così listenGlobal() nel client riceve l'update
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

  const results = [];
  for (const match of activeMatches) {
    const doPoll = await shouldPoll(db, match.eventId, now);
    if (!doPoll) {
      console.log(`[poller] ⏭ Skip ${match.home}-${match.away} (polling < 15 min fa)`);
      results.push(`⏭ ${match.home}-${match.away}: skipped`);
      continue;
    }

    try {
      const [lineups, incidents] = await Promise.all([
        fetchRapidAPI(`/matches/get-lineups?matchId=${match.eventId}`),
        fetchRapidAPI(`/matches/get-incidents?matchId=${match.eventId}`),
      ]);
      const voti = await parseLineups(lineups, incidents, match);
      await writeVoti(db, match.giornata, voti);
      const nHome = Object.keys(voti[match.home] || {}).length;
      const nAway = Object.keys(voti[match.away] || {}).length;
      results.push(`✓ ${match.home}(${nHome}) - ${match.away}(${nAway})`);
      console.log(`[poller] ✓ ${match.home}-${match.away}: ${nHome}+${nAway} voti scritti`);
    } catch (err) {
      results.push(`✗ ${match.home}-${match.away}: ${err.message}`);
      console.error(`[poller] ✗ ${match.home}-${match.away}:`, err.message);
    }
  }

  return { statusCode: 200, body: results.join("\n") };
};
