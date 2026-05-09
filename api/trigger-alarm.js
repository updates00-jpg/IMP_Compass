// api/trigger-alarm.js
// Triggers alarm via Pusher (open apps) + FCM (background/locked phones).
//
// SECURITY FIXES vs original:
//   - Auth: requires X-IMP-Secret header matching IMP_API_SECRET env var
//   - Rate limit: max 5 alarms/minute per IP (prevents spam/DoS)
//   - FCM called via module import, NOT internal HTTP (eliminates extra cold start)
//   - CORS restricted to production origin
//   - Input sanitised before forwarding

'use strict';

const Pusher = require('pusher');
const { verifySecret, rateLimit } = require('../lib/auth');
const { sendPushToAll } = require('../lib/send-push-logic');

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER || 'eu',
  useTLS: true,
});

// Allowed origins — update if you add a custom domain
const ALLOWED_ORIGINS = [
  'https://imp-compass.vercel.app',
  'https://updates00-jpg.github.io',
];

module.exports = async (req, res) => {
  // CORS — restrict to known origins only
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-IMP-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── AUTHENTICATION ─────────────────────────────────────────────────────────
  if (!verifySecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── RATE LIMITING (5 alarm triggers per minute per IP) ────────────────────
  if (!rateLimit(req, res, { maxRequests: 5, windowMs: 60_000 })) return;

  try {
    const { userId, lat, lng, timestamp, message, type } = req.body;

    // ── INPUT SANITISATION ─────────────────────────────────────────────────
    const safeType = ['alarm', 'all-clear', 'roster-update'].includes(type) ? type : 'alarm';
    const safeUserId = String(userId || '').slice(0, 20).replace(/[^a-zA-Z0-9-_]/g, '');
    const safeMessage = String(message || '').slice(0, 200);
    const safeLat = lat != null && isFinite(lat) ? Number(lat) : null;
    const safeLng = lng != null && isFinite(lng) ? Number(lng) : null;
    const safeTimestamp = timestamp || new Date().toISOString();

    const payload = {
      type: safeType,
      userId: safeUserId,
      message: safeMessage,
      lat: safeLat,
      lng: safeLng,
      timestamp: safeTimestamp,
    };

    // ── PUSHER (for open/foreground apps) ──────────────────────────────────
    await pusher.trigger('imp-compass', safeType, payload);

    // ── FCM (for background / locked phones) ──────────────────────────────
    // Direct module call — no internal HTTP round-trip
    const fcmResult = await sendPushToAll(payload);

    return res.status(200).json({
      success: true,
      pusher: 'sent',
      fcm: fcmResult,
    });

  } catch (err) {
    console.error('[trigger-alarm] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
