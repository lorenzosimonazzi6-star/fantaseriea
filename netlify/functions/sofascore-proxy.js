const https = require("https");

exports.handler = async function (event) {
  const eventId = event.queryStringParameters?.eventId;
  if (!eventId) {
    return { statusCode: 400, body: JSON.stringify({ error: "eventId mancante" }) };
  }

  try {
    // Chiamate parallele a lineups e incidents
    const [lineups, incidents] = await Promise.all([
      fetchRapidAPI(`/matches/get-lineups?matchId=${eventId}`),
      fetchRapidAPI(`/matches/get-incidents?matchId=${eventId}`),
    ]);

    const result = parseLineupsWithIncidents(lineups, incidents);
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

// Costruisce una mappa { nomeGiocatore: { amm, esp, rig } } dagli incidents
function parseCardsFromIncidents(incidents) {
  const cards = {}; // { playerName: { amm: bool, esp: bool } }
  const penaltySaved = {}; // { portiereName: count }
  const penaltyScored = {}; // { calciatoreName: bool } — per dedurre rigore segnato (portiere non ha parato)

  for (const inc of (incidents.incidents || [])) {
    // Cartellini
    if (inc.incidentType === "card" && inc.player) {
      const name = inc.player.name;
      if (!cards[name]) cards[name] = { amm: false, esp: false };
      if (inc.incidentClass === "yellow") {
        cards[name].amm = true;
      } else if (inc.incidentClass === "red" || inc.incidentClass === "yellowRed") {
        cards[name].esp = true;
        cards[name].amm = false; // il rosso include già il giallo
      }
    }

    // Gol da rigore — per sapere se il portiere ha subito un rigore
    if (inc.incidentType === "goal" && inc.incidentClass === "penalty" && inc.player) {
      penaltyScored[inc.player.name] = (penaltyScored[inc.player.name] || 0) + 1;
    }

    // Rigore parato: se il portiere ha penaltyFaced ma non c'è gol da rigore corrispondente
    // Lo gestiamo nel parseLineups confrontando penaltyFaced con i gol da rigore subiti
  }

  return { cards, penaltyScored };
}

// Calcola rigori parati per portiere: penaltyFaced - rigori segnati contro di lui
function calcPenaltySaved(stats, goalsAgainstPenalty) {
  const faced = stats?.penaltyFaced || 0;
  return Math.max(0, faced - goalsAgainstPenalty);
}

function extractFlags(stats, ruolo, goalsAgainst, goalsAgainstPenalty, cardInfo) {
  const flags = {};

  // Gol (multi) — tutti i ruoli
  if ((stats?.goals || 0) > 0) flags.gol = stats.goals;

  // Assist (multi) — tutti i ruoli
  if ((stats?.goalAssist || 0) > 0) flags.assist = stats.goalAssist;

  // Autogol (multi) — tutti i ruoli
  if ((stats?.ownGoals || 0) > 0) flags.aut = stats.ownGoals;

  // Solo portiere
  if (ruolo === "P") {
    // Rigori parati (multi) — deducibile da penaltyFaced - rigori segnati contro
    const rigPar = calcPenaltySaved(stats, goalsAgainstPenalty);
    if (rigPar > 0) flags.rigpar = rigPar;

    // Porta inviolata
    if ((stats?.minutesPlayed || 0) >= 90 && goalsAgainst === 0) flags.pi = 1;

    // Gol subiti (multi)
    if (goalsAgainst > 0) flags.gs = goalsAgainst;
  }

  // Cartellini dagli incidents (più affidabili delle stats)
  if (cardInfo?.amm) flags.amm = true;
  if (cardInfo?.esp) flags.esp = true;

  // Rigore sbagliato — da penaltyMiss nelle stats (non negli incidents)
  if ((stats?.penaltyMiss || 0) > 0) flags.rig = true;

  return flags;
}

function parseLineupsWithIncidents(lineups, incidents) {
  const result = { home: [], away: [] };
  const { cards, penaltyScored } = parseCardsFromIncidents(incidents);

  // Gol totali per squadra (inclusi autogol)
  const goalsHome = (lineups.home?.players || [])
    .reduce((s, e) => s + (e.statistics?.goals || 0), 0)
    + (lineups.away?.players || []).reduce((s, e) => s + (e.statistics?.ownGoals || 0), 0);
  const goalsAway = (lineups.away?.players || [])
    .reduce((s, e) => s + (e.statistics?.goals || 0), 0)
    + (lineups.home?.players || []).reduce((s, e) => s + (e.statistics?.ownGoals || 0), 0);

  // Rigori segnati contro ciascuna squadra
  const penaltyAgainstHome = Object.entries(penaltyScored)
    .filter(([name]) => (lineups.away?.players || []).some(e => e.player.name === name))
    .reduce((s, [,v]) => s + v, 0);
  const penaltyAgainstAway = Object.entries(penaltyScored)
    .filter(([name]) => (lineups.home?.players || []).some(e => e.player.name === name))
    .reduce((s, [,v]) => s + v, 0);

  for (const side of ["home", "away"]) {
    const goalsAgainst      = side === "home" ? goalsAway : goalsHome;
    const penaltyAgainst    = side === "home" ? penaltyAgainstHome : penaltyAgainstAway;
    const players = lineups[side]?.players || [];

    for (const entry of players) {
      const p      = entry.player;
      const stats  = entry.statistics;
      const ruolo  = mapPosition(entry.position || p.position);
      const rating = stats?.rating ? Math.round(parseFloat(stats.rating) * 10) / 10 : null;
      const sv     = entry.substitute === true && !(stats?.minutesPlayed > 0);
      const flags  = extractFlags(stats, ruolo, goalsAgainst, penaltyAgainst, cards[p.name]);

      result[side].push({
        id: p.id,
        name: p.name,
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
