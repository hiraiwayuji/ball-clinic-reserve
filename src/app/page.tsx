import { redirect } from "next/navigation";
import { isFamilyGift, isDemo } from "@/lib/app-mode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import { CLINIC_CONFIG } from "@/lib/clinic-config";
import { getPublicClinicHours } from "@/app/actions/settings";

// NEXT_PUBLIC_CLINIC_NAME が未設定 = ボール接骨院（デフォルト）
const isDefaultClinic = !process.env.NEXT_PUBLIC_CLINIC_NAME;
const isExternalLogo = CLINIC_CONFIG.logoUrl.startsWith("http");
const isExternalLogoSmall = CLINIC_CONFIG.logoSmallUrl.startsWith("http");

export default async function Home() {
  if (isFamilyGift) redirect("/calendar");
  if (isDemo) redirect("/admin-login");

  const dbHours = await getPublicClinicHours();
  // DBに値があればDB優先、なければenv varのデフォルト値を配列に変換して使用
  const hoursLines: string[] = (dbHours.hours_lines && dbHours.hours_lines.length > 0)
    ? dbHours.hours_lines
    : [CLINIC_CONFIG.hoursLine1, ...(CLINIC_CONFIG.hoursLine2 ? [CLINIC_CONFIG.hoursLine2] : [])];
  const hoursClosed = dbHours.hours_closed || CLINIC_CONFIG.hoursClosed;

  return (
    <div className="min-h-screen bg-slate-900" data-dark-page>
      {/* Header */}
      <header className="bg-slate-900/95 backdrop-blur sticky top-0 z-50 border-b border-zinc-800">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              {CLINIC_CONFIG.hasCustomLogo ? (
                <img src={CLINIC_CONFIG.logoUrl} alt={CLINIC_CONFIG.name} className="h-10 w-auto object-contain" />
              ) : CLINIC_CONFIG.isDefaultClinic ? (
                <div className="relative w-40 h-12">
                  <Image src={CLINIC_CONFIG.logoUrl} alt={CLINIC_CONFIG.name} fill className="object-contain" />
                </div>
              ) : (
                <span className="text-lg font-bold text-white">{CLINIC_CONFIG.name}</span>
              )}
            </Link>
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-400">
            <Link href="#about" className="hover:text-white transition">当院について</Link>
            <Link href="#services" className="hover:text-white transition">施術メニュー</Link>
            <Link href="/reserve/guide" className="hover:text-white transition">予約のやり方</Link>
            <a href={CLINIC_CONFIG.mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition">アクセス</a>
          </nav>
          <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
            <Link href="/reserve/calendar">Web予約</Link>
          </Button>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white py-24 px-4 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-900/40 to-slate-900/60"></div>

          <div className="container mx-auto relative z-10 max-w-4xl text-center">
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
              {isDefaultClinic ? (
                <>
                  痛み根本改善、<br className="md:hidden" />
                  <span className="text-blue-400">パフォーマンス向上</span>をサポート
                </>
              ) : (
                CLINIC_CONFIG.catchcopy
              )}
            </h1>
            <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
              {CLINIC_CONFIG.description}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white text-lg h-14 px-8 shadow-lg">
                <Link href="/reserve/calendar">
                  <CalendarDays className="mr-2 h-5 w-5" />
                  今すぐWeb予約する
                </Link>
              </Button>
              <a href={`tel:${CLINIC_CONFIG.phone}`} className="flex items-center justify-center gap-2 border-2 border-white/30 text-white text-lg h-14 px-8 rounded-md hover:bg-white/10 transition">
                <Phone className="h-5 w-5" />
                {CLINIC_CONFIG.phone}
              </a>
              <Link href="/check" className="flex items-center justify-center gap-2 border border-white/20 text-white/70 text-sm h-10 px-6 rounded-md hover:bg-white/10 transition">
                予約を確認する
              </Link>
              <Link href="/cancel" className="flex items-center justify-center gap-2 border border-white/20 text-white/70 text-sm h-10 px-6 rounded-md hover:bg-white/10 transition">
                予約のキャンセルはこちら
              </Link>
              <Link href="/reserve/guide" className="flex items-center justify-center gap-2 border border-white/20 text-white/70 text-sm h-10 px-6 rounded-md hover:bg-white/10 transition">
                予約のやり方・LINEの送り方
              </Link>
            </div>
          </div>
        </section>

        {/* Info Section */}
        <section className="py-16 bg-slate-900">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Box 1 */}
              <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-white/5 border border-white/10 shadow-sm transition-transform hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center mb-4">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-white">営業時間</h3>
                <p className="text-slate-400 text-sm">
                  {hoursLines.map((line, i) => (
                    <span key={i}>{line}{i < hoursLines.length - 1 && <br />}</span>
                  ))}
                  {hoursClosed && <><br /><span className="text-red-400 font-medium">{hoursClosed}</span></>}
                </p>
              </div>

              {/* Box 2 */}
              <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-white/5 border border-white/10 shadow-sm transition-transform hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center mb-4">
                  <MapPin className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-white">アクセス</h3>
                <p className="text-slate-400 text-sm">
                  {CLINIC_CONFIG.address}<br />
                  <a href={CLINIC_CONFIG.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline mt-1 inline-block">詳細な地図を見る</a>
                </p>
              </div>

              {/* Box 3 */}
              <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-white/5 border border-white/10 shadow-sm transition-transform hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center mb-4">
                  <CalendarDays className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-white">予約について</h3>
                <p className="text-slate-400 text-sm">
                  当院は予約優先制です。<br />
                  24時間受付のWeb予約、<br />
                  またはお電話でご予約ください。
                </p>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 py-12 border-t border-zinc-800">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            {CLINIC_CONFIG.hasCustomLogo ? (
              <img
                src={CLINIC_CONFIG.logoSmallUrl}
                alt={CLINIC_CONFIG.name}
                className="h-10 w-auto object-contain"
              />
            ) : CLINIC_CONFIG.isDefaultClinic ? (
              <div className="relative w-8 h-8">
                <Image
                  src={CLINIC_CONFIG.logoSmallUrl}
                  alt={CLINIC_CONFIG.name}
                  fill
                  className="object-contain"
                />
              </div>
            ) : null}
            {!CLINIC_CONFIG.usesWordmarkLogo && (
              <span className="text-lg font-bold text-slate-200">{CLINIC_CONFIG.nameShort}</span>
            )}
          </div>
          <p className="text-sm mb-4">{CLINIC_CONFIG.description}</p>
          <p className="text-xs">&copy; {new Date().getFullYear()} {CLINIC_CONFIG.usesWordmarkLogo ? CLINIC_CONFIG.name : CLINIC_CONFIG.nameShort}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
