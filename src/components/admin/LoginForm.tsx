"use client";

import { useState } from "react";

export default function LoginForm() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    const r = await fetch("/api/admin/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: f.get("username"), password: f.get("password") }),
    });
    setBusy(false);
    if (r.ok) window.location.href = "/admin";
    else setErr(r.status === 429 ? "Too many attempts. Try again in 15 minutes." : "Invalid username or password.");
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input name="username" className="field" placeholder="Username" autoComplete="username" required />
      <input name="password" type="password" className="field" placeholder="Password" autoComplete="current-password" required />
      <button className="btn-primary" disabled={busy}>Sign in</button>
      {err && <p role="alert" className="font-semibold text-eco">{err}</p>}
    </form>
  );
}
