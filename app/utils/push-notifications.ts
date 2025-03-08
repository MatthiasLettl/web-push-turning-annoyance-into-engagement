import { useState, useEffect } from "react";

export const VAPID_PUBLIC_KEY =
  "this_is_my_65_byte_loooooooooooooooooooooooooooooooooooooooooooooooong_vapid_public_key";

export async function subscribeToPush() {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register(
        "/service-worker.js"
      );
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      });
      const response = await fetch("/push-notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) {
        console.error("Failed to subscribe:", await response.text());
      } else {
        console.info("Successfully subscribed!");
      }
    } catch (error) {
      console.error("Error subscribing:", error);
    }
  } else {
    console.warn("Push notifications not supported in this browser.");
  }
}

// custom hook to get the current state of the browser notification permission
export function useBrowserPermission() {
  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | "unsupported" | null
  >(null);

  useEffect(() => {
    function updatePermission() {
      if ("Notification" in window) {
        setBrowserPermission(Notification.permission);
      } else {
        setBrowserPermission("unsupported");
      }
    }

    updatePermission();

    if ("navigator" in window && "permissions" in navigator) {
      navigator.permissions.query({ name: "notifications" }).then((status) => {
        status.onchange = updatePermission;
      });
    } else {
      window.addEventListener("focus", updatePermission);
      return () => window.removeEventListener("focus", updatePermission);
    }
  }, []);

  return browserPermission;
}
