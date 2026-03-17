export const ADMIN_TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30",
  "23:00", "23:30"
];

export function getTimeSlots(date: Date | undefined, bypassRestrictions: boolean = false): string[] {
  if (!date) return [];
  
  if (bypassRestrictions) {
    return ADMIN_TIME_SLOTS;
  }

  const day = date.getDay();
  // 0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土
  
  // 休診日（水・日）
  if (day === 0 || day === 3) return [];

  // 土曜日: 10:00 〜 17:30 (最終受付)
  if (day === 6) {
    return [
      "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
      "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
      "16:00", "16:30", "17:00", "17:30"
    ];
  }

  // 月・火・木・金: 12:00 〜 22:30 (最終受付)
  return [
    "12:00", "12:30",
    "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
    "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
    "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
    "22:00", "22:30"
  ];
}

export function getMaxSlots(date: Date): number {
  const day = date.getDay();
  if (day === 0 || day === 3) return 0; // 水・日 休診
  if (day === 6) return 16; // 土曜日: 16枠
  return 22; // 月・火・木・金: 22枠
}

export function isDateWithinAllowedRange(date: Date, isAdmin: boolean = false): boolean {
  if (isAdmin) return true; // 管理者は制限なし
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const limit = new Date(today);
  limit.setMonth(limit.getMonth() + 1);
  
  return date >= today && date <= limit;
}

export function isTimeSlotWithinTwoHours(dateStrOrDate: Date | string, timeStr: string, isAdmin: boolean = false): boolean {
  if (isAdmin) return false;
  
  let dateStr = "";
  if (typeof dateStrOrDate === "string") {
    dateStr = dateStrOrDate;
  } else {
    const year = dateStrOrDate.getFullYear();
    const month = String(dateStrOrDate.getMonth() + 1).padStart(2, '0');
    const day = String(dateStrOrDate.getDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  }
  
  const slotTimestamp = new Date(`${dateStr}T${timeStr}:00+09:00`).getTime();
  const cutoffTimestamp = Date.now() + 2 * 60 * 60 * 1000; // 2 hours from now
  
  return slotTimestamp < cutoffTimestamp;
}
