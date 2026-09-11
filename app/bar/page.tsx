import { cookies } from "next/headers";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { BaristaLogin } from "@/components/bar/BaristaLogin";
import {
  getBaristaSessionCookieName,
  hasBaristaSession,
} from "@/lib/serverBaristaAuth";

export const dynamic = "force-dynamic";

export default async function BarPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getBaristaSessionCookieName())?.value;
  return (await hasBaristaSession(token)) ? <AdminPanel /> : <BaristaLogin />;
}
