/**
 * お客さま向け報告ページ（公開・ログイン不要）。
 *
 * これまで報告は Artifact で出していたが、回答がお客さまの端末に残るだけで、
 * LINEに貼り付けてもらわないと届かなかった。貼り付け作業ができない方がいるため、
 * 「送信」を押したら保存され、こちらは同じURLを開けば読める形にした（2026-09-02）。
 *
 * セキュリティ方針（training レポートと同じ）:
 *  - client_reports の RLS は authenticated 限定のまま（anon から直接は読めない）。
 *  - このページはサーバー側で service_role を使い、推測不可能な token 一致でだけ1件を取得する。
 *  - 自院（このデプロイ）のものだけを表示する。一覧・検索はできない。noindex。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClientReport } from "@/app/actions/client-report";
import ReportView from "./ReportView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ご報告",
  robots: { index: false, follow: false },
};

export default async function ClientReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getClientReport(token);
  if (!report) notFound();

  return (
    <ReportView
      token={token}
      respondent={report.respondent}
      bodyHtml={report.bodyHtml}
      initialAnswers={report.answers}
      initialAnsweredAt={report.answeredAt}
      isOpen={report.isOpen}
    />
  );
}
