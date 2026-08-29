import StaffBackToAdmin from "@/components/StaffBackToAdmin";

/** ページ側が min-h-screen を持っているので、ここでは高さを足さない（二重スクロール防止） */
export default function ShiftRequestLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StaffBackToAdmin />
      {children}
    </>
  );
}
