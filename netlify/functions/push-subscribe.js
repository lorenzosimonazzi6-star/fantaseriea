// Salva una push subscription in Firebase
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://fantamondiale-2195f-default-rtdb.europe-west1.firebasedatabase.app"
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const { subscription, legaId, uid } = JSON.parse(event.body);
    if (!subscription || !legaId || !uid) return { statusCode: 400, body: "Missing fields" };
    const key = uid.replace(/[.#$\[\]]/g, "_");
    await admin.database().ref(`leghe/${legaId}/pushSubscriptions/${key}`).set({
      subscription,
      uid,
      ts: Date.now()
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: e.message };
  }
};
