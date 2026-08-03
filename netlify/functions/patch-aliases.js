// ============================================================
// FANTASY ARENA — patch-aliases.js
// Netlify Function — da invocare MANUALMENTE una tantum
// GET /.netlify/functions/patch-aliases
//
// Corregge e completa gli alias in global/playerAliases:
//  - rimuove alias errati (Svezia Johansson doppio, Senegal Diouf)
//  - aggiunge alias low-confidence confermati manualmente
//  - aggiunge Mohammad Taha → Abu Taha (Giordania)
// ============================================================

const admin = require("firebase-admin");

let _app;
function getDb() {
  if (!_app) {
    const sa  = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    _app = admin.initializeApp(
      { credential: admin.credential.cert(sa), databaseURL: process.env.FIREBASE_DATABASE_URL },
      "patch-aliases"
    );
  }
  return admin.app("patch-aliases").database();
}

function safeKey(s) {
  return String(s).replace(/[.#$[\]]/g, "_");
}

// ── Alias da RIMUOVERE (mappings errati scritti da normalize-players) ─
const TO_DELETE = [
  // entrambi mappati a "Johansson" — ambigui, meglio rimuovere
  { nazione: "Svezia",  sofaName: "Viktor Johansson" },
  { nazione: "Svezia",  sofaName: "Herman Johansson" },
  // "Yehvann Diouf" mappato erroneamente a "M. Diouf"
  { nazione: "Senegal", sofaName: "Yehvann Diouf"    },
];

// ── Alias da AGGIUNGERE (low-confidence + manuali confermati) ─────────
const TO_ADD = [
  { nazione: "Messico",    sofaName: "Mateo Chávez",                 dbName: "Chavez"     },
  { nazione: "Marocco",    sofaName: "Ayoube Amaimouni Echghouyab",  dbName: "Amaimouni"  },
  { nazione: "Qatar",      sofaName: "Ayoub Al Oui",                 dbName: "Al Oui"     },
  { nazione: "Qatar",      sofaName: "Mahmud Abunad",                dbName: "Abunada"    },
  { nazione: "Haiti",      sofaName: "Dominique Simon",              dbName: "Dominique"  },
  { nazione: "Haiti",      sofaName: "Ricardo Adé",                  dbName: "Adé"        },
  { nazione: "Giappone",  sofaName: "Junya Ito",                    dbName: "J. Ito"     },
  { nazione: "Giappone",  sofaName: "Hiroki Ito",                   dbName: "H. Ito"     },
  { nazione: "Olanda",    sofaName: "Tijjani Reijnders",            dbName: "Rejinders"  },
  { nazione: "Turchia",    sofaName: "Kenan Yıldız",                 dbName: "Yıldız"     },
  { nazione: "Turchia",    sofaName: "Oğuz Aydın",                   dbName: "Aydın"      },
  { nazione: "Turchia",    sofaName: "Samet Akaydın",                dbName: "Akaydın"    },
  { nazione: "Turchia",    sofaName: "Altay Bayındır",               dbName: "Bayındır"   },
  { nazione: "Turchia",    sofaName: "Uğurcan Çakır",                dbName: "Çakır"      },
  { nazione: "Olanda",     sofaName: "Micky van de Ven",             dbName: "Van De Ven" },
  { nazione: "Capo Verde", sofaName: "Logan Costa",                  dbName: "Costa"      },
  { nazione: "Capo Verde", sofaName: "Kevin Lenini",                 dbName: "K. Pina"    },
  { nazione: "Arabia Saudita", sofaName: "Hassan Altambakti",        dbName: "Altambatki" },
  { nazione: "Senegal",    sofaName: "Bara Sapoko Ndiaye",           dbName: "S. Ndiaye"  },
  { nazione: "RD Congo",   sofaName: "Lionel Mpasi Nzau",            dbName: "Mpasi"      },
  { nazione: "Croazia",    sofaName: "Duje Ćaleta-Car",              dbName: "Ćaleta-Car" },
  { nazione: "Giordania",  sofaName: "Mohammad Taha",                dbName: "Abu Taha"   },
  { nazione: "Iraq",       sofaName: "Hussein Ali",                  dbName: "H. Ali"     },
  { nazione: "Svezia",     sofaName: "Viktor Johansson",             dbName: "V. Johansson" },
  { nazione: "Svezia",     sofaName: "Herman Johansson",             dbName: "H. Johansson" },
  { nazione: "Senegal",    sofaName: "Yehvann Diouf",               dbName: "Y. Diouf"   },
];

exports.handler = async () => {
  const db    = getDb();
  const lines = [];

  // ── Rimozioni ──────────────────────────────────────────────
  lines.push("=== RIMOZIONI ===");
  for (const { nazione, sofaName } of TO_DELETE) {
    const key  = safeKey(sofaName);
    const ref  = db.ref(`global/playerAliases/${nazione}/${key}`);
    const snap = await ref.once("value");
    if (snap.exists()) {
      await ref.remove();
      lines.push(`  DEL  [${nazione}] "${sofaName}" (era → "${snap.val()}")`);
    } else {
      lines.push(`  SKIP [${nazione}] "${sofaName}" — non presente`);
    }
  }

  // ── Aggiunte ───────────────────────────────────────────────
  lines.push("\n=== AGGIUNTE ===");
  for (const { nazione, sofaName, dbName } of TO_ADD) {
    const key  = safeKey(sofaName);
    const ref  = db.ref(`global/playerAliases/${nazione}/${key}`);
    const snap = await ref.once("value");
    if (snap.exists() && snap.val() === dbName) {
      lines.push(`  SKIP [${nazione}] "${sofaName}" — già corretto ("${dbName}")`);
    } else {
      const old = snap.exists() ? ` (sovrascrive "${snap.val()}")` : "";
      await ref.set(dbName);
      lines.push(`  SET  [${nazione}] "${sofaName}" → "${dbName}"${old}`);
    }
  }

  lines.push("\nDone.");
  return {
    statusCode: 200,
    headers:    { "Content-Type": "text/plain; charset=utf-8" },
    body:       lines.join("\n"),
  };
};
