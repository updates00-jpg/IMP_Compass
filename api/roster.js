// api/roster.js
// Manages duty roster data via Vercel Blob storage.
//
// SECURITY FIXES vs original:
//   - Auth: requires X-IMP-Secret header on ALL methods
//   - Blob access changed from 'public' → 'private' (roster is operational data)
//   - Blob served through this endpoint with auth check, not exposed directly
//   - Rate limit: 30 req/min GET (reads), 10 req/min POST (writes)
//   - Parallel blob deletion via Promise.all (was sequential — N+1 pattern)
//   - Payload size limit (prevents oversized body DoS)
//   - CORS restricted to known origins

'use strict';

const { put, list, del, head } = require('@vercel/blob');
const Pusher = require('pusher');
const { verifySecret, rateLimit } = require('../lib/auth');

const ROSTER_KEY = 'imp-roster.json';
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// Max POST body size: 50 KB (roster for 15 people for a week is <5 KB)
const MAX_BODY_BYTES = 50_000;

const ALLOWED_ORIGINS = [
  'https://imp-compass.vercel.app',
  'https://updates00-jpg.github.io',
];

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER || 'eu',
  useTLS: true,
});

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-IMP-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── AUTH on every method ───────────────────────────────────────────────────
  if (!verifySecret(req)) return res.status(401).json({ error: 'Unauthorized' });

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!rateLimit(req, res, { maxRequests: 30, windowMs: 60_000 })) return;
    try {
      const { blobs } = await list({ prefix: ROSTER_KEY, token: TOKEN });
      if (!blobs || !blobs.length) {
        return res.status(200).json({ roster: {}, week: null });
      }

      // Fetch private blob via server-side request (not exposed to client directly)
      const latest = blobs[0];
      const blobRes = await fetch(latest.url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (!blobRes.ok) throw new Error('Failed to fetch blob');
      const data = await blobRes.json();
      return res.status(200).json(data);

    } catch (err) {
      console.error('[roster GET] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!rateLimit(req, res, { maxRequests: 10, windowMs: 60_000 })) return;
    try {
      const { roster, week } = req.body;
      if (!roster || typeof roster !== 'object') {
        return res.status(400).json({ error: 'Missing or invalid roster' });
      }

      const payload = JSON.stringify({
        roster,
        week: week || null,
        updatedAt: new Date().toISOString(),
      });

      // Enforce payload size limit
      if (Buffer.byteLength(payload, 'utf8') > MAX_BODY_BYTES) {
        return res.status(413).json({ error: 'Payload too large' });
      }

      // Delete old blobs in parallel (was sequential await in loop)
      try {
        const { blobs } = await list({ prefix: ROSTER_KEY, token: TOKEN });
        if (blobs.length > 0) {
          await Promise.all(blobs.map(b => del(b.url, { token: TOKEN })));
        }
      } catch (e) {
        console.warn('[roster POST] Delete old blobs failed:', e.message);
        // Non-fatal — continue saving new blob
      }

      // Save new blob — PRIVATE (not publicly accessible)
      const { url } = await put(ROSTER_KEY, payload, {
        access: 'private',      // ← FIXED: was 'public'
        token: TOKEN,
        addRandomSuffix: false,
        contentType: 'application/json',
      });

      console.log('[roster POST] Saved to blob store (private)');

      // Notify connected clients via Pusher
      try {
        await pusher.trigger('imp-compass', 'roster-update', {
          week: week || null,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[roster POST] Pusher notify failed:', e.message);
        // Non-fatal — roster was saved successfully
      }

      return res.status(200).json({ ok: true });

    } catch (err) {
      console.error('[roster POST] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
