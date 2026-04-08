"use client";

import { useState, useEffect, useCallback } from "react";

type PushState = "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

export function usePushNotification(calendarId: string) {
  const [state, setState] = useState<PushState>("loading");
  const [isProcessing, setIsProcessing] = useState(false);

  // 現在の購読状態を確認
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setState(sub ? "subscribed" : "unsubscribed");
      });
    }).catch(() => setState("unsubscribed"));
  }, []);

  const subscribe = useCallback(async () => {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.error("[Push] VAPID public key not set");
      return;
    }

    setIsProcessing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId, subscription: sub.toJSON() }),
      });

      if (res.ok) {
        setState("subscribed");
      } else {
        throw new Error("Subscribe API error");
      }
    } catch (err) {
      console.error("[Push] subscribe error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [calendarId]);

  const unsubscribe = useCallback(async () => {
    setIsProcessing(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setState("unsubscribed");
        return;
      }

      // サーバー側から削除
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });

      // ブラウザ側も解除
      await sub.unsubscribe();
      setState("unsubscribed");
    } catch (err) {
      console.error("[Push] unsubscribe error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { state, isProcessing, subscribe, unsubscribe };
}
