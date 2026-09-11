import { cookies } from "next/headers";
import { ManagePanel } from "@/components/manage/ManagePanel";
import { AdminLogin } from "@/components/manage/AdminLogin";
import {
  getAdminSessionCookieName,
  hasAdminSession,
} from "@/lib/serverAdminAuth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAdminSessionCookieName())?.value;
  return (await hasAdminSession(token)) ? <ManagePanel /> : <AdminLogin />;
}
