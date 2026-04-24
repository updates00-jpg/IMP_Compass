
const { put, get, list } = require('@vercel/blob');

const ROSTER_KEY = 'imp-roster.json';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — fetch current roster
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: ROSTER_KEY, token: process.env.BLOB_READ_WRITE_TOKEN });
      if (!blobs.length) return res.status(200).json({ roster: {}, week: null });

      // Get latest blob
      const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
      const response = await fetch(latest.url);
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('GET error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — save roster
  if (req.method === 'POST') {
    try {
      const { roster, week } = req.body;
      const data = JSON.stringify({ roster, week, updatedAt: new Date().toISOString() });
      const blob = new Blob([data], { type: 'application/json' });

      await put(ROSTER_KEY, blob, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: false,
      });

      // Notify via Pusher
      try {
        const Pusher = require('pusher');
        const pusher = new Pusher({
          appId: process.env.PUSHER_APP_ID,
          key: process.env.PUSHER_KEY,
          secret: process.env.PUSHER_SECRET,
          cluster: process.env.PUSHER_CLUSTER,
          useTLS: true,
        });
        await pusher.trigger('imp-compass', 'roster-update', { week, updatedAt: new Date().toISOString() });
      } catch (e) {
        console.warn('Pusher notify failed:', e.message);
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('POST error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
