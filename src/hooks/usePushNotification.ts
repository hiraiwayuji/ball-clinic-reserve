"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type PushState = "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading";

export interface NotifyPrefs {
  memberName: string | null;
  notifyOthers: boolean;
}

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

async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export function usePushNotification(calendarId: string, prefs?: NotifyPrefs) {
  const [state, setState] = useState<PushState>("loading");
  const [isProcessing, setIsProcessing] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

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

  const subscribe = useCallback(async (overridePrefs?: NotifyPrefs) => {
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

      const activePrefs = overridePrefs ?? prefsRef.current;
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId,
          subscription: sub.toJSON(),
          memberName: activePrefs?.memberName ?? null,
          notifyOthers: activePrefs?.notifyOthers !== false,
        }),
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
      const sub = await getActiveSubscription();
      if (!sub) {
        setState("unsubscribed");
        return;
      }

      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });

      await sub.unsubscribe();
      setState("unsubscribed");
    } catch (err) {
      console.error("[Push] unsubscribe error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // 設定だけ更新（再購読なし）
  const updatePrefs = useCallback(async (newPrefs: NotifyPrefs) => {
    const sub = await getActiveSubscription();
    if (!sub) return false;
    const res = await fetch("/api/push/subscribe", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        memberName: newPrefs.memberName ?? null,
        notifyOthers: newPrefs.notifyOthers !== false,
      }),
    });
    return res.ok;
  }, []);

  return { state, isProcessing, subscribe, unsubscribe, updatePrefs };
}
