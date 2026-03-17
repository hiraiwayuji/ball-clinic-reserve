import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, MapPin, Phone } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              B
            </div>
            <span className="text-xl font-bold text-slate-900">ボール接骨院</span>
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-600">
            <Link href="#about" className="hover:text-blue-600 transition">当院について</Link>
            <Link href="#services" className="hover:text-blue-600 transition">施術メニュー</Link>
            <a href="https://maps.app.goo.gl/y8zBCQGFiWgS4SXv6" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition">アクセス</a>
          </nav>
          <Button asChild className="bg-blue-600 hover:bg-blue-700">
            <Link href="/reserve/calendar">Web予約</Link>
          </Button>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative bg-blue-900 text-white py-24 px-4 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-900 to-blue-800 opacity-90"></div>
          {/* 装飾用の背景パターン */}
          <div className="absolute inset-0 pattern-dots text-white/[0.05] pointer-events-none"></div>
          
          <div className="container mx-auto relative z-10 max-w-4xl text-center">
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
              痛み根本改善、<br className="md:hidden" />
              <span className="text-blue-300">パフォーマンス向上</span>をサポート
            </h1>
            <p className="text-lg md:text-xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
              プロスポーツ経験のある院長が、一人ひとりの身体の状態に合わせた最適なトータルボディケアを提供します。
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-white text-blue-900 hover:bg-blue-50 text-lg h-14 px-8 shadow-lg">
                <Link href="/reserve/calendar">
                  <CalendarDays className="mr-2 h-5 w-5" />
                  今すぐWeb予約する
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white/10 hover:text-white text-lg h-14 px-8">
                <Link href="tel:088-635-5344">
                  <Phone className="mr-2 h-5 w-5" />
                  088-635-5344
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Info Section */}
        <section className="py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Box 1 */}
              <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm transition-transform hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold mb-2">営業時間</h3>
                <p className="text-slate-600 text-sm">
                  月・火・木・金: 12:00 ～ 23:00 (最終受付 22:30)<br />
                  土: 10:00 ～ 18:00 (最終受付 17:30)<br />
                  <span className="text-red-500 font-medium">※水・日・祝日は休診</span>
                </p>
              </div>

              {/* Box 2 */}
              <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm transition-transform hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                  <MapPin className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold mb-2">アクセス</h3>
                <p className="text-slate-600 text-sm">
                  徳島県板野郡藍住町<br />
                  駐車場5台完備<br />
                  <a href="https://maps.app.goo.gl/y8zBCQGFiWgS4SXv6" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline mt-1 inline-block">詳細な地図を見る</a>
                </p>
              </div>

              {/* Box 3 */}
              <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm transition-transform hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                  <CalendarDays className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold mb-2">予約について</h3>
                <p className="text-slate-600 text-sm">
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
      <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-slate-300 text-xs font-bold">
              B
            </div>
            <span className="text-lg font-bold text-slate-200">ボール接骨院</span>
          </div>
          <p className="text-sm mb-4">身体の痛み・違和感でお悩みの方、パフォーマンスを向上させたい方はお気軽にご相談ください。</p>
          <p className="text-xs">&copy; {new Date().getFullYear()} ボール接骨院. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
