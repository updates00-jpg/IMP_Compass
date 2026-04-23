// In-memory store (resets on cold start)
// For production use a database (e.g. Vercel KV)
if (!global.subscriptions) global.subscriptions = {};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — return count (for debug)
  if (req.method === 'GET') {
    return res.status(200).json({
      count: Object.keys(global.subscriptions).length,
      users: Object.keys(global.subscriptions)
    });
  }

  // DELETE — remove subscription
  if (req.method === 'DELETE') {
    const { userId } = req.body;
    if (userId) delete global.subscriptions[userId];
    return res.status(200).json({ ok: true });
  }

  // POST — save subscription
  if (req.method === 'POST') {
    const { userId, subscription } = req.body;
    if (!userId || !subscription) {
      return res.status(400).json({ error: 'Missing userId or subscription' });
    }
    global.subscriptions[userId] = subscription;
    console.log(`Subscribed: ${userId} — total: ${Object.keys(global.subscriptions).length}`);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
