// CRM service worker: shows reminders and alerts on the phone when the app is closed.
// Pushes carry no data; we fetch the newest notification for the signed-in person.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let item = null;
    try {
      const r = await fetch('/api/admin/notifications/latest', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (r.ok) item = (await r.json()).item;
    } catch {}
    const title = item?.title || 'Vertical Solar';
    const link = (item?.link || '/admin/#/').startsWith('/admin') ? item?.link || '/admin/#/' : `/admin/${(item?.link || '#/').replace(/^\/?/, '')}`;
    await self.registration.showNotification(title, {
      body: item?.body || 'You have a new update. Tap to open.',
      icon: '/assets/img/icon-192.png', badge: '/assets/img/favicon-32.png',
      tag: item ? `vs-${item.id}` : 'vs-update', renotify: true,
      requireInteraction: item?.type === 'danger' || item?.type === 'warning',
      data: { link },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/admin/#/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => c.url.includes('/admin'));
    if (open) { await open.focus(); return open.navigate(url).catch(() => {}); }
    return self.clients.openWindow(url);
  })());
});
