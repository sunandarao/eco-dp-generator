"use client";

import { useState } from "react";

async function post(url: string, body?: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

export function LogoutButton() {
  return (
    <button className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold"
      onClick={async () => { await post("/api/admin/logout"); window.location.href = "/admin/login"; }}>
      Sign out
    </button>
  );
}

export function RetentionButton() {
  const [res, setRes] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <button className="rounded-lg border-2 border-eco px-3 py-2 text-sm font-bold text-eco"
        onClick={async () => {
          if (!confirm("Run the retention job now? Records older than the configured periods will be permanently deleted.")) return;
          const r = await post("/api/admin/retention");
          setRes(r.ok ? "Deleted: " + JSON.stringify(r.data.deleted) : "Failed");
        }}>
        Run retention / deletion job now
      </button>
      {res && <p className="text-xs text-ink-muted">{res}</p>}
    </div>
  );
}

export function RequestActions({ id, status, hasRecord }: { id: string; status: string; hasRecord: boolean }) {
  const [busy, setBusy] = useState(false);
  const act = async (action: string) => {
    if (action === "erase_record" && !confirm("Permanently delete the linked participation record and close this request?")) return;
    setBusy(true);
    const r = await post("/api/admin/requests", { id, action });
    setBusy(false);
    if (r.ok) window.location.reload(); else alert("Action failed");
  };
  return (
    <div className="flex flex-wrap gap-1">
      {status !== "in_progress" && status !== "closed" && <button disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => act("in_progress")}>In progress</button>}
      {status !== "closed" && <button disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => act("closed")}>Close</button>}
      {hasRecord && status !== "closed" && <button disabled={busy} className="rounded border border-eco px-2 py-1 text-xs text-eco" onClick={() => act("erase_record")}>Erase record + close</button>}
      {status === "closed" && <button disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => act("open")}>Reopen</button>}
    </div>
  );
}
