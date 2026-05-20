"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  saveCourse, deleteCourse,
  saveStaff, deleteStaff,
  saveRoom, deleteRoom,
  type ReservationCourse, type ReservationStaff, type ReservationRoom,
} from "@/app/actions/courses";
import { Plus, Trash2, GripVertical, Clock, Pencil, Check, X, User, DoorOpen, Sparkles, Tag, Star } from "lucide-react";

interface Props {
  initialCourses: ReservationCourse[];
  initialStaff: ReservationStaff[];
  initialRooms: ReservationRoom[];
}

// ── コース行 ──────────────────────────────────────────
function CourseRow({
  course,
  onSaved,
  onDeleted,
}: {
  course: ReservationCourse;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(course.name);
  const [duration, setDuration] = useState(course.duration_minutes.toString());
  const [price, setPrice] = useState(course.price?.toString() ?? "");
  const [description, setDescription] = useState(course.description ?? "");
  const [imageUrl, setImageUrl] = useState(course.image_url ?? "");
  const [isCoupon, setIsCoupon] = useState(course.is_coupon);
  const [isFirstVisitOnly, setIsFirstVisitOnly] = useState(course.is_first_visit_only);
  const [isRepeatOnly, setIsRepeatOnly] = useState(course.is_repeat_only);
  const [regularPrice, setRegularPrice] = useState(course.regular_price?.toString() ?? "");
  const [firstVisitPrice, setFirstVisitPrice] = useState(course.first_visit_price?.toString() ?? "");
  const [badgeLabel, setBadgeLabel] = useState(course.badge_label ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !duration) return;
    setSaving(true);
    const res = await saveCourse({
      id: course.id,
      name: name.trim(),
      duration_minutes: Number(duration),
      price: price ? Number(price) : null,
      description: description || null,
      is_active: course.is_active,
      sort_order: course.sort_order,
      image_url: imageUrl.trim() || null,
      is_coupon: isCoupon,
      is_first_visit_only: isFirstVisitOnly,
      is_repeat_only: isRepeatOnly,
      regular_price: regularPrice ? Number(regularPrice) : null,
      first_visit_price: firstVisitPrice ? Number(firstVisitPrice) : null,
      badge_label: badgeLabel.trim() || null,
    });
    setSaving(false);
    if (res.success) {
      toast.success("コースを保存しました");
      setEditing(false);
      onSaved();
    } else {
      toast.error(res.error ?? "保存に失敗しました");
    }
  };

  const handleToggleActive = async () => {
    await saveCourse({ ...course, is_active: !course.is_active });
    onSaved();
  };

  const handleDelete = async () => {
    if (!confirm(`「${course.name}」を削除しますか？`)) return;
    const res = await deleteCourse(course.id);
    if (res.success) {
      toast.success("削除しました");
      onDeleted();
    } else {
      toast.error(res.error ?? "削除に失敗しました");
    }
  };

  if (editing) {
    return (
      <div className="border rounded-xl p-3 bg-blue-50 border-blue-200 dark:bg-slate-900 dark:border-slate-700 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-slate-600 dark:text-slate-300">コース名 *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9 mt-1" placeholder="例: 初診コース" />
          </div>
          <div>
            <Label className="text-xs text-slate-600 dark:text-slate-300">所要時間（分） *</Label>
            <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} className="h-9 mt-1" min={10} step={5} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-slate-600 dark:text-slate-300">料金（円）</Label>
            <Input type="number" value={price} onChange={e => setPrice(e.target.value)} className="h-9 mt-1" placeholder="未設定可" />
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">再診時の通常価格</p>
          </div>
          <div>
            <Label className="text-xs text-slate-600 dark:text-slate-300">初診時価格（円）</Label>
            <Input
              type="number"
              value={firstVisitPrice}
              onChange={e => setFirstVisitPrice(e.target.value)}
              className="h-9 mt-1"
              placeholder="未設定なら料金と同額"
            />
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">初診の時はこちらが売上元情報に</p>
          </div>
        </div>
        <div>
          <Label className="text-xs text-slate-600 dark:text-slate-300">通常価格（円）</Label>
          <Input
            type="number"
            value={regularPrice}
            onChange={e => setRegularPrice(e.target.value)}
            className="h-9 mt-1"
            placeholder="例: 9000（割引前・LPで取り消し線表示）"
          />
        </div>
        <div>
          <Label className="text-xs text-slate-600 dark:text-slate-300">説明</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} className="h-9 mt-1" placeholder="患者向け説明文" />
        </div>

        {/* メニューLP用フィールド */}
        <div className="border-t border-blue-200 dark:border-slate-700 pt-2 mt-2 space-y-2">
          <p className="text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            メニューLP表示設定（任意）
          </p>
          <div>
            <Label className="text-xs text-slate-600 dark:text-slate-300">写真URL</Label>
            <Input
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              className="h-9 mt-1"
              placeholder="https://... （Supabase Storage または外部URL）"
            />
            {imageUrl && (
              <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden border bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="プレビュー" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
              <Star className="w-3 h-3" />バッジラベル
            </Label>
            <Input
              value={badgeLabel}
              onChange={e => setBadgeLabel(e.target.value)}
              className="h-9 mt-1"
              placeholder="例: 人気No.1 / 期間限定"
            />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={isCoupon}
                onChange={e => setIsCoupon(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <Tag className="w-3.5 h-3.5 text-amber-500" />
              クーポンとして公開する（メニューLPのクーポンタブに表示）
            </label>
            <div className="flex flex-col gap-1 pl-1">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">対象区分（どちらか一方のみ。両方OFFなら全員）</p>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFirstVisitOnly}
                  onChange={e => {
                    setIsFirstVisitOnly(e.target.checked);
                    if (e.target.checked) setIsRepeatOnly(false);
                  }}
                  className="w-4 h-4 accent-rose-500"
                />
                新規患者限定
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRepeatOnly}
                  onChange={e => {
                    setIsRepeatOnly(e.target.checked);
                    if (e.target.checked) setIsFirstVisitOnly(false);
                  }}
                  className="w-4 h-4 accent-purple-500"
                />
                再来（2回目以降）限定
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            <X className="w-3.5 h-3.5 mr-1" /> キャンセル
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Check className="w-3.5 h-3.5 mr-1" /> {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 transition-colors ${course.is_active ? "bg-white dark:bg-slate-800" : "bg-slate-50 dark:bg-slate-800/50 opacity-60"}`}>
      <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
      {course.image_url ? (
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={course.image_url} alt="" className="w-full h-full object-cover" />
        </div>
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 dark:text-slate-100">{course.name}</span>
          <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" />{course.duration_minutes}分
          </span>
          {course.price != null && (
            <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
              {course.regular_price != null && course.regular_price > course.price && (
                <span className="line-through text-slate-400 mr-1">¥{course.regular_price.toLocaleString()}</span>
              )}
              ¥{course.price.toLocaleString()}
            </span>
          )}
          {course.is_coupon && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
              <Tag className="w-2.5 h-2.5" />クーポン
            </span>
          )}
          {course.is_first_visit_only && (
            <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40 px-2 py-0.5 rounded-full">
              新規限定
            </span>
          )}
          {course.is_repeat_only && (
            <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full">
              再来限定
            </span>
          )}
          {course.badge_label && (
            <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">
              {course.badge_label}
            </span>
          )}
        </div>
        {course.description && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">{course.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleToggleActive}
          className={`text-xs px-2 py-1 rounded-md font-semibold transition-colors ${course.is_active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-200 text-slate-500 hover:bg-slate-300"}`}
        >
          {course.is_active ? "有効" : "無効"}
        </button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-blue-600" onClick={() => setEditing(true)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={handleDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── スタッフ行 ──────────────────────────────────────────
function StaffRow({
  staff,
  onSaved,
  onDeleted,
}: {
  staff: ReservationStaff;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(staff.name);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await saveStaff({ id: staff.id, name: name.trim(), is_active: staff.is_active, sort_order: staff.sort_order });
    setSaving(false);
    if (res.success) {
      toast.success("スタッフを保存しました");
      setEditing(false);
      onSaved();
    } else {
      toast.error(res.error ?? "保存に失敗しました");
    }
  };

  const handleToggleActive = async () => {
    await saveStaff({ ...staff, is_active: !staff.is_active });
    onSaved();
  };

  const handleDelete = async () => {
    if (!confirm(`「${staff.name}」を削除しますか？`)) return;
    const res = await deleteStaff(staff.id);
    if (res.success) {
      toast.success("削除しました");
      onDeleted();
    } else {
      toast.error(res.error ?? "削除に失敗しました");
    }
  };

  if (editing) {
    return (
      <div className="border rounded-xl p-3 bg-blue-50 border-blue-200 flex items-center gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} className="h-9 flex-1" placeholder="スタッフ名" />
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
          <X className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Check className="w-3.5 h-3.5 mr-1" />{saving ? "保存中..." : "保存"}
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 transition-colors ${staff.is_active ? "bg-white dark:bg-slate-800" : "bg-slate-50 dark:bg-slate-800/50 opacity-60"}`}>
      <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
      <User className="w-4 h-4 text-slate-400 shrink-0" />
      <span className="font-semibold text-slate-800 dark:text-slate-100 flex-1">{staff.name}</span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleToggleActive}
          className={`text-xs px-2 py-1 rounded-md font-semibold transition-colors ${staff.is_active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-200 text-slate-500 hover:bg-slate-300"}`}
        >
          {staff.is_active ? "有効" : "無効"}
        </button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-blue-600" onClick={() => setEditing(true)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={handleDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── 個室行 ──────────────────────────────────────────
function RoomRow({
  room,
  onSaved,
  onDeleted,
}: {
  room: ReservationRoom;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description ?? "");
  const [capacity, setCapacity] = useState(room.capacity.toString());
  const [sortOrder, setSortOrder] = useState(room.sort_order.toString());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await saveRoom({
      id: room.id,
      name: name.trim(),
      description: description || null,
      capacity: Number(capacity),
      is_active: room.is_active,
      sort_order: Number(sortOrder),
    });
    setSaving(false);
    if (res.success) {
      toast.success("個室を保存しました");
      setEditing(false);
      onSaved();
    } else {
      toast.error(res.error ?? "保存に失敗しました");
    }
  };

  const handleToggleActive = async () => {
    await saveRoom({ ...room, is_active: !room.is_active });
    onSaved();
  };

  const handleDelete = async () => {
    if (!confirm(`「${room.name}」を削除しますか？`)) return;
    const res = await deleteRoom(room.id);
    if (res.success) {
      toast.success("削除しました");
      onDeleted();
    } else {
      toast.error(res.error ?? "削除に失敗しました");
    }
  };

  if (editing) {
    return (
      <div className="border rounded-xl p-3 bg-blue-50 border-blue-200 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-slate-600">個室名 *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-9 mt-1" placeholder="例: 第1施術室" />
          </div>
          <div>
            <Label className="text-xs text-slate-600">定員</Label>
            <Input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} className="h-9 mt-1" min={1} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-slate-600">説明</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} className="h-9 mt-1" placeholder="患者向け説明文" />
          </div>
          <div>
            <Label className="text-xs text-slate-600">並び順</Label>
            <Input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="h-9 mt-1" min={0} />
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            <X className="w-3.5 h-3.5 mr-1" /> キャンセル
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Check className="w-3.5 h-3.5 mr-1" /> {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 transition-colors ${room.is_active ? "bg-white dark:bg-slate-800" : "bg-slate-50 dark:bg-slate-800/50 opacity-60"}`}>
      <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
      <DoorOpen className="w-4 h-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 dark:text-slate-100">{room.name}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
            定員 {room.capacity}名
          </span>
        </div>
        {room.description && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">{room.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleToggleActive}
          className={`text-xs px-2 py-1 rounded-md font-semibold transition-colors ${room.is_active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-200 text-slate-500 hover:bg-slate-300"}`}
        >
          {room.is_active ? "有効" : "無効"}
        </button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-blue-600" onClick={() => setEditing(true)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={handleDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────
export default function CourseStaffSettings({ initialCourses, initialStaff, initialRooms }: Props) {
  const [courses, setCourses] = useState<ReservationCourse[]>(initialCourses);
  const [staff, setStaff] = useState<ReservationStaff[]>(initialStaff);
  const [rooms, setRooms] = useState<ReservationRoom[]>(initialRooms);

  const [addingCourse, setAddingCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseDuration, setNewCourseDuration] = useState("30");
  const [newCoursePrice, setNewCoursePrice] = useState("");
  const [newCourseDesc, setNewCourseDesc] = useState("");
  const [newCourseImageUrl, setNewCourseImageUrl] = useState("");
  const [newCourseIsCoupon, setNewCourseIsCoupon] = useState(false);
  const [newCourseIsFirstVisitOnly, setNewCourseIsFirstVisitOnly] = useState(false);
  const [newCourseIsRepeatOnly, setNewCourseIsRepeatOnly] = useState(false);
  const [newCourseRegularPrice, setNewCourseRegularPrice] = useState("");
  const [newCourseFirstVisitPrice, setNewCourseFirstVisitPrice] = useState("");
  const [newCourseBadge, setNewCourseBadge] = useState("");
  const [savingCourse, setSavingCourse] = useState(false);

  const [addingStaff, setAddingStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);

  const [addingRoom, setAddingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");
  const [newRoomCapacity, setNewRoomCapacity] = useState("1");
  const [newRoomSortOrder, setNewRoomSortOrder] = useState("0");
  const [savingRoom, setSavingRoom] = useState(false);

  const refreshCourses = async () => {
    const res = await fetch("/api/admin/courses");
    if (res.ok) setCourses(await res.json());
    else window.location.reload();
  };

  const refreshStaff = async () => {
    const res = await fetch("/api/admin/staff");
    if (res.ok) setStaff(await res.json());
    else window.location.reload();
  };

  const handleAddCourse = async () => {
    if (!newCourseName.trim() || !newCourseDuration) return;
    setSavingCourse(true);
    const res = await saveCourse({
      name: newCourseName.trim(),
      duration_minutes: Number(newCourseDuration),
      price: newCoursePrice ? Number(newCoursePrice) : null,
      description: newCourseDesc || null,
      sort_order: courses.length,
      image_url: newCourseImageUrl.trim() || null,
      is_coupon: newCourseIsCoupon,
      is_first_visit_only: newCourseIsFirstVisitOnly,
      is_repeat_only: newCourseIsRepeatOnly,
      regular_price: newCourseRegularPrice ? Number(newCourseRegularPrice) : null,
      first_visit_price: newCourseFirstVisitPrice ? Number(newCourseFirstVisitPrice) : null,
      badge_label: newCourseBadge.trim() || null,
    });
    setSavingCourse(false);
    if (res.success) {
      toast.success("コースを追加しました");
      setAddingCourse(false);
      setNewCourseName("");
      setNewCourseDuration("30");
      setNewCoursePrice("");
      setNewCourseDesc("");
      setNewCourseImageUrl("");
      setNewCourseIsCoupon(false);
      setNewCourseIsFirstVisitOnly(false);
      setNewCourseIsRepeatOnly(false);
      setNewCourseRegularPrice("");
      setNewCourseFirstVisitPrice("");
      setNewCourseBadge("");
      window.location.reload();
    } else {
      toast.error(res.error ?? "追加に失敗しました");
    }
  };

  const handleAddStaff = async () => {
    if (!newStaffName.trim()) return;
    setSavingStaff(true);
    const res = await saveStaff({ name: newStaffName.trim(), sort_order: staff.length });
    setSavingStaff(false);
    if (res.success) {
      toast.success("スタッフを追加しました");
      setAddingStaff(false);
      setNewStaffName("");
      window.location.reload();
    } else {
      toast.error(res.error ?? "追加に失敗しました");
    }
  };

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) return;
    setSavingRoom(true);
    const res = await saveRoom({
      name: newRoomName.trim(),
      description: newRoomDesc || null,
      capacity: Number(newRoomCapacity),
      sort_order: Number(newRoomSortOrder) || rooms.length,
    });
    setSavingRoom(false);
    if (res.success) {
      toast.success("個室を追加しました");
      setAddingRoom(false);
      setNewRoomName("");
      setNewRoomDesc("");
      setNewRoomCapacity("1");
      setNewRoomSortOrder("0");
      window.location.reload();
    } else {
      toast.error(res.error ?? "追加に失敗しました");
    }
  };

  return (
    <div className="space-y-8">
      {/* ── コース設定 ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100">施術コース設定</h3>
            <p className="text-xs text-slate-500 mt-0.5">患者さんが予約時に選択できるコースと所要時間を設定します</p>
          </div>
          <Button
            size="sm"
            onClick={() => setAddingCourse(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1" /> コースを追加
          </Button>
        </div>

        <div className="space-y-2">
          {courses.length === 0 && !addingCourse && (
            <p className="text-sm text-slate-400 text-center py-6 border rounded-xl border-dashed">
              コースが登録されていません。追加してください。
            </p>
          )}
          {courses.map(course => (
            <CourseRow
              key={course.id}
              course={course}
              onSaved={() => window.location.reload()}
              onDeleted={() => window.location.reload()}
            />
          ))}

          {addingCourse && (
            <div className="border rounded-xl p-3 bg-blue-50 border-blue-200 dark:bg-slate-900 dark:border-slate-700 space-y-2">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-300">新しいコースを追加</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-slate-600 dark:text-slate-300">コース名 *</Label>
                  <Input value={newCourseName} onChange={e => setNewCourseName(e.target.value)} className="h-9 mt-1" placeholder="例: 初診コース" autoFocus />
                </div>
                <div>
                  <Label className="text-xs text-slate-600 dark:text-slate-300">所要時間（分） *</Label>
                  <Input type="number" value={newCourseDuration} onChange={e => setNewCourseDuration(e.target.value)} className="h-9 mt-1" min={10} step={5} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-slate-600 dark:text-slate-300">料金（円）</Label>
                  <Input type="number" value={newCoursePrice} onChange={e => setNewCoursePrice(e.target.value)} className="h-9 mt-1" placeholder="未設定可" />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">再診時の通常価格</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-600 dark:text-slate-300">初診時価格（円）</Label>
                  <Input
                    type="number"
                    value={newCourseFirstVisitPrice}
                    onChange={e => setNewCourseFirstVisitPrice(e.target.value)}
                    className="h-9 mt-1"
                    placeholder="未設定なら料金と同額"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">初診の時はこちらが売上元情報に</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-600 dark:text-slate-300">通常価格（円）</Label>
                <Input
                  type="number"
                  value={newCourseRegularPrice}
                  onChange={e => setNewCourseRegularPrice(e.target.value)}
                  className="h-9 mt-1"
                  placeholder="例: 9000（割引前・LPで取り消し線表示）"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600 dark:text-slate-300">説明</Label>
                <Input value={newCourseDesc} onChange={e => setNewCourseDesc(e.target.value)} className="h-9 mt-1" placeholder="患者向け説明文" />
              </div>

              {/* メニューLP用フィールド */}
              <div className="border-t border-blue-200 dark:border-slate-700 pt-2 mt-2 space-y-2">
                <p className="text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  メニューLP表示設定（任意）
                </p>
                <div>
                  <Label className="text-xs text-slate-600 dark:text-slate-300">写真URL</Label>
                  <Input
                    value={newCourseImageUrl}
                    onChange={e => setNewCourseImageUrl(e.target.value)}
                    className="h-9 mt-1"
                    placeholder="https://... （Supabase Storage または外部URL）"
                  />
                  {newCourseImageUrl && (
                    <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden border bg-slate-100 dark:bg-slate-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={newCourseImageUrl} alt="プレビュー" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <Star className="w-3 h-3" />バッジラベル
                  </Label>
                  <Input
                    value={newCourseBadge}
                    onChange={e => setNewCourseBadge(e.target.value)}
                    className="h-9 mt-1"
                    placeholder="例: 人気No.1 / 期間限定"
                  />
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newCourseIsCoupon}
                      onChange={e => setNewCourseIsCoupon(e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <Tag className="w-3.5 h-3.5 text-amber-500" />
                    クーポンとして公開する（メニューLPのクーポンタブに表示）
                  </label>
                  <div className="flex flex-col gap-1 pl-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">対象区分（どちらか一方のみ。両方OFFなら全員）</p>
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newCourseIsFirstVisitOnly}
                        onChange={e => {
                          setNewCourseIsFirstVisitOnly(e.target.checked);
                          if (e.target.checked) setNewCourseIsRepeatOnly(false);
                        }}
                        className="w-4 h-4 accent-rose-500"
                      />
                      新規患者限定
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newCourseIsRepeatOnly}
                        onChange={e => {
                          setNewCourseIsRepeatOnly(e.target.checked);
                          if (e.target.checked) setNewCourseIsFirstVisitOnly(false);
                        }}
                        className="w-4 h-4 accent-purple-500"
                      />
                      再来（2回目以降）限定
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button size="sm" variant="outline" onClick={() => setAddingCourse(false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> キャンセル
                </Button>
                <Button size="sm" onClick={handleAddCourse} disabled={savingCourse} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-3.5 h-3.5 mr-1" />{savingCourse ? "追加中..." : "追加する"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── スタッフ（指名）設定 ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100">スタッフ指名設定</h3>
            <p className="text-xs text-slate-500 mt-0.5">患者さんが予約時に指名できるスタッフを設定します（任意）</p>
          </div>
          <Button
            size="sm"
            onClick={() => setAddingStaff(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1" /> スタッフを追加
          </Button>
        </div>

        <div className="space-y-2">
          {staff.length === 0 && !addingStaff && (
            <p className="text-sm text-slate-400 text-center py-6 border rounded-xl border-dashed">
              スタッフが登録されていません。指名機能を使う場合は追加してください。
            </p>
          )}
          {staff.map(s => (
            <StaffRow
              key={s.id}
              staff={s}
              onSaved={() => window.location.reload()}
              onDeleted={() => window.location.reload()}
            />
          ))}

          {addingStaff && (
            <div className="border rounded-xl p-3 bg-blue-50 border-blue-200 flex items-center gap-2">
              <Input value={newStaffName} onChange={e => setNewStaffName(e.target.value)} className="h-9 flex-1" placeholder="スタッフ名（例: 院長 平岩）" autoFocus />
              <Button size="sm" variant="outline" onClick={() => setAddingStaff(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" onClick={handleAddStaff} disabled={savingStaff} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-3.5 h-3.5 mr-1" />{savingStaff ? "追加中..." : "追加"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── 個室設定 ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100">個室設定</h3>
            <p className="text-xs text-slate-500 mt-0.5">患者さんが予約時に希望できる個室を設定します（任意）</p>
          </div>
          <Button
            size="sm"
            onClick={() => setAddingRoom(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1" /> 個室を追加
          </Button>
        </div>

        <div className="space-y-2">
          {rooms.length === 0 && !addingRoom && (
            <p className="text-sm text-slate-400 text-center py-6 border rounded-xl border-dashed">
              個室が登録されていません。個室指定機能を使う場合は追加してください。
            </p>
          )}
          {rooms.map(room => (
            <RoomRow
              key={room.id}
              room={room}
              onSaved={() => window.location.reload()}
              onDeleted={() => window.location.reload()}
            />
          ))}

          {addingRoom && (
            <div className="border rounded-xl p-3 bg-blue-50 border-blue-200 space-y-2">
              <p className="text-xs font-bold text-blue-700">新しい個室を追加</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-slate-600">個室名 *</Label>
                  <Input value={newRoomName} onChange={e => setNewRoomName(e.target.value)} className="h-9 mt-1" placeholder="例: 第1施術室" autoFocus />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">定員</Label>
                  <Input type="number" value={newRoomCapacity} onChange={e => setNewRoomCapacity(e.target.value)} className="h-9 mt-1" min={1} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-slate-600">説明</Label>
                  <Input value={newRoomDesc} onChange={e => setNewRoomDesc(e.target.value)} className="h-9 mt-1" placeholder="患者向け説明文" />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">並び順</Label>
                  <Input type="number" value={newRoomSortOrder} onChange={e => setNewRoomSortOrder(e.target.value)} className="h-9 mt-1" min={0} />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button size="sm" variant="outline" onClick={() => setAddingRoom(false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> キャンセル
                </Button>
                <Button size="sm" onClick={handleAddRoom} disabled={savingRoom} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-3.5 h-3.5 mr-1" />{savingRoom ? "追加中..." : "追加する"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
