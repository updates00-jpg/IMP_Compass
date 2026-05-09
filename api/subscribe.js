// api/subscribe.js
// Saves FCM device token to Firestore for push notification targeting.
//
// SECURITY FIXES vs original:
//   - Auth: requires X-IMP-Secret header
//   - Rate limit: max 20 req/minute per IP (devices re-subscribe on token refresh)
//   - Input validation: token format checked, userId sanitised
//   - CORS restricted to known origins
//   - Uses shared firebase-admin.js (DRY)

'use strict';

const { getFirebaseAdmin } = require('../lib/firebase-admin');
const { verifySecret, rateLimit } = require('../lib/auth');

const ALLOWED_ORIGINS = [
  'https://imp-compass.vercel.app',
  'https://updates00-jpg.github.io',
];

// FCM tokens are ~163 character strings — validate format
const FCM_TOKEN_REGEX = /^[a-zA-Z0-9_:.\-]{100,250}$/;

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
  // Higher limit — devices re-subscribe on every token refresh
  if (!rateLimit(req, res, { maxRequests: 20, windowMs: 60_000 })) return;

  try {
    const { token, userId } = req.body;

    // ── INPUT VALIDATION ──────────────────────────────────────────────────
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token required' });
    }
    if (!FCM_TOKEN_REGEX.test(token)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    const safeUserId = String(userId || 'unknown')
      .slice(0, 20)
      .replace(/[^a-zA-Z0-9-_]/g, '');

    const { firestore } = getFirebaseAdmin();

    // Use token as document ID — prevents duplicates naturally
    await firestore.collection('fcm_tokens').doc(token).set(
      {
        token,
        userId: safeUserId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[subscribe] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
