// api/send-push.js — Firebase FCM push notification sender
// Vercel serverless function

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin (once)
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

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, userId, message, lat, lng, timestamp } = req.body;

    const isAlarm = type === 'alarm';
    const title = isAlarm
      ? `🚨 ALARM — ${userId || 'IMP'}`
      : `IMP Compass — ${userId || 'System'}`;
    const body = message || (isAlarm ? 'Emergency alert activated' : 'All clear');

    // Get all FCM tokens from Firestore
    const db = getFirestore();
    const tokensSnapshot = await db.collection('fcm_tokens').get();
    const tokens = [];
    tokensSnapshot.forEach(doc => {
      const token = doc.data().token;
      if (token) tokens.push(token);
    });

    if (tokens.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'No subscribers' });
    }

    // Send to all tokens in batches of 500 (FCM limit)
    const messaging = getMessaging();
    const batchSize = 500;
    let totalSent = 0;
    let failedTokens = [];

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);

      const multicastMessage = {
        tokens: batch,
        notification: {
          title,
          body
        },
        data: {
          type: type || 'notification',
          userId: userId || '',
          message: message || '',
          lat: lat ? String(lat) : '',
          lng: lng ? String(lng) : '',
          timestamp: timestamp || new Date().toISOString()
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'alarm',
            channelId: isAlarm ? 'imp_alarm' : 'imp_general',
            priority: 'max',
            visibility: 'public'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: isAlarm ? 'alarm.mp3' : 'default',
              'content-available': 1,
              badge: 1,
              category: isAlarm ? 'ALARM' : 'NOTIFICATION'
            }
          },
          headers: {
            'apns-priority': '10'
          }
        },
        webpush: {
          headers: {
            Urgency: isAlarm ? 'high' : 'normal'
          },
          notification: {
            title,
            body,
            icon: '/IMP_Compass/icon-192.png',
            badge: '/IMP_Compass/icon-192.png',
            requireInteraction: isAlarm,
            vibrate: isAlarm ? [500, 200, 500, 200, 500] : [200, 100, 200]
          },
          data: {
            type: type || 'notification',
            userId: userId || '',
            lat: lat ? String(lat) : '',
            lng: lng ? String(lng) : ''
          }
        }
      };

      const response = await messaging.sendEachForMulticast(multicastMessage);
      totalSent += response.successCount;

      // Collect failed tokens for cleanup
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code;
          if (code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered') {
            failedTokens.push(batch[idx]);
          }
        }
      });
    }

    // Clean up invalid tokens
    if (failedTokens.length > 0) {
      const cleanupBatch = db.batch();
      const snap = await db.collection('fcm_tokens').get();
      snap.forEach(doc => {
        if (failedTokens.includes(doc.data().token)) {
          cleanupBatch.delete(doc.ref);
        }
      });
      await cleanupBatch.commit();
    }

    return res.status(200).json({
      success: true,
      sent: totalSent,
      total: tokens.length,
      failed: failedTokens.length
    });

  } catch (err) {
    console.error('FCM send error:', err);
    return res.status(500).json({ error: err.message });
  }
};
