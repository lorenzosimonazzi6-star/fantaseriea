const https = require("https");
const admin = require("firebase-admin");

// ── FIREBASE ADMIN INIT ────────────────────────────────────
let firebaseApp;
function getDb() {
  if (!firebaseApp) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    }, "sofascore-proxy");
  }
  return admin.app("sofascore-proxy").database();
}

exports.handler = async function (event) {
  const { eventId, home, away } = event.queryStringParameters || {};
  if (!eventId) {
    return { statusCode: 400, body: JSON.stringify({ error: "eventId mancante" }) };
  }

  try {
    const [lineups, incidents] = await Promise.all([
      fetchRapidAPI(`/matches/get-lineups?matchId=${eventId}`),
      fetchRapidAPI(`/matches/get-incidents?matchId=${eventId}`),
    ]);

    // Carica playerIndex e aliases se le nazioni sono note
    let playerIndex = {}, playerAliases = {};
    if (home || away) {
      try {
        const db = getDb();
        [playerIndex, playerAliases] = await Promise.all([
          loadPlayerIndex(db),
          loadPlayerAliases(db),
        ]);
      } catch (e) {
        console.warn("[sofascore-proxy] Impossibile caricare playerIndex/aliases:", e.message);
      }
    }

    const result = parseLineupsWithIncidents(lineups, filterPreShootoutIncidents(incidents), home, away, playerIndex, playerAliases);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (err.status === 404) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ home: [], away: [], unavailable: true }),
      };
    }
    return {
      statusCode: err.status || 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// ── NAME RESOLUTION (uguale al scheduled-poller) ───────────
function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lastName(normalized) {
  const words = normalized.split(" ").filter(w => w.length > 1);
  return words[words.length - 1] || normalized;
}

function safeKey(s) { return String(s).replace(/[.#$[\]]/g, "_"); }

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

async function loadPlayerAliases(db) {
  const snap = await db.ref("global/playerAliases").once("value");
  return snap.val() || {};
}

function resolvePlayerName(sofaName, nationIndex, nationAliases) {
  if (nationAliases?.[safeKey(sofaName)]) return nationAliases[safeKey(sofaName)];
  if (!nationIndex) return sofaName;
  const norm      = normalizeName(sofaName);
  const sofaLast  = lastName(norm);
  const sofaWords = norm.split(" ").filter(w => w.length > 1);

  if (nationIndex[norm]) return nationIndex[norm];

  {
    const lnMatches = [];
    for (const [normDb, dbName] of Object.entries(nationIndex)) {
      if (lastName(normDb) === sofaLast && sofaLast.length >= 3) {
        lnMatches.push({ normDb, dbName });
      }
    }
    if (lnMatches.length === 1) return lnMatches[0].dbName;
    if (lnMatches.length > 1) {
      const sofaFirst = norm.split(" ")[0];
      if (sofaFirst) {
        const exact = lnMatches.find(({ normDb }) => normDb.split(" ")[0] === sofaFirst);
        if (exact) return exact.dbName;
        const prefixed = lnMatches.filter(({ normDb }) => {
          const dbFirst = normDb.split(" ")[0];
          return dbFirst.startsWith(sofaFirst) || sofaFirst.startsWith(dbFirst);
        });
        if (prefixed.length === 1) return prefixed[0].dbName;
      }
      return lnMatches[0].dbName;
    }
  }

  if (sofaWords.length >= 2) {
    const sofaSet = new Set(sofaWords);
    for (const [normDb, dbName] of Object.entries(nationIndex)) {
      const dbWords = normDb.split(" ").filter(w => w.length > 1);
      if (dbWords.length === sofaWords.length && dbWords.every(w => sofaSet.has(w))) return dbName;
    }
  }

  const normFlat = norm.replace(/ /g, "");
  for (const [normDb, dbName] of Object.entries(nationIndex)) {
    const dbFlat = normDb.replace(/ /g, "");
    if (dbFlat.length >= 4 && (normFlat.includes(dbFlat) || dbFlat.includes(normFlat))) return dbName;
  }

  return sofaName;
}

// ── RAPID API ──────────────────────────────────────────────
function fetchRapidAPI(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "sofascore.p.rapidapi.com",
      path,
      method: "GET",
      headers: {
        "x-rapidapi-host": "sofascore.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if (res.statusCode !== 200) {
          const err = new Error(`RapidAPI ${res.statusCode} on ${path}`);
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

function mapPosition(pos) {
  if (!pos) return "C";
  const p = pos.toUpperCase();
  if (["G","GK","GOALKEEPER"].includes(p)) return "P";
  if (["D","DEFENDER","DC","DL","DR","WB"].includes(p)) return "D";
  if (["M","MIDFIELDER","MC","ML","MR","AM","DM"].includes(p)) return "C";
  if (["F","FORWARD","ATTACKER","ST","SS","LW","RW"].includes(p)) return "A";
  return "C";
}

// Rimuove gli incident della lotteria dei rigori prima del parsing,
// così flags e conteggi riflettono solo i 120' di gioco.
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

function parseCardsFromIncidents(incidents) {
  const cards = {};
  const penaltyScored = {};
  for (const inc of (incidents.incidents || [])) {
    if (inc.incidentType === "card" && inc.player) {
      const name = inc.player.name;
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
  const gol = (stats?.goals || 0) + (stats?.goalNormal || 0);
  if (gol > 0) flags.gol = gol;
  if ((stats?.goalAssist || 0) > 0) flags.assist = stats.goalAssist;
  if ((stats?.ownGoals || 0) > 0) flags.aut = stats.ownGoals;
  if ((stats?.penaltyMiss || 0) > 0) flags.rig = true;
  if (cardInfo?.amm) flags.amm = true;
  if (cardInfo?.esp) flags.esp = true;
  if (ruolo === "P") {
    const hasPlayed = (stats?.minutesPlayed || 0) > 0;
    if (hasPlayed) {
      const faced  = stats?.penaltyFaced || 0;
      const rigPar = Math.max(0, faced - (goalsAgainstPenalty || 0));
      if (rigPar > 0) flags.rigpar = rigPar;
      const gs = stats?.goalsConceded !== undefined ? stats.goalsConceded : goalsAgainst;
      if (gs === 0) flags.pi = 1;
      if (gs > 0)   flags.gs = gs;
    }
  }
  return flags;
}

function parseLineupsWithIncidents(lineups, incidents, homeNazione, awayNazione, playerIndex, playerAliases) {
  const result = { home: [], away: [] };
  const { cards, penaltyScored } = parseCardsFromIncidents(incidents);

  const goalsHome = (lineups.home?.players || [])
    .reduce((s, e) => s + (e.statistics?.goals || 0), 0)
    + (lineups.away?.players || []).reduce((s, e) => s + (e.statistics?.ownGoals || 0), 0);
  const goalsAway = (lineups.away?.players || [])
    .reduce((s, e) => s + (e.statistics?.goals || 0), 0)
    + (lineups.home?.players || []).reduce((s, e) => s + (e.statistics?.ownGoals || 0), 0);

  const penaltyAgainstHome = Object.entries(penaltyScored)
    .filter(([name]) => (lineups.away?.players || []).some(e => e.player.name === name))
    .reduce((s, [,v]) => s + v, 0);
  const penaltyAgainstAway = Object.entries(penaltyScored)
    .filter(([name]) => (lineups.home?.players || []).some(e => e.player.name === name))
    .reduce((s, [,v]) => s + v, 0);

  const nazioni = { home: homeNazione, away: awayNazione };

  for (const side of ["home", "away"]) {
    const goalsAgainst   = side === "home" ? goalsAway : goalsHome;
    const penaltyAgainst = side === "home" ? penaltyAgainstHome : penaltyAgainstAway;
    const nazione        = nazioni[side];
    const players        = lineups[side]?.players || [];

    for (const entry of players) {
      const p      = entry.player;
      const stats  = entry.statistics;
      const ruolo  = mapPosition(entry.position || p.position);
      const rating = stats?.rating ? Math.round(parseFloat(stats.rating) * 10) / 10 : null;
      const sv     = entry.substitute === true && !(stats?.minutesPlayed > 0);
      const flags  = extractFlags(stats, ruolo, goalsAgainst, penaltyAgainst, cards[p.name]);

      const resolvedName = nazione
        ? resolvePlayerName(p.name, playerIndex?.[nazione], playerAliases?.[nazione])
        : p.name;

      result[side].push({
        id: p.id,
        name: resolvedName,
        sofaName: p.name,
        shortName: p.shortName,
        position: ruolo,
        rating,
        flags,
        didNotPlay: sv,
        minutesPlayed: stats?.minutesPlayed || 0,
      });
    }
  }
  return result;
}
