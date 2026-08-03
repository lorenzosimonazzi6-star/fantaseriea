// ============================================================
// FANTASY ARENA — normalize-players.js
// Netlify Function — da invocare MANUALMENTE una tantum
// GET /.netlify/functions/normalize-players
//
// Strategia (non-destructive):
//   1. Fetcha lineups giornata 1 per estrarre {nazione → teamId}
//   2. Per ogni nazione, chiama /teams/get-squad
//   3. Risolve ogni nome SofaScore contro il DB (stessa logica del poller)
//   4. Scrive solo alias ad alta confidenza in global/playerAliases
//   5. Restituisce report completo: matched / no-alias-needed / low-conf / not-found
// ============================================================

const https = require("https");
const admin = require("firebase-admin");

// ── TeamId noti (aggiungere man mano che vengono scoperti) ─
// Hanno priorità sull'estrazione automatica dai lineups.
// Formato: { "NomeNelDB": teamId }
const KNOWN_TEAM_IDS = {
  // Giornata 1 — 11-12 giugno
  "Messico":         4781,
  "Corea del Sud":   4735,
  "Repubblica Ceca": 4714,
  "Sudafrica":       4736,
  "Canada":          4752,
  "Bosnia":          4479,
  "USA":             4724,
  "Paraguay":        4789,
  // Giornata 1 — 13-14 giugno
  "Svizzera":        4699,
  "Qatar":           4792,
  "Brasile":         4748,
  "Marocco":         4778,
  "Haiti":           7229,
  "Scozia":          4695,
  "Turchia":         4700,
  "Australia":       4741,
  // Giornata 1 — 14-15 giugno
  "Germania":        4711,
  "Curacao":         55827,
  "Costa d'Avorio":  4768,
  "Ecuador":         4757,
  "Olanda":          4705,
  "Giappone":        4770,
  "Svezia":          4688,
  "Tunisia":         4729,
  "Belgio":          4717,
  "Egitto":          4758,
  "Iran":            4766,
  "Nuova Zelanda":   4784,
  "Spagna":          4698,
  "Capo Verde":      4753,
  "Arabia Saudita":  4834,
  "Uruguay":         4725,
  // Giornata 1 — 16-18 giugno
  "Senegal":         4739,
  "Francia":         4481,
  "Iraq":            4767,
  "Norvegia":        4475,
  "Argentina":       4819,
  "Algeria":         4691,
  "Austria":         4718,
  "Giordania":       4771,
  "Portogallo":      4704,
  "RD Congo":        4823,
  "Uzbekistan":      4723,
  "Colombia":        4820,
  "Inghilterra":     4713,
  "Croazia":         4715,
  "Ghana":           4764,
  "Panama":          5164,
};

// ── Partite giornata 1 — coprono tutte e 48 le nazioni ────
const G1_MATCHES = [
  { eventId: "15186710", home: "Messico",          away: "Sudafrica"       },
  { eventId: "15186720", home: "Corea del Sud",    away: "Repubblica Ceca" },
  { eventId: "15186836", home: "Canada",           away: "Bosnia"          },
  { eventId: "15186873", home: "USA",              away: "Paraguay"        },
  { eventId: "15186526", home: "Qatar",            away: "Svizzera"        },
  { eventId: "15186850", home: "Brasile",          away: "Marocco"         },
  { eventId: "15186853", home: "Haiti",            away: "Scozia"          },
  { eventId: "15186874", home: "Australia",        away: "Turchia"         },
  { eventId: "15186899", home: "Germania",         away: "Curacao"         },
  { eventId: "15186945", home: "Olanda",           away: "Giappone"        },
  { eventId: "15186904", home: "Costa d'Avorio",   away: "Ecuador"         },
  { eventId: "15186951", home: "Svezia",           away: "Tunisia"         },
  { eventId: "15186783", home: "Spagna",           away: "Capo Verde"      },
  { eventId: "15186837", home: "Belgio",           away: "Egitto"          },
  { eventId: "15186811", home: "Arabia Saudita",   away: "Uruguay"         },
  { eventId: "15186832", home: "Iran",             away: "Nuova Zelanda"   },
  { eventId: "15186501", home: "Francia",          away: "Senegal"         },
  { eventId: "15186773", home: "Iraq",             away: "Norvegia"        },
  { eventId: "15186854", home: "Argentina",        away: "Algeria"         },
  { eventId: "15186751", home: "Austria",          away: "Giordania"       },
  { eventId: "15186709", home: "Portogallo",       away: "RD Congo"        },
  { eventId: "15186504", home: "Inghilterra",      away: "Croazia"         },
  { eventId: "15186687", home: "Ghana",            away: "Panama"          },
  { eventId: "15186722", home: "Uzbekistan",       away: "Colombia"        },
];

// ── Firebase ───────────────────────────────────────────────
let _app;
function getDb() {
  if (!_app) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    _app = admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: process.env.FIREBASE_DATABASE_URL });
  }
  return admin.database();
}

