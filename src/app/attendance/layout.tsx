import StaffBackToAdmin from "@/components/StaffBackToAdmin";

/**
 * ページ側が min-h-screen を持っているので、ここでは高さを付けない。
 * ログイン時だけ上に約56pxのバーが積まれるぶん縦に伸びるが、
 * バーは sticky なのでスクロールしても「ホームに戻る」は常に見えている。
 */
export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StaffBackToAdmin />
      {children}
    </>
  );
}
