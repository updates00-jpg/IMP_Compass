const webpush = require('web-push');

webpush.setVapidDetails(
  'mailto:imp-compass@eufor.int',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

if (!global.subscriptions) global.subscriptions = {};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, lat, lng, timestamp, message, type } = req.body;

  const isAlarm = type !== 'all-clear';

  const payload = JSON.stringify({
    title: isAlarm ? `🚨 ALARM — ${userId}` : `✅ ALL CLEAR — ${userId}`,
    body: isAlarm
      ? `${timestamp}${message ? ' · ' + message : ''}${lat ? ' · Location available' : ' · No GPS'}`
      : `Situation resolved · ${timestamp}`,
    lat: lat || null,
    lng: lng || null,
    url: 'https://updates00-jpg.github.io/IMP_Compass/'
  });

  const subs = Object.entries(global.subscriptions);
  console.log(`Sending push to ${subs.length} subscribers`);

  const results = await Promise.allSettled(
    subs.map(([uid, sub]) =>
      webpush.sendNotification(sub, payload).catch(err => {
        // Remove expired subscriptions
        if (err.statusCode === 410) {
          delete global.subscriptions[uid];
        }
        throw err;
      })
    )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  return res.status(200).json({ ok: true, sent, failed });
};
