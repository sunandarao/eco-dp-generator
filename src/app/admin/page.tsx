import { redirect } from "next/navigation";
import { config, configStatus } from "@/lib/config";
import { db, CATEGORIES, type Participant, type PrivacyRequest, type AuditEntry } from "@/lib/db";
import { categoryLabel, computeStats, mergeByStaffId, status as rowStatus } from "@/lib/participants";
import { getAdmin } from "@/lib/security";
import { LogoutButton, RequestActions, RetentionButton } from "@/components/admin/AdminActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin dashboard – ECO DP" };

type SP = Promise<Record<string, string | undefined>>;

const STATUS_FILTERS: Record<string, string> = {
  confirmed: "WhatsApp DP updated (confirmed)",
  pending: "Downloaded - confirmation pending",
  generated: "Generated - not downloaded",
  consented: "Consented - not generated",
};

export default async function AdminPage({ searchParams }: { searchParams: SP }) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  const sp = await searchParams;

  let rows: Participant[] = [], requests: PrivacyRequest[] = [], audit: AuditEntry[] = [], dbError: string | null = null;
  try {
    [rows, requests, audit] = await Promise.all([db().listParticipants(), db().listPrivacyRequests(), db().listAudit(25)]);
  } catch (e) {
    dbError = (e as Error).message; rows = []; requests = []; audit = [];
  }
  const people = mergeByStaffId(rows); // one row per Employee/Chauffeur ID
  const s = computeStats(people);
  const cs = configStatus();

  const f = { category: sp.category || "", branch: sp.branch || "", status: sp.status || "", q: (sp.q || "").toUpperCase() };
  const filtered = people.filter((p) =>
    (!f.category || (f.category === "none" ? !p.category : p.category === f.category)) &&
    (!f.branch || (p.branch || "Not specified") === f.branch) &&
    (!f.status || rowStatus(p) === STATUS_FILTERS[f.status]) &&
    (!f.q || (p.staff_id || "").includes(f.q)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const openReqs = requests.filter((r) => r.status !== "closed").length;

  const Tile = ({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) => (
    <div className={`rounded-2xl border p-4 ${accent ? "border-eco bg-eco-soft" : "border-neutral-200 bg-white"}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold tabular-nums ${accent ? "text-eco" : ""}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
  const ok = (b: boolean) => (b ? <span className="font-bold text-green-700">✓ OK</span> : <span className="font-bold text-eco">✗ Missing</span>);
  const dt = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold"><span className="text-eco">ECO</span> Professional DP – Admin</h1>
          <p className="text-sm text-ink-muted">Signed in as {admin}. No photographs are stored or shown here.</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/admin/export" className="rounded-lg bg-eco px-3 py-2 text-sm font-bold text-white">⬇ Export CSV</a>
          <LogoutButton />
        </div>
      </header>

      {dbError && <p className="mb-4 rounded-xl border-2 border-eco bg-eco-soft p-3 text-sm">Database error: {dbError}</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Total DPs generated" value={s.peopleWithDp} sub={`${s.totalGenerations} generations incl. regenerations`} accent />
        <Tile label="Corporate employees" value={s.corporate} />
        <Tile label="CCR chauffeurs" value={s.ccr} />
        <Tile label="ETS chauffeurs" value={s.ets} sub={s.uncategorised ? `+${s.uncategorised} category not given` : undefined} />
        <Tile label="Successful downloads" value={s.totalDownloads} sub={`${s.peopleDownloaded} people`} />
        <Tile label="WhatsApp updates confirmed" value={s.whatsappConfirmed} sub="Self-confirmed by user" />
        <Tile label="Pending confirmations" value={s.pendingConfirmation} sub="Generated, not yet confirmed" />
        <Tile label="Overall completion" value={`${s.completionPct}%`} sub="Confirmed ÷ people with DP" accent />
      </section>
      <p className="mt-2 text-xs text-ink-muted">
        “Downloads” counts download/save actions started in the browser; the browser cannot report whether the file was saved.
        WhatsApp updates are confirmed by the user and are not verified technically. {s.consentedParticipants} people have given consent in total.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Branch-wise participation</h2>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left"><tr>
              {["Branch", "Consented", "DP generated", "Downloaded", "WhatsApp confirmed", "Completion"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {s.branches.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-ink-muted">No participation yet.</td></tr>}
              {s.branches.map((b) => (
                <tr key={b.branch} className="border-t">
                  <td className="px-3 py-2 font-semibold">{b.branch}</td>
                  <td className="px-3 py-2 tabular-nums">{b.participants}</td>
                  <td className="px-3 py-2 tabular-nums">{b.generated}</td>
                  <td className="px-3 py-2 tabular-nums">{b.downloaded}</td>
                  <td className="px-3 py-2 tabular-nums">{b.confirmed}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-neutral-200"><div className="h-2 rounded-full bg-eco" style={{ width: `${b.generated ? (b.confirmed / b.generated) * 100 : 0}%` }} /></div>
                      <span className="tabular-nums">{b.generated ? Math.round((b.confirmed / b.generated) * 100) : 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Participants ({filtered.length})</h2>
        <form className="mb-3 flex flex-wrap gap-2 text-sm" method="get">
          <select name="category" defaultValue={f.category} className="rounded-lg border px-2 py-2">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            <option value="none">Not specified</option>
          </select>
          <select name="branch" defaultValue={f.branch} className="rounded-lg border px-2 py-2">
            <option value="">All branches</option>
            {[...config.branches, "Not specified"].map((b) => <option key={b}>{b}</option>)}
          </select>
          <select name="status" defaultValue={f.status} className="rounded-lg border px-2 py-2">
            <option value="">All statuses</option>
            {Object.entries(STATUS_FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input name="q" defaultValue={sp.q || ""} placeholder="Employee / Chauffeur ID" className="rounded-lg border px-2 py-2" />
          <button className="rounded-lg bg-ink px-3 py-2 font-semibold text-white">Filter</button>
          <a href="/admin" className="px-2 py-2 underline">Reset</a>
        </form>
        <div className="max-h-[480px] overflow-auto rounded-2xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 text-left"><tr>
              {["ID", "Category", "Branch", "Status", "Generated", "Downloads", "Confirmed at", "Last update"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.slice(0, 500).map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{p.staff_id || <span className="text-ink-muted">anonymous</span>}</td>
                  <td className="px-3 py-2">{categoryLabel(p.category)}</td>
                  <td className="px-3 py-2">{p.branch || "—"}</td>
                  <td className="px-3 py-2">{rowStatus(p)}</td>
                  <td className="px-3 py-2 tabular-nums">{p.generated_count}</td>
                  <td className="px-3 py-2 tabular-nums">{p.download_count}</td>
                  <td className="px-3 py-2">{dt(p.whatsapp_confirmed_at)}</td>
                  <td className="px-3 py-2">{dt(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 500 && <p className="mt-1 text-xs text-ink-muted">Showing first 500 – use CSV export for the full list.</p>}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Privacy requests <span className="text-sm font-normal text-ink-muted">({openReqs} open)</span></h2>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left"><tr>{["Ref", "Type", "Message", "Contact", "Received", "Status", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {requests.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-ink-muted">No requests.</td></tr>}
              {requests.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
                  <td className="px-3 py-2">{r.request_type}</td>
                  <td className="max-w-xs whitespace-pre-wrap break-words px-3 py-2">{r.message}</td>
                  <td className="px-3 py-2">{r.contact || "—"}</td>
                  <td className="px-3 py-2">{dt(r.created_at)}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2"><RequestActions id={r.id} status={r.status} hasRecord={!!r.participant_id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 p-4 text-sm">
          <h2 className="mb-3 text-lg font-bold">System configuration</h2>
          <ul className="flex flex-col gap-1">
            <li>Official ECO logo file: {ok(cs.logo)} {!cs.logo && <span className="text-xs">→ place at public/brand/eco-logo.png</span>}</li>
            <li>Transparent watermark variant (optional): {cs.watermarkVariant ? ok(true) : <span className="text-ink-muted">not provided</span>}</li>
            <li>AI mode: <b>{cs.aiMode === "device" ? "on the phone (photos never uploaded)" : "on this server"}</b></li>
            <li>AI model files: {ok(cs.models)}</li>
            {cs.aiMode === "server" && <li>AI provider: <b>{cs.aiProvider}</b> {cs.aiProvider === "local" ? "(no third-party transfer)" : cs.externalProviderApproved ? "(approved)" : "(NOT approved – disabled)"} {ok(cs.externalOk)}</li>}
            <li>Database: <b>{cs.database}</b> {ok(cs.databaseOk)}</li>
            <li>Privacy contact: {ok(cs.privacyContact)}</li>
            <li>Scheduled deletion (CRON_SECRET): {ok(cs.cron)}</li>
            <li>Notice version: <code>{cs.noticeVersion}</code></li>
            <li className="mt-2 font-bold">Generation ready: {ok(cs.generationReady)}</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-neutral-200 p-4 text-sm">
          <h2 className="mb-3 text-lg font-bold">Retention</h2>
          <ul className="mb-3 list-disc pl-5">
            <li>Photographs / DPs: never stored{cs.aiMode === "device" ? " (never leave the phone)" : " (server memory only)"}</li>
            <li>Participation records: {config.participantRetentionDays} days after last update</li>
            <li>Consent log: {config.consentLogRetentionDays} days</li>
            <li>Closed privacy requests: {config.privacyRequestRetentionDays} days</li>
          </ul>
          <RetentionButton />
          <h3 className="mb-1 mt-4 font-bold">Recent admin activity</h3>
          <ul className="max-h-40 overflow-auto text-xs">
            {audit.map((a) => <li key={a.id}>{dt(a.created_at)} – {a.actor}: {a.action}{a.detail ? ` (${a.detail})` : ""}</li>)}
          </ul>
        </div>
      </section>
    </div>
  );
}
