// api/trigger-alarm.js — Trigger alarm via Pusher + FCM
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
    })
  });
}

const Pusher = require('pusher');

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER || 'eu',
  useTLS: true
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, lat, lng, timestamp, message, type } = req.body;

    const payload = { userId, lat, lng, timestamp, message, type: type || 'alarm' };

    // 1. Send via Pusher (for open apps)
    await pusher.trigger('imp-compass', type || 'alarm', payload);

    // 2. Send via FCM (for background / locked phones)
    const baseUrl = `https://${req.headers.host}`;
    const fcmRes = await fetch(`${baseUrl}/api/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const fcmData = await fcmRes.json();

    return res.status(200).json({
      success: true,
      pusher: 'sent',
      fcm: fcmData
    });

  } catch (err) {
    console.error('Trigger alarm error:', err);
    return res.status(500).json({ error: err.message });
  }
};
