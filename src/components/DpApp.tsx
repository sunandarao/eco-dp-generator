"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dict, type Dict } from "@/lib/i18n";
import { LangButton, LangGrid, useLang } from "./LangPicker";
import { prepareImage } from "@/lib/client-image";

type Screen = "welcome" | "consent" | "declined" | "details" | "upload" | "generate" | "preview" | "success";
type Status = {
  generationReady: boolean; missing: string[]; aiMode: "device" | "server"; aiProvider: string; branches: string[];
  noticeVersion: string; privacyEmail: string | null;
};

const CATS = ["corporate", "ccr_chauffeur", "ets_chauffeur"] as const;

export default function DpApp() {
  const [lang, setLang] = useLang();
  const t = dict[lang];
  const [screen, setScreen] = useState<Screen>("welcome");
  const [status, setStatus] = useState<Status | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // optional details
  const [category, setCategory] = useState<string | null>(null);
  const [branch, setBranch] = useState("");
  const [staffId, setStaffId] = useState("");

  // photo (kept only in this browser tab's memory)
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [dpUrl, setDpUrl] = useState<string | null>(null);
  const [dpBlob, setDpBlob] = useState<Blob | null>(null);
  const [variant, setVariant] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [phase, setPhase] = useState<"idle" | "upload" | "process">("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const device = status?.aiMode === "device";
  const [confirmed, setConfirmed] = useState(false);
  const [cleared, setCleared] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
  }, []);

  const go = useCallback((s: Screen) => {
    setError(null); setScreen(s);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  // Device mode: start fetching the on-device AI as soon as the user reaches the photo step
  useEffect(() => {
    if (!device || (screen !== "upload" && screen !== "generate")) return;
    import("@/lib/device/dp").then((m) => m.loadModels()).catch(() => {});
  }, [device, screen]);

  // revoke object URLs when replaced
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  useEffect(() => () => { if (dpUrl) URL.revokeObjectURL(dpUrl); }, [dpUrl]);

  async function startFlow() {
    // If consent for the current notice already exists, skip straight to upload.
    try {
      const r = await fetch("/api/participant", { cache: "no-store" }).then((x) => x.json());
      if (r.exists && r.consented) {
        if (r.record.categoryCode) setCategory(r.record.categoryCode);
        if (r.record.branch) setBranch(r.record.branch);
        if (r.record.staffId) setStaffId(r.record.staffId);
        return go("upload");
      }
    } catch {}
    go("consent");
  }

  async function giveConsent() {
    if (!agree || !status) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/consent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ agree: true, noticeVersion: status.noticeVersion, lang }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "processing_failed");
      go("details");
    } catch (e) { setError(errKey(e)); } finally { setBusy(false); }
  }

  async function saveDetails(skip: boolean) {
    setBusy(true); setError(null);
    try {
      const body = skip ? {} : { category, branch: branch || null, staffId: staffId.trim() || null };
      const r = await fetch("/api/participant", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))).error;
        if (e === "invalid_staff_id") { setError("staff"); return; }
        throw new Error(e || "processing_failed");
      }
      go("upload");
    } catch (e) { setError(errKey(e)); } finally { setBusy(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null); setBusy(true);
    try {
      const prepared = await prepareImage(f); // decoded, orientation fixed, resized, EXIF/GPS stripped – on the phone
      setPhoto(prepared);
      setPhotoUrl(URL.createObjectURL(prepared));
      setDpUrl(null); setDpBlob(null); setVariant(0); setWarnings([]); setConfirmed(false); setCleared(false);
      go("generate");
    } catch { setError("invalid_image"); } finally { setBusy(false); }
  }

  async function generateOnPhone(v: number) {
    if (!photo) return;
    setError(null); setBusy(true); setPhase("upload"); setUploadPct(0);
    try {
      const m = await import("@/lib/device/dp");
      await m.loadModels((pct) => setUploadPct(pct));
      setPhase("process");
      await new Promise((r) => setTimeout(r, 30)); // let the progress UI paint before heavy work
      const r = await m.generateOnDevice(photo, v);
      // record that a DP was made (no image is sent)
      const ev = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "generated" }) }).catch(() => null);
      if (ev && ev.status === 403) { setBusy(false); setPhase("idle"); return go("consent"); }
      setWarnings(r.warnings);
      setDpBlob(r.blob); setDpUrl(URL.createObjectURL(r.blob)); setVariant(v);
      setBusy(false); setPhase("idle"); go("preview");
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
      setBusy(false); setPhase("idle");
      setError(code || (e instanceof Error && e.message === "model_download_failed" ? "network" : "processing_failed"));
    }
  }

  function generate(v: number) {
    if (device) return void generateOnPhone(v);
    if (!photo) return;
    setError(null); setBusy(true); setPhase("upload"); setUploadPct(0);
    const form = new FormData();
    form.append("photo", photo, "photo.jpg");
    form.append("variant", String(v));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/generate");
    xhr.responseType = "blob";
    xhr.timeout = 90_000;
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setUploadPct(Math.round((ev.loaded / ev.total) * 100)); };
    xhr.upload.onload = () => setPhase("process");
    const fail = (k: string) => { setBusy(false); setPhase("idle"); setError(k); };
    xhr.onerror = () => fail("network");
    xhr.ontimeout = () => fail("network");
    xhr.onload = async () => {
      if (xhr.status === 200) {
        const blob = xhr.response as Blob;
        try { setWarnings(JSON.parse(xhr.getResponseHeader("x-dp-meta") || "{}").warnings || []); } catch { setWarnings([]); }
        setDpBlob(blob); setDpUrl(URL.createObjectURL(blob)); setVariant(v);
        setBusy(false); setPhase("idle"); go("preview");
      } else {
        let k = "processing_failed";
        try { const j = JSON.parse(await (xhr.response as Blob).text()); k = j.reason || j.error || k; } catch {}
        if (k === "consent_required") { setBusy(false); setPhase("idle"); return go("consent"); }
        fail(k);
      }
    };
    xhr.send(form);
  }

  function download() {
    if (!dpUrl) return;
    const a = document.createElement("a");
    a.href = dpUrl; a.download = `ECO-Professional-DP-${new Date().toISOString().slice(0, 10)}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
    fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "downloaded" }) }).catch(() => {});
    if (screen === "preview") go("success");
  }

  async function share() {
    if (!dpBlob) return;
    const file = new File([dpBlob], "ECO-Professional-DP.jpg", { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "ECO DP" });
        fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "downloaded" }) }).catch(() => {});
      } catch {}
    } else download();
  }

  async function confirmWhatsapp() {
    setBusy(true);
    try {
      const r = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "whatsapp_confirmed" }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "processing_failed");
      setConfirmed(true);
    } catch (e) { setError(errKey(e)); } finally { setBusy(false); }
  }

  function clearPhoto() {
    setPhoto(null); setPhotoUrl(null); setDpUrl(null); setDpBlob(null); setCleared(true);
  }

  const canShare = typeof navigator !== "undefined" && !!navigator.canShare;
  const errText = error && error !== "staff" ? t.errors[error] || t.warnings[error] || t.errors.processing_failed : null;

  return (
    <div ref={topRef} className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between py-4">
        <button onClick={() => go("welcome")} className="flex items-center gap-2" aria-label="ECO Mobility – home">
          {status && !status.missing.includes("logo") ? (
            // Official logo file, displayed unmodified
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/brand-logo" alt="ECO Mobility" className="h-11 w-auto rounded-md" />
          ) : (
            <span className="text-lg font-extrabold tracking-widest text-eco">{t.brand}</span>
          )}
        </button>
        <LangButton lang={lang} label={t.chooseLang} onPick={setLang} />
      </header>

      {status && !status.generationReady && (
        <div role="alert" className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
          <b>{t.notReady}:</b> {status.missing.map((m) => t.missingNames[m] || m).join(", ")}.
        </div>
      )}

      <main className="flex flex-1 flex-col">
        {screen === "welcome" && (
          <section className="flex flex-1 flex-col justify-center gap-6 py-6 text-center">
            <p className="text-sm font-extrabold tracking-[0.3em] text-eco">{t.brand}</p>
            <h1 className="text-3xl font-extrabold leading-tight">{t.welcomeTitle}</h1>
            <p className="text-lg text-ink-muted">{t.welcomeSub}</p>
            <div className="mx-auto grid w-full grid-cols-3 gap-2 text-sm font-semibold text-ink">
              {["📷", "✨", "⬇️"].map((ic, i) => (
                <div key={i} className="rounded-2xl bg-eco-soft px-2 py-3">
                  <div className="text-2xl" aria-hidden>{ic}</div>
                  {t.stepsLine.split("→")[i]?.trim()}
                </div>
              ))}
            </div>
            <button className="btn-primary text-xl" onClick={startFlow}>{t.createBtn}</button>
            <p className="text-sm text-ink-muted">{t.voluntary}</p>
            <div className="text-left">
              <h2 className="mb-2 text-center text-base font-bold">🌐 {t.chooseLang}</h2>
              <LangGrid lang={lang} onPick={setLang} />
            </div>
          </section>
        )}

        {screen === "consent" && (
          <section className="flex flex-col gap-4 py-2">
            <h1 className="text-2xl font-extrabold">{t.consentTitle}</h1>
            <div className="card flex flex-col gap-3 text-[15px] leading-relaxed">
              {t.consentPoints.map(([h, body], i) => (
                <div key={h}>
                  <h2 className="font-bold text-eco">{h}</h2>
                  <p>{device && i >= 1 && i <= 3 ? [t.devHow, t.devWho, t.devKept][i - 1]
                    : i === 2 && status?.aiProvider !== "local" ? t.whoExternal : body}</p>
                </div>
              ))}
              <p className="rounded-xl bg-neutral-100 p-3 text-sm">{t.noBiometric}</p>
              {status?.privacyEmail && <p className="text-sm">✉️ <a className="text-eco underline" href={`mailto:${status.privacyEmail}`}>{status.privacyEmail}</a></p>}
              <a href="/privacy" className="text-base font-semibold text-eco underline">{t.fullNotice} →</a>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-eco/40 bg-eco-soft p-4 text-base font-semibold">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-7 w-7 shrink-0 accent-eco" />
              <span>{t.agree}</span>
            </label>
            <button className="btn-primary" disabled={!agree || busy || !status} onClick={giveConsent}>{t.continueBtn}</button>
            <button className="btn-ghost" onClick={() => go("declined")}>{t.declineBtn}</button>
          </section>
        )}

        {screen === "declined" && (
          <section className="flex flex-col gap-5 py-6">
            <h1 className="text-2xl font-extrabold">{t.declinedTitle}</h1>
            <p className="text-lg">{t.declinedText}</p>
            <WhatsappSteps t={t} />
            <button className="btn-outline" onClick={() => go("welcome")}>{t.backHome}</button>
          </section>
        )}

        {screen === "details" && (
          <section className="flex flex-col gap-4 py-2">
            <h1 className="text-2xl font-extrabold">{t.detailsTitle}</h1>
            <p className="text-ink-muted">{t.detailsSub}</p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-bold">{t.catLabel}</legend>
              {CATS.map((c) => (
                <button key={c} type="button" onClick={() => setCategory(category === c ? null : c)} aria-pressed={category === c}
                  className={`btn border-2 ${category === c ? "border-eco bg-eco text-white" : "border-neutral-300 bg-white text-ink"}`}>
                  {category === c && "✓ "}{t.cats[c]}
                </button>
              ))}
            </fieldset>
            <label className="flex flex-col gap-2 font-bold">{t.branchLabel}
              <select className="field font-normal" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">{t.branchPick}</option>
                {status?.branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 font-bold">{t.staffLabel}
              <input className="field font-normal uppercase" value={staffId} maxLength={32} autoComplete="off" inputMode="text"
                onChange={(e) => setStaffId(e.target.value)} />
              {error === "staff" && <span className="text-sm font-semibold text-eco">{t.staffInvalid}</span>}
            </label>
            <button className="btn-primary" disabled={busy} onClick={() => saveDetails(false)}>{t.next}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => saveDetails(true)}>{t.skip}</button>
          </section>
        )}

        {screen === "upload" && (
          <section className="flex flex-col gap-4 py-2">
            <h1 className="text-2xl font-extrabold">{t.uploadTitle}</h1>
            <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} />
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            <button className="btn-primary min-h-[76px] text-xl" disabled={busy} onClick={() => cameraRef.current?.click()}>
              <span aria-hidden className="text-2xl">📷</span>{t.takePhoto}
            </button>
            <button className="btn-outline min-h-[76px] text-xl" disabled={busy} onClick={() => galleryRef.current?.click()}>
              <span aria-hidden className="text-2xl">🖼️</span>{t.fromGallery}
            </button>
            <div className="card mt-2">
              <h2 className="mb-3 font-bold">{t.tipsTitle}</h2>
              <ul className="grid grid-cols-2 gap-3">
                {t.tips.map((tip, i) => (
                  <li key={i} className="flex flex-col items-center gap-1 rounded-2xl bg-neutral-50 p-3 text-center text-sm font-semibold">
                    <span className="text-3xl" aria-hidden>{["🙂", "💡", "🚫👥", "👀"][i]}</span>{tip}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {screen === "generate" && photoUrl && (
          <section className="flex flex-col gap-4 py-2">
            <h1 className="text-2xl font-extrabold">{t.genTitle}</h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="" className="mx-auto max-h-[45vh] w-auto rounded-2xl border border-neutral-200 object-contain" />
            {phase === "idle" ? (
              <>
                <button className="btn-primary text-xl" disabled={busy || (status ? !status.generationReady : false)} onClick={() => generate(0)}>✨ {t.genBtn}</button>
                <button className="btn-ghost" onClick={() => go("upload")}>{t.changePhoto}</button>
              </>
            ) : (
              <Progress t={t} phase={phase} pct={uploadPct} device={device} />
            )}
          </section>
        )}

        {screen === "preview" && dpUrl && (
          <section className="flex flex-col gap-4 py-2">
            <h1 className="text-2xl font-extrabold">{t.previewTitle}</h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dpUrl} alt={t.previewTitle} className="w-full rounded-2xl border border-neutral-200 shadow-md" />
            <div className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dpUrl} alt="" className="h-16 w-16 rounded-full border border-neutral-200" />
              <span className="text-sm font-semibold text-ink-muted">{t.whatsappLook}</span>
            </div>
            {warnings.map((w) => <p key={w} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.warnings[w]}</p>)}
            {phase === "idle" ? (
              <>
                <button className="btn-primary text-xl" onClick={download}>⬇️ {t.download}</button>
                <button className="btn-outline" disabled={busy} onClick={() => generate(variant + 1)}>🔄 {t.regenerate}</button>
                <p className="-mt-2 text-center text-xs text-ink-muted">{t.regenHint}</p>
                <button className="btn-ghost" onClick={() => go("upload")}>{t.tryAnother}</button>
              </>
            ) : <Progress t={t} phase={phase} pct={uploadPct} device={device} />}
          </section>
        )}

        {screen === "success" && (
          <section className="flex flex-col gap-4 py-2">
            <div className="text-center text-5xl" aria-hidden>✅</div>
            <h1 className="text-center text-2xl font-extrabold">{t.successTitle}</h1>
            {dpUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dpUrl} alt={t.previewTitle} className="mx-auto w-2/3 rounded-full border border-neutral-200 shadow" />
                <button className="btn-primary text-xl" onClick={download}>⬇️ {t.downloadAgain}</button>
                {canShare && <button className="btn-outline" onClick={share}>📤 {t.saveShare}</button>}
                <p className="text-center text-sm text-ink-muted">{t.longPress}</p>
              </>
            ) : cleared && <p className="rounded-xl bg-green-50 p-3 text-center font-semibold text-green-800">{t.cleared}</p>}
            <WhatsappSteps t={t} />
            {confirmed ? (
              <p className="rounded-2xl bg-green-50 p-4 text-center text-lg font-bold text-green-800">✓ {t.confirmed}</p>
            ) : (
              <button className="btn-outline" disabled={busy} onClick={confirmWhatsapp}>✓ {t.confirmBtn}</button>
            )}
            {dpUrl && <button className="btn-ghost" onClick={clearPhoto}>🗑️ {t.clearBtn}</button>}
            <button className="btn-ghost" onClick={() => go("upload")}>{t.startOver}</button>
          </section>
        )}

        {errText && <p role="alert" className="mt-4 rounded-2xl border-2 border-eco bg-eco-soft p-4 text-base font-semibold text-eco-dark">{errText}</p>}
      </main>

      <footer className="mt-8 border-t border-neutral-200 pt-4 text-center text-sm">
        <a href="/privacy" className="font-semibold text-eco underline">{t.privacyRights}</a>
      </footer>
    </div>
  );
}

function errKey(e: unknown) {
  const m = e instanceof Error ? e.message : "";
  return m && /^[a-z_]+$/.test(m) ? m : "network";
}

function Progress({ t, phase, pct, device }: { t: Dict; phase: "upload" | "process" | "idle"; pct: number; device: boolean }) {
  return (
    <div className="card flex flex-col gap-3 text-center" aria-live="polite">
      <p className="text-lg font-bold">{t.working}</p>
      <div className="h-3 w-full rounded-full bg-neutral-200">
        {phase === "upload"
          ? <div className="h-3 rounded-full bg-eco transition-all" style={{ width: `${Math.max(5, pct)}%` }} />
          : <div className="progress-indeterminate h-3 rounded-full" />}
      </div>
      <ol className="text-left text-sm">
        <li className={phase === "upload" ? "font-bold text-eco" : "text-green-700"}>{phase === "upload" ? "●" : "✓"} {device ? t.loadingAi : t.uploading}{phase === "upload" ? ` (${pct}%)` : ""}</li>
        <li className={phase === "process" ? "font-bold text-eco" : "text-ink-muted"}>{phase === "process" ? "●" : "○"} {device ? t.processingDevice : t.processing}</li>
      </ol>
      <p className="text-sm text-ink-muted">{t.pleaseWait}</p>
    </div>
  );
}

function WhatsappSteps({ t }: { t: Dict }) {
  return (
    <div className="card">
      <h2 className="mb-3 text-lg font-bold">{t.waTitle}</h2>
      <ol className="flex flex-col gap-2">
        {t.waSteps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 text-base">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-eco font-bold text-white">{i + 1}</span>{s}
          </li>
        ))}
      </ol>
    </div>
  );
}
