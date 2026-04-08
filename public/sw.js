// ============================================================
// Service Worker for Web Push Notifications
// ボール接骨院 ファミリーカレンダー
// ============================================================

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Push 受信 → 通知を表示
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ファミリーカレンダー", body: event.data ? event.data.text() : "新しい通知があります" };
  }

  const title = data.title || "ファミリーカレンダー";
  const options = {
    body: data.body || "新しい予定が追加されました",
    icon: "/images/logo_symbol_main_white.png",
    badge: "/images/logo_symbol_main_black.png",
    data: { url: data.url || "/family" },
    vibrate: [100, 50, 100],
    tag: data.tag || "family-calendar",
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知クリック → 対象ページを開く
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/family";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/family") || client.url.includes("/calendar")) {
          client.focus();
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
