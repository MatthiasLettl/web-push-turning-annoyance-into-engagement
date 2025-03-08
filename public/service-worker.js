self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const { title, description } = data;
  const options = {
    body: description,
    icon: "/favicon.ico",
    data,
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        let clientIsVisible = false;

        for (const client of clients) {
          if (client.visibilityState === "visible") {
            clientIsVisible = true;
            client.postMessage({
              type: "SHOW_TOAST",
              ...data,
            });
            break;
          }
        }

        if (!clientIsVisible) {
          self.registration.showNotification(title, options);
        }
      })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(urlToOpen));
});
