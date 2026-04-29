import { requireRole } from "@/app/actions/auth";
import LineSetupClient from "./LineSetupClient";

export default async function LineSetupPage() {
  // owner のみアクセス可（LINE トークンの再発行操作はオーナーの責務）
  await requireRole(["owner"]);
  return <LineSetupClient />;
}
