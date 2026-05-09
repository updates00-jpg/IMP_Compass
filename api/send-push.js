// api/send-push.js
// Sends FCM push notification to all registered devices.
//
// SECURITY FIXES vs original:
//   - Auth: requires X-IMP-Secret header
//   - Rate limit: max 10 req/minute per IP
//   - Uses shared lib/send-push-logic.js (DRY)
//   - CORS restricted to known origins
//   - Error message does not leak internal details

'use strict';

const { verifySecret, rateLimit } = require('../lib/auth');
const { sendPushToAll } = require('../lib/send-push-logic');

const ALLOWED_ORIGINS = [
  'https://imp-compass.vercel.app',
  'https://updates00-jpg.github.io',
];

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-IMP-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!verifySecret(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!rateLimit(req, res, { maxRequests: 10, windowMs: 60_000 })) return;

  try {
    const { type, userId, message, lat, lng, timestamp } = req.body;

    const safeType = ['alarm', 'all-clear', 'roster-update'].includes(type) ? type : 'notification';
    const safeUserId = String(userId || '').slice(0, 20).replace(/[^a-zA-Z0-9-_]/g, '');
    const safeMessage = String(message || '').slice(0, 200);
    const safeLat = lat != null && isFinite(lat) ? Number(lat) : null;
    const safeLng = lng != null && isFinite(lng) ? Number(lng) : null;

    const result = await sendPushToAll({
      type: safeType,
      userId: safeUserId,
      message: safeMessage,
      lat: safeLat,
      lng: safeLng,
      timestamp: timestamp || new Date().toISOString(),
    });

    return res.status(200).json({ success: true, ...result });

  } catch (err) {
    console.error('[send-push] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
