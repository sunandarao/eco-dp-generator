import { redirect } from "next/navigation";
import { adminConfigured, getAdmin } from "@/lib/security";
import LoginForm from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin login – ECO DP" };

export default async function AdminLogin() {
  if (await getAdmin()) redirect("/admin");
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-extrabold">ECO DP – Admin</h1>
      <p className="mb-6 text-sm text-ink-muted">Authorised ECO personnel only. All access is logged.</p>
      {adminConfigured() ? <LoginForm /> : (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
          Admin access is not configured. Set <code>ADMIN_USERNAME</code>, <code>ADMIN_PASSWORD_HASH</code> and{" "}
          <code>ADMIN_SESSION_SECRET</code> (run <code>npm run hash-password -- &quot;your password&quot;</code>).
        </div>
      )}
    </div>
  );
}
