// IMP Compass — Service Worker with Firebase FCM
// Version: 3.0.0

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDTNjvZulBljljA6CPAywo6Tyj7Vi1ubxI",
  authDomain: "imp-compass.firebaseapp.com",
  projectId: "imp-compass",
  storageBucket: "imp-compass.firebasestorage.app",
  messagingSenderId: "205813071452",
  appId: "1:205813071452:web:7ef12edfc81a89d095f099"
});

const messaging = firebase.messaging();

// Handle background push messages
messaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  const isAlarm = data.type === 'alarm';

  const notificationTitle = isAlarm
    ? `🚨 ALARM — ${data.userId || 'IMP'}`
    : payload.notification?.title || 'IMP Compass';

  const notificationOptions = {
    body: data.message || payload.notification?.body || 'IMP Compass Alert',
    icon: '/IMP_Compass/icon-192.png',
    badge: '/IMP_Compass/icon-192.png',
    tag: isAlarm ? 'imp-alarm' : 'imp-notification',
    requireInteraction: isAlarm,
    vibrate: isAlarm ? [500,200,500,200,500,200,500] : [200,100,200],
    sound: '/IMP_Compass/alarm.mp3',
    data: {
      url: self.registration.scope,
      lat: data.lat,
      lng: data.lng,
      userId: data.userId,
      type: data.type
    },
    actions: isAlarm ? [
      { action: 'open', title: '📍 Open App' },
      { action: 'dismiss', title: '✕ Dismiss' }
    ] : []
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  let url = data.url || self.registration.scope;

  if (data.lat && data.lng) {
    // Open maps for alarm with location
    url = `https://maps.google.com/?q=${data.lat},${data.lng}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      // Otherwise open new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Handle push directly (fallback for non-Firebase pushes)
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    // Firebase handles this via onBackgroundMessage above
    // This is a fallback
    if (payload.notification) {
      event.waitUntil(
        self.registration.showNotification(
          payload.notification.title || 'IMP Compass',
          {
            body: payload.notification.body || '',
            icon: '/IMP_Compass/icon-192.png',
            requireInteraction: true,
            vibrate: [500,200,500]
          }
        )
      );
    }
  } catch(e) {}
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
