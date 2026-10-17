// NUB Academy service worker: shows Web Push notifications and opens the right page on click.
// Registered from /notifications/preferences when a user turns push on.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "NUB Academy", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "NUB Academy";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined,
      // Same tag replaces the previous alert instead of stacking (one per conversation).
      renotify: !!data.tag,
      icon: "/favicon.ico",
      data: { url: data.url || "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