// ── RapidAPI ───────────────────────────────────────────────
function fetchRapidAPI(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "sofascore.p.rapidapi.com",
      path,
      method:  "GET",
      headers: {
        "x-rapidapi-host": "sofascore.p.rapidapi.com",
        "x-rapidapi-key":  process.env.RAPIDAPI_KEY,
      },
    }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end",  () => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { reject(new Error("JSON parse error")); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ── Helpers di normalizzazione (stessa logica del poller) ──
function safeKey(s) { return String(s).replace(/[.#$[\]]/g, "_"); }

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

// Risolve sofaName → dbName con indicazione di confidenza.
// Ritorna { dbName, confidence: "exact"|"high"|"low"|"none" }
function resolveWithConfidence(sofaName, nationIndex) {
  if (!nationIndex) return { dbName: sofaName, confidence: "none" };

  const norm      = normalizeName(sofaName);
  const sofaLast  = lastName(norm);
  const sofaFirst = norm.split(" ")[0];

  // 1) Exact match
  if (nationIndex[norm]) return { dbName: nationIndex[norm], confidence: "exact" };

  // 2) Last-name match con disambiguazione per prefisso
  const lnMatches = Object.entries(nationIndex)
    .filter(([normDb]) => lastName(normDb) === sofaLast && sofaLast.length >= 4);

  if (lnMatches.length === 1) {
    return { dbName: lnMatches[0][1], confidence: "high" };
  }
  if (lnMatches.length > 1) {
    // 2a) exact first-word
    const exact = lnMatches.find(([normDb]) => normDb.split(" ")[0] === sofaFirst);
    if (exact) return { dbName: exact[1], confidence: "high" };
    // 2b) prefix
    const prefixed = lnMatches.filter(([normDb]) => {
      const dbFirst = normDb.split(" ")[0];
      return dbFirst.startsWith(sofaFirst) || sofaFirst.startsWith(dbFirst);
    });
    if (prefixed.length === 1) return { dbName: prefixed[0][1], confidence: "high" };
    // ambiguo
    return { dbName: lnMatches[0][1], confidence: "low" };
  }

  // 3) Word-set match
  const sofaWords = norm.split(" ").filter(w => w.length > 1);
  if (sofaWords.length >= 2) {
    const sofaSet = new Set(sofaWords);
    for (const [normDb, dbName] of Object.entries(nationIndex)) {
      const dbWords = normDb.split(" ").filter(w => w.length > 1);
      if (dbWords.length === sofaWords.length && dbWords.every(w => sofaSet.has(w)))
        return { dbName, confidence: "high" };
    }
  }

  // 4) Containment fallback
  const normFlat = norm.replace(/ /g, "");
  for (const [normDb, dbName] of Object.entries(nationIndex)) {
    const dbFlat = normDb.replace(/ /g, "");
    if (dbFlat.length >= 4 && (normFlat.includes(dbFlat) || dbFlat.includes(normFlat)))
      return { dbName, confidence: "low" };
  }

  return { dbName: sofaName, confidence: "none" };
}

// Esegue fn in batch sequenziali da batchSize elementi
async function batchAll(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

// ── HANDLER ────────────────────────────────────────────────
exports.handler = async function () {
  const db = getDb();

  // Carica indice DB e alias esistenti
  const [squadreSnap, aliasSnap] = await Promise.all([
    db.ref("global/giocatoriSquadra").once("value"),
    db.ref("global/playerAliases").once("value"),
  ]);
  const squadre        = squadreSnap.val() || {};
  const existingAlias  = aliasSnap.val()   || {};

  // Costruisce playerIndex: { nazione: { normalizedName → dbName } }
  const playerIndex = {};
  for (const [nazione, players] of Object.entries(squadre)) {
    playerIndex[nazione] = {};
    const arr = Array.isArray(players) ? players : Object.values(players);
    for (const p of arr) {
      if (p?.nome) playerIndex[nazione][normalizeName(p.nome)] = p.nome;
    }
  }

  // ── STEP 1: estrai teamId (da mappa nota + lineups) ──────
  console.log("[normalize] Costruzione teamIdMap...");
  const teamIdMap = { ...KNOWN_TEAM_IDS }; // seed con ID noti

  // Integra con estrazione automatica da lineups (solo per nazioni ancora sconosciute)
  const unknownMatches = G1_MATCHES.filter(m => !teamIdMap[m.home] || !teamIdMap[m.away]);
  if (unknownMatches.length) {
    console.log(`[normalize] Fetching lineups per ${unknownMatches.length} partite con nazioni sconosciute...`);
    await batchAll(unknownMatches, 8, async (match) => {
      try {
        const data = await fetchRapidAPI(`/matches/get-lineups?matchId=${match.eventId}`);
        const homeId = data?.home?.team?.id;
        const awayId = data?.away?.team?.id;
        if (homeId && !teamIdMap[match.home]) teamIdMap[match.home] = homeId;
        if (awayId && !teamIdMap[match.away]) teamIdMap[match.away] = awayId;
      } catch (err) {
        console.warn(`[normalize] Lineups non disponibili per ${match.home}-${match.away}: ${err.message}`);
      }
    });
  }

  const nazioniConId = Object.entries(teamIdMap);
  console.log(`[normalize] teamId estratti: ${nazioniConId.length}/48`);

  // ── STEP 2: fetch squad per ogni nazione ─────────────────
  console.log("[normalize] Fetching squad per ogni nazione...");

  const report = {
    aliasAdded:       [],   // { nazione, sofaName, dbName }
    noAliasNeeded:    [],   // exact match — nessun alias necessario
    lowConfidence:    [],   // match ambiguo — skip, richiede alias manuale
    notFound:         [],   // nessun match trovato nel DB
    alreadyAliased:   [],   // alias già presente
    teamIdMissing:    [],   // teamId non trovato (partita non ancora giocata)
  };

  const aliasesToWrite = {}; // { nazione: { sofaName: dbName } }

  await batchAll(nazioniConId, 6, async ([nazione, teamId]) => {
    let squadData;
    try {
      squadData = await fetchRapidAPI(`/teams/get-squad?teamId=${teamId}`);
    } catch (err) {
      console.warn(`[normalize] Squad non disponibile per ${nazione} (${teamId}): ${err.message}`);
      return;
    }

    // Gestisce varie strutture di risposta SofaScore
    const members = squadData?.players || squadData?.squad || [];
    const nIdx = playerIndex[nazione] || {};
    const existingNation = existingAlias[nazione] || {};

    for (const entry of members) {
      const sofaName = entry?.player?.name || entry?.name;
      if (!sofaName) continue;

      // Già presente in playerAliases → skip
      if (existingNation[safeKey(sofaName)]) {
        report.alreadyAliased.push({ nazione, sofaName, current: existingNation[safeKey(sofaName)] });
        continue;
      }

      const { dbName, confidence } = resolveWithConfidence(sofaName, nIdx);

      if (confidence === "exact") {
        // Exact match normalizzato → nessun alias necessario (step 1 lo gestisce già)
        report.noAliasNeeded.push({ nazione, sofaName });
      } else if (confidence === "high") {
        // Alta confidenza → scrivi alias
        if (!aliasesToWrite[nazione]) aliasesToWrite[nazione] = {};
        aliasesToWrite[nazione][safeKey(sofaName)] = dbName;
        report.aliasAdded.push({ nazione, sofaName, dbName });
      } else if (confidence === "low") {
        // Ambiguo → non scrivere, segnala per revisione manuale
        report.lowConfidence.push({ nazione, sofaName, candidato: dbName });
      } else {
        // Nessun match → segnala (giocatore non nel DB della lega)
        report.notFound.push({ nazione, sofaName });
      }
    }
  });

  // Nazioni senza teamId (partite non ancora giocate)
  for (const m of G1_MATCHES) {
    if (!teamIdMap[m.home]) report.teamIdMissing.push(m.home);
    if (!teamIdMap[m.away]) report.teamIdMissing.push(m.away);
  }

  // ── STEP 3: scrivi alias in Firebase ─────────────────────
  const writes = [];
  for (const [nazione, aliases] of Object.entries(aliasesToWrite)) {
    for (const [sofaName, dbName] of Object.entries(aliases)) {
      writes.push(db.ref(`global/playerAliases/${nazione}/${safeKey(sofaName)}`).set(dbName));
    }
  }
  await Promise.all(writes);

  // ── Report ───────────────────────────────────────────────
  const lines = [
    `=== NORMALIZE PLAYERS REPORT ===`,
    ``,
    `✅ Alias scritti:        ${report.aliasAdded.length}`,
    `✔  Exact (nessun alias): ${report.noAliasNeeded.length}`,
    `⚠️  Low confidence skip:  ${report.lowConfidence.length}`,
    `❌ Non trovati nel DB:   ${report.notFound.length}`,
    `🔁 Già in alias:         ${report.alreadyAliased.length}`,
    `⏳ TeamId mancante:      ${[...new Set(report.teamIdMissing)].length} nazioni`,
    ``,
  ];

  if (report.aliasAdded.length) {
    lines.push("── ALIAS AGGIUNTI ──────────────────────────");
    report.aliasAdded.forEach(({ nazione, sofaName, dbName }) =>
      lines.push(`  ${nazione}: "${sofaName}" → "${dbName}"`)
    );
    lines.push("");
  }

  if (report.lowConfidence.length) {
    lines.push("── LOW CONFIDENCE (aggiungere manualmente) ─");
    report.lowConfidence.forEach(({ nazione, sofaName, candidato }) =>
      lines.push(`  ${nazione}: "${sofaName}" → candidato: "${candidato}" (VERIFICA)`)
    );
    lines.push("");
  }

  if (report.notFound.length) {
    lines.push("── NON TROVATI NEL DB ──────────────────────");
    report.notFound.forEach(({ nazione, sofaName }) =>
      lines.push(`  ${nazione}: "${sofaName}"`)
    );
    lines.push("");
  }

  if (report.teamIdMissing.length) {
    lines.push("── NAZIONI SENZA TEAMID (partita non giocata) ─");
    [...new Set(report.teamIdMissing)].forEach(n => lines.push(`  ${n}`));
    lines.push("");
  }

  const body = lines.join("\n");
  console.log(body);
  return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body };
};
