// IMP Compass — Service Worker
// Version: 3.1.0
//
// SECURITY NOTE — Firebase config in this file:
// The Firebase Web API key in a Service Worker cannot be hidden — SW files must be
// static and are always served in plaintext. This is by design for Web Push.
// The key is protected by Firebase Security Rules (Firestore: deny all direct access)
// and Firebase App Check should be enabled in the Firebase Console.
//
// DO NOT put server-side secrets (Firebase Admin, Pusher secret, Supabase service key)
// in this file or in index.html. Those belong in Vercel Environment Variables only.

'use strict';

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDTNjvZulBljljA6CPAywo6Tyj7Vi1ubxI',
  authDomain: 'imp-compass.firebaseapp.com',
  projectId: 'imp-compass',
  storageBucket: 'imp-compass.firebasestorage.app',
  messagingSenderId: '205813071452',
  appId: '1:205813071452:web:7ef12edfc81a89d095f099',
});

const messaging = firebase.messaging();

// Handle background push messages (phone locked or app not in foreground)
messaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  const isAlarm = data.type === 'alarm';

  const notificationTitle = isAlarm
    ? `🚨 ALARM — ${sanitise(data.userId) || 'IMP'}`
    : payload.notification?.title || 'IMP Compass';

  const notificationOptions = {
    body: sanitise(data.message) || payload.notification?.body || 'IMP Compass Alert',
    icon: '/IMP_Compass/icon-192.png',
    badge: '/IMP_Compass/icon-192.png',
    tag: isAlarm ? 'imp-alarm' : 'imp-notification',
    requireInteraction: isAlarm,
    vibrate: isAlarm ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
    data: {
      url: self.registration.scope,
      lat: data.lat,
      lng: data.lng,
      userId: sanitise(data.userId),
      type: data.type,
    },
    actions: isAlarm
      ? [
          { action: 'open', title: '📍 Open App' },
          { action: 'dismiss', title: '✕ Dismiss' },
        ]
      : [],
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  let url = data.url || self.registration.scope;

  // Only open maps if we have valid-looking coords
  if (data.lat && data.lng && isFinite(data.lat) && isFinite(data.lng)) {
    url = `https://maps.google.com/?q=${encodeURIComponent(data.lat)},${encodeURIComponent(data.lng)}`;
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Focus existing window if available
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});

// Fallback push handler for non-Firebase messages
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    if (payload.notification) {
      event.waitUntil(
        self.registration.showNotification(
          payload.notification.title || 'IMP Compass',
          {
            body: payload.notification.body || '',
            icon: '/IMP_Compass/icon-192.png',
            requireInteraction: true,
            vibrate: [500, 200, 500],
          }
        )
      );
    }
  } catch (e) {
    console.warn('[SW] Push parse error:', e);
  }
});

// Activate immediately — take control of all clients
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// ── Helpers ───────────────────────────────────────────────────────────────────
// Basic sanitisation for values used in notification text
function sanitise(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, '').slice(0, 200);
}
