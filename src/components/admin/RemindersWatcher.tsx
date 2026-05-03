"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  listFiredReminders,
  markReminderDone,
  markReminderFired,
  snoozeReminder,
  type ReminderRow,
} from "@/app/actions/reminders";
import { warmupReminderAudio } from "@/lib/reminder-sound";
import ReminderPopup from "./ReminderPopup";

const POLL_INTERVAL_MS = 30_000;

/**
 * 管理画面に常駐して、自院の発火対象リマインダーをポーリング → ポップアップを表示する。
 * すでに表示中のリマインダーは shownIds に保持して重複表示を抑止。
 */
export default function RemindersWatcher() {
  const [active, setActive] = useState<ReminderRow | null>(null);
  const [queue, setQueue] = useState<ReminderRow[]>([]);
  const shownIds = useRef<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // 初回ユーザージェスチャ後に AudioContext を warm up（モバイルブラウザの自動再生制限対策）
  useEffect(() => {
    const handler = () => {
      warmupReminderAudio();
      window.removeEventListener("click", handler);
      window.removeEventListener("touchstart", handler);
    };
    window.addEventListener("click", handler, { once: true });
    window.addEventListener("touchstart", handler, { once: true });
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("touchstart", handler);
    };
  }, []);

  // ポーリング
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const fired = await listFiredReminders();
        if (cancelled) return;
        // まだ表示してないやつだけキューに足す
        const fresh = fired.filter((r) => !shownIds.current.has(r.id));
        if (fresh.length > 0) {
          setQueue((prev) => [...prev, ...fresh]);
          fresh.forEach((r) => shownIds.current.add(r.id));
        }
      } catch (e) {
        // RLS/auth エラー時は静かに無視（ログインしてないページ等）
        console.warn("[RemindersWatcher] poll failed", e);
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // キューの先頭を active に
  useEffect(() => {
    if (!active && queue.length > 0) {
      const next = queue[0];
      setActive(next);
      setQueue((prev) => prev.slice(1));
      // DB 上 fired 状態に
      startTransition(async () => {
        await markReminderFired(next.id);
      });
    }
  }, [active, queue]);

  if (!active) return null;

  const handleDone = () => {
    const id = active.id;
    setActive(null);
    startTransition(async () => {
      await markReminderDone(id);
    });
  };

  const handleSnooze = (minutes: number) => {
    const id = active.id;
    setActive(null);
    // スヌーズしたら shownIds から外して再発火を許可
    shownIds.current.delete(id);
    startTransition(async () => {
      await snoozeReminder(id, minutes);
    });
  };

  const handleDismiss = () => {
    setActive(null);
    // 単に閉じただけ（fire 状態は維持） → 次のポーリングで再表示はされない（status=fired のため）
  };

  return (
    <ReminderPopup
      reminder={active}
      onDone={handleDone}
      onSnooze={handleSnooze}
      onDismiss={handleDismiss}
    />
  );
}
