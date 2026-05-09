// lib/send-push-logic.js
// Core FCM push sending logic extracted as a reusable module.
// trigger-alarm.js imports this directly instead of making an internal HTTP call,
// eliminating the extra cold-start latency and failure cascade risk.

'use strict';

const { getFirebaseAdmin } = require('./firebase-admin');

/**
 * Send FCM push notification to all registered devices.
 * @param {{ type: string, userId: string, message: string, lat: string|null, lng: string|null, timestamp: string }} payload
 * @returns {Promise<{ sent: number, total: number, failed: number }>}
 */
async function sendPushToAll(payload) {
  const { type, userId, message, lat, lng, timestamp } = payload;
  const { messaging, firestore } = getFirebaseAdmin();

  const isAlarm = type === 'alarm';
  const title = isAlarm
    ? `🚨 ALARM — ${userId || 'IMP'}`
    : `IMP Compass — ${userId || 'System'}`;
  const body = message || (isAlarm ? 'Emergency alert activated' : 'All clear');

  // Fetch all FCM tokens from Firestore
  const tokensSnapshot = await firestore.collection('fcm_tokens').get();
  const tokens = [];
  tokensSnapshot.forEach(doc => {
    const token = doc.data().token;
    if (token) tokens.push(token);
  });

  if (tokens.length === 0) {
    return { sent: 0, total: 0, failed: 0 };
  }

  const BATCH_SIZE = 500; // FCM multicast limit
  let totalSent = 0;
  const failedTokens = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);

    const multicastMessage = {
      tokens: batch,
      notification: { title, body },
      data: {
        type: type || 'notification',
        userId: userId || '',
        message: message || '',
        lat: lat ? String(lat) : '',
        lng: lng ? String(lng) : '',
        timestamp: timestamp || new Date().toISOString(),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'alarm',
          channelId: isAlarm ? 'imp_alarm' : 'imp_general',
          priority: 'max',
          visibility: 'public',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: isAlarm ? 'alarm.mp3' : 'default',
            'content-available': 1,
            badge: 1,
            category: isAlarm ? 'ALARM' : 'NOTIFICATION',
          },
        },
        headers: { 'apns-priority': '10' },
      },
      webpush: {
        headers: { Urgency: isAlarm ? 'high' : 'normal' },
        notification: {
          title,
          body,
          icon: '/IMP_Compass/icon-192.png',
          badge: '/IMP_Compass/icon-192.png',
          requireInteraction: isAlarm,
          vibrate: isAlarm ? [500, 200, 500, 200, 500] : [200, 100, 200],
        },
        data: {
          type: type || 'notification',
          userId: userId || '',
          lat: lat ? String(lat) : '',
          lng: lng ? String(lng) : '',
        },
      },
    };

    const response = await messaging.sendEachForMulticast(multicastMessage);
    totalSent += response.successCount;

    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          failedTokens.push(batch[idx]);
        }
      }
    });
  }

  // Clean up invalid tokens — use Promise.all for parallel deletes
  if (failedTokens.length > 0) {
    const snap = await firestore.collection('fcm_tokens').get();
    const deleteOps = [];
    snap.forEach(doc => {
      if (failedTokens.includes(doc.data().token)) {
        deleteOps.push(doc.ref.delete());
      }
    });
    await Promise.all(deleteOps);
  }

  return { sent: totalSent, total: tokens.length, failed: failedTokens.length };
}

module.exports = { sendPushToAll };
