// Invia push a tutti i subscriber di una lega
const admin = require("firebase-admin");
const webpush = require("web-push");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://fantamondiale-2195f-default-rtdb.europe-west1.firebasedatabase.app"
  });
}

// Chiavi VAPID SOLO da env: la privata è un segreto, mai hardcoded.
// Rigenerare con `npx web-push generate-vapid-keys`, impostare le env su
// Netlify e tenere VAPID_PUBLIC_KEY in sync col client (app.js).
const VAPID_CONFIGURED = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (VAPID_CONFIGURED) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@fantaarena.it",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  if (!VAPID_CONFIGURED) return { statusCode: 503, body: "Push non configurato (VAPID env mancanti)" };
  // Verify admin secret
  const { legaId, title, body, url, secret } = JSON.parse(event.body || "{}");
  if (secret !== process.env.ADMIN_PUSH_SECRET) return { statusCode: 401, body: "Unauthorized" };
  if (!legaId) return { statusCode: 400, body: "legaId required" };

  const snap = await admin.database().ref(`leghe/${legaId}/pushSubscriptions`).get();
  const subs = snap.val() || {};
  const payload = JSON.stringify({ title: title || "Fantasy Arena", body: body || "Novità nella lega!", url: url || "/" });

  let sent = 0, failed = 0;
  await Promise.all(Object.values(subs).map(async entry => {
    try {
      await webpush.sendNotification(entry.subscription, payload);
      sent++;
    } catch (e) {
      failed++;
      if (e.statusCode === 410) {
        // Subscription expired — remove it
        const key = entry.uid?.replace(/[.#$\[\]]/g, "_");
        if (key) await admin.database().ref(`leghe/${legaId}/pushSubscriptions/${key}`).remove();
      }
    }
  }));
  return { statusCode: 200, body: JSON.stringify({ sent, failed }) };
};
