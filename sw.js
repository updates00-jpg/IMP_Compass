self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || '🚨 IMP ALARM';
  const options = {
    body: data.body || 'Alarm triggered',
    icon: '/IMP_Compass/icon-192.png',
    badge: '/IMP_Compass/icon-192.png',
    tag: 'imp-alarm',
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 500],
    data: { url: data.url || '/IMP_Compass/', lat: data.lat, lng: data.lng }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const lat = event.notification.data.lat;
  const lng = event.notification.data.lng;
  const target = lat && lng
    ? `https://maps.google.com/?q=${lat},${lng}`
    : event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) {
        if (client.url.includes('IMP_Compass') && 'focus' in client)
          return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
