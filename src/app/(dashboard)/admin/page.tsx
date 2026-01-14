import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { getSession } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default async function AdminPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // ADMIN만 접근 가능
  if (session.user.role !== UserRole.ADMIN) {
    redirect("/works");
  }

  return <AdminDashboard />;
}
