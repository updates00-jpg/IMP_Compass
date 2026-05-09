// lib/auth.js
// Shared API authentication middleware.
// Every endpoint calls verifySecret(req) before processing.
//
// The secret is sent by the client in the X-IMP-Secret header.
// It must match the IMP_API_SECRET environment variable set in Vercel.
//
// Setup (Vercel dashboard → Settings → Environment Variables):
//   IMP_API_SECRET = <random 32+ character string, e.g. from: openssl rand -hex 32>

'use strict';

/**
 * Verify the shared secret header.
 * Returns true if valid, false otherwise.
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
function verifySecret(req) {
  const secret = process.env.IMP_API_SECRET;
  if (!secret) {
    // Misconfigured server — fail closed (deny all)
    console.error('[AUTH] IMP_API_SECRET env variable is not set — denying request');
    return false;
  }
  const provided = req.headers['x-imp-secret'];
  if (!provided) return false;
  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(secret, provided);
}

/**
 * Constant-time string comparison.
 * Prevents timing side-channel attacks on secret comparison.
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Still compare to avoid length-based timing leak
    let diff = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      diff |= (a.charCodeAt(i % a.length) ^ b.charCodeAt(i % b.length));
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return diff === 0;
}

/**
 * Simple in-memory rate limiter.
 * Allows maxRequests per windowMs per IP.
 * Note: resets on cold start (Vercel serverless).
 * For production-grade limiting use Upstash Redis.
 */
const rateLimitStore = new Map();

function rateLimit(req, res, { maxRequests = 10, windowMs = 60_000 } = {}) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  const now = Date.now();
  const entry = rateLimitStore.get(ip) || { count: 0, resetAt: now + windowMs };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  entry.count++;
  rateLimitStore.set(ip, entry);

  // Clean up old entries periodically
  if (rateLimitStore.size > 500) {
    for (const [key, val] of rateLimitStore) {
      if (now > val.resetAt) rateLimitStore.delete(key);
    }
  }

  if (entry.count > maxRequests) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    res.status(429).json({ error: 'Too many requests — slow down.' });
    return false;
  }

  return true;
}

module.exports = { verifySecret, rateLimit };
