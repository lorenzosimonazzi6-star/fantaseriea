// ============================================================
// FANTASY ARENA — migrate-rose.js
// Netlify Function — aggiorna i nomi dei giocatori nelle rose
// usando Firebase Admin SDK (bypassa le security rules).
// Chiamata dal pannello superadmin dopo un aggiornamento CSV.
// ============================================================

const admin = require("firebase-admin");

let firebaseApp;
function getFirebase() {
  if (!firebaseApp) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    }, "migrate-rose");
  }
  return admin.database(firebaseApp);
}

function normalizeName(s) {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[-']/g, " ").replace(/\s+/g, " ").trim();
}
function lastName(norm) { const p = norm.split(" "); return p[p.length - 1]; }

function resolvePlayerName(oldName, idx) {
  if (!idx) return oldName;
  const norm = normalizeName(oldName);
  const last = lastName(norm);
  const words = norm.split(" ").filter(w => w.length > 1);

  if (idx[norm]) return idx[norm];

  for (const [nd, dn] of Object.entries(idx)) {
    if (lastName(nd) === last && last.length >= 4) return dn;
  }

  if (words.length >= 2) {
    const ws = new Set(words);
    for (const [nd, dn] of Object.entries(idx)) {
      const dw = nd.split(" ").filter(w => w.length > 1);
      if (dw.length === words.length && dw.every(w => ws.has(w))) return dn;
    }
  }

  const flat = norm.replace(/ /g, "");
  for (const [nd, dn] of Object.entries(idx)) {
    const df = nd.replace(/ /g, "");
    if (df.length >= 4 && (flat.includes(df) || df.includes(flat))) return dn;
  }

  return oldName;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const db = getFirebase();

    // Leggi giocatoriSquadra da Firebase (nomi corretti aggiornati)
    const gsSnap = await db.ref("global/giocatoriSquadra").once("value");
    const gs = gsSnap.val() || {};

    // Costruisci indice per nazione: normalized → nome_corretto
    const nazIndex = {};
    for (const [naz, players] of Object.entries(gs)) {
      if (!Array.isArray(players)) continue;
      nazIndex[naz] = {};
      for (const g of players) nazIndex[naz][normalizeName(g.nome)] = g.nome;
    }

    // Leggi tutte le leghe
    const legheSnap = await db.ref("leghe").once("value");
    const legheData = legheSnap.val() || {};

    let totalChecked = 0, totalUpdated = 0;
    const updates = {};

    for (const [legaId, legaData] of Object.entries(legheData)) {
      const playerRose = legaData?.playerRose || {};
      for (const [uid, roseData] of Object.entries(playerRose)) {
        if (!roseData?.rosa) continue;
        let changed = false;
        const newRosa = {};

        for (const [ruolo, players] of Object.entries(roseData.rosa)) {
          if (!Array.isArray(players)) { newRosa[ruolo] = players; continue; }
          newRosa[ruolo] = players.map(g => {
            totalChecked++;
            const newNome = resolvePlayerName(g.nome, nazIndex[g.nazione]);
            if (newNome !== g.nome) { changed = true; totalUpdated++; return { ...g, nome: newNome }; }
            return g;
          });
        }

        // Aggiorna il capitano se rinominato
        let newCapitano = roseData.capitano ?? null;
        if (roseData.capitano) {
          outer: for (const players of Object.values(roseData.rosa)) {
            if (!Array.isArray(players)) continue;
            for (const g of players) {
              if (g.nome === roseData.capitano) {
                const nc = resolvePlayerName(roseData.capitano, nazIndex[g.nazione]);
                if (nc !== roseData.capitano) { newCapitano = nc; changed = true; }
                break outer;
              }
            }
          }
        }

        if (changed) {
          updates[`leghe/${legaId}/playerRose/${uid}`] = {
            ...roseData, rosa: newRosa, capitano: newCapitano, updatedAt: Date.now(),
          };
        }
      }
    }

    // Scrivi tutto in un unico batch atomico
    if (Object.keys(updates).length > 0) {
      await db.ref("/").update(updates);
    }

    console.log(`[migrate-rose] ${totalUpdated} nomi aggiornati su ${totalChecked} controllati`);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalChecked, totalUpdated }),
    };
  } catch (err) {
    console.error("[migrate-rose] errore:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
