const { put, list, del } = require('@vercel/blob');

const ROSTER_KEY = 'imp-roster.json';
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: ROSTER_KEY, token: TOKEN });
      if (!blobs || !blobs.length) {
        return res.status(200).json({ roster: {}, week: null });
      }
      const latest = blobs[0];
      const response = await fetch(latest.url);
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('GET error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST
  if (req.method === 'POST') {
    try {
      const { roster, week } = req.body;
      if (!roster) return res.status(400).json({ error: 'Missing roster' });

      const payload = JSON.stringify({
        roster,
        week,
        updatedAt: new Date().toISOString()
      });

      // Delete old blob first
      try {
        const { blobs } = await list({ prefix: ROSTER_KEY, token: TOKEN });
        for (const b of blobs) await del(b.url, { token: TOKEN });
      } catch(e) {
        console.warn('Delete old blob failed:', e.message);
      }

      // Save new blob
      const { url } = await put(ROSTER_KEY, payload, {
        access: 'public',
        token: TOKEN,
        addRandomSuffix: false,
        contentType: 'application/json',
      });

      console.log('Roster saved to:', url);

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
        await pusher.trigger('imp-compass', 'roster-update', {
          week,
          updatedAt: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Pusher notify failed:', e.message);
      }

      return res.status(200).json({ ok: true, url });
    } catch (err) {
      console.error('POST error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
