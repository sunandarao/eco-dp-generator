# ECO Professional DP Generator

Mobile-first web app for ECO Mobility's **WhatsApp Professional Branding Drive**. Corporate employees, CCR
chauffeurs and ETS chauffeurs take or upload a photo, and AI turns it into a 1080×1080 professional DP: white
background, head-and-shoulders framing, and the official ECO logo as a subtle watermark behind the person.

**Journey:** Open → choose language → privacy notice and consent → (optional details) → photo → Generate →
Preview → Download → WhatsApp instructions → "I have updated my DP".

> **Not production-ready yet.** It works end to end in development (see *Testing*), but production use needs the
> items in [`docs/DPDP-COMPLIANCE.md`](docs/DPDP-COMPLIANCE.md) §3 closed: Legal/IT approval, the official logo
> file, translation review, hosting, database and a security test.

## How the AI works (and why it preserves identity)

All processing happens **on ECO's server**. Photos are not sent to any external AI company by default.

1. **On the phone:** the photo is decoded, rotated upright, resized to ≤2048 px and re-encoded. This removes
   all metadata, including GPS location, before upload.
2. **Face detection** (Ultra-Light-Fast detector, MIT, 1.2 MB ONNX) finds where faces are. It rejects photos
   with no face, more than one person, a face that is too small, too dark/bright or blurry. It does **no**
   recognition, embeddings or identity matching.
3. **Head-and-shoulders crop** centred on the face; regenerate cycles through 4 framings.
4. **AI person segmentation** (U²-Net human-seg, Apache-2.0, 176 MB ONNX) separates the person from the
   background; stray regions and other people are dropped.
5. **Identity-preserving enhancement:** one global brightness/contrast curve that preserves colour ratios
   (skin tone), plus mild sharpening. There is **no generative model**, so no new face, de-ageing, skin
   smoothing, or added suits or uniforms.
6. **Composition:** white canvas → official logo at low opacity, placed automatically where it stays visible
   inside WhatsApp's circular crop → person on top, so the logo is never over the face or body → 1080×1080 JPEG.

Generative "AI portrait" services were deliberately not used: they redraw faces, which breaks the identity
and clothing rules. An optional external matting provider (remove.bg) is included but **disabled** unless
`EXTERNAL_AI_PROVIDER_APPROVED=true`.

## Languages

English, हिंदी, বাংলা, मराठी, తెలుగు, தமிழ், ગુજરાતી, ಕನ್ನಡ, മലയാളം, ଓଡ଼ିଆ, ਪੰਜਾਬੀ, অসমীয়া. The whole
user journey and the privacy page are translated. **All non-English texts are drafts** and need native-speaker
and legal review (`src/lib/i18n/*.ts`).

## Quick start (development)

```bash
npm install
npm run models                      # downloads + checksum-verifies the 2 AI models (~177 MB)
cp /path/to/official/eco-logo.png public/brand/eco-logo.png
npm run hash-password -- "a long strong admin password"   # copy the 2 output lines into .env.local
```

`.env.local` (minimum for development):

```
ALLOW_FILE_STORE=true
ADMIN_USERNAME=ecoadmin
ADMIN_PASSWORD_HASH=scrypt:...
ADMIN_SESSION_SECRET=...
CRON_SECRET=<random string>
PRIVACY_CONTACT_EMAIL=privacy@yourdomain
```

```bash
npm run dev            # http://localhost:3000   admin: /admin
```

To test on a phone on the same Wi-Fi, use the computer's LAN IP. Note that phone camera capture and
downloads behave best over HTTPS.

## Production deployment

Step-by-step guide for the recommended **free** setup (Google Cloud Run + Supabase, both in Mumbai) is in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

**Recommended: a Docker container in an India region** (for example AWS ECS/App Runner `ap-south-1`, Azure
Central India, GCP `asia-south1`). Requirements: ≥2 vCPU, ≥2 GB RAM, HTTPS in front.

```bash
docker build -t eco-dp .
docker run -p 3000:3000 --env-file .env.production \
  -v /secure/brand:/app/public/brand:ro eco-dp
```

1. **Database:** create a Supabase project in the **Mumbai** region, run `supabase/schema.sql` in the SQL editor,
   then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
2. **Environment:** all variables are documented in `.env.example`. `NODE_ENV=production` refuses the
   development file store.
3. **Scheduled deletion:** call daily, `GET /api/cron/retention` with `Authorization: Bearer $CRON_SECRET`.
4. **Admin hardening:** set `ADMIN_IP_ALLOWLIST` to the office/VPN IPs; rotate `ADMIN_SESSION_SECRET` to revoke sessions.
5. **Logs:** the app never logs image data. Make sure the reverse proxy does not log request bodies.

**Why not Vercel serverless?** The AI runtime (onnxruntime-node) plus the 176 MB model exceeds Vercel's
250 MB function limit. The pruned container is about 290 MB plus Node.

## Credentials and external dependencies

| Item | Needed? | Notes |
|---|---|---|
| Official ECO logo file (PNG) | **Required** | `public/brand/eco-logo.png`. A transparent watermark variant is optional. |
| AI models | **Required** | Free, open licences; fetched by `npm run models` / the Docker build |
| Supabase project (or other Postgres) | **Required** for production | Service-role key, server-side only |
| Container hosting (India region) + domain + TLS | **Required** | |
| Admin username / password hash / session secret | **Required** | `npm run hash-password` |
| Cron secret + scheduler | **Required** | e.g. cloud scheduler or GitHub Actions |
| Privacy contact / Grievance Officer | **Required** | Shown in the notice |
| remove.bg API key | Optional | Only after vendor approval |

## Indicative running costs (verify current pricing)

- Container hosting (2 vCPU / 4 GB, always on): roughly **USD 30–80 / month** depending on provider.
- Supabase: free tier may suffice for the campaign; Pro is about **USD 25 / month** (needed for backups/SLA).
- Per-photo AI cost: **zero** with local models. An external provider charges per image, if it is ever enabled.
- Throughput: about 1–2.5 s per DP on 1 vCPU. `MAX_CONCURRENT_JOBS` bounds memory (about 300 MB per job).

## Testing done in development

- Pipeline on varied photos: portrait, landscape, EXIF-rotated, underexposed, low-resolution, busy
  backgrounds. Rejections for group photos (2 people and 40+), no face, blur, tiny images, and a non-image file.
- API: consent enforcement, cross-origin rejection, staff-ID validation, events, privacy request, withdrawal
  (generation refused afterwards), admin auth (wrong password, forged cookie, rate limit), CSV, cron auth,
  and a missing-logo state that blocks generation.
- Playwright on an emulated Pixel 5: full journey including rejection, regenerate, real download, confirmation,
  clearing the photo, language switching (EN/HI/TA/MR/BN), and the desktop admin dashboard.
- Verified no image files are written server-side; the data store holds only non-image records.

**Not yet tested:** real Android devices and in-app browsers, the Supabase backend against a live project,
the Docker image build (no Docker daemon was available), the remove.bg adapter, and diversity/bias testing
across skin tones, head coverings and spectacles. Faithfulness to identity was checked visually on a small
public-domain test set only; please run a consented pilot.

## Project structure

```
src/app/                  pages (/, /privacy, /admin, /admin/login) and API routes
src/lib/ai/               face detection, segmentation, pipeline, optional external provider
src/lib/db/               Store interface, Supabase store, dev JSON store
src/lib/i18n/             12 language dictionaries
src/lib/security.ts       sessions, password hashing, rate limiting, origin checks
supabase/schema.sql       database schema with RLS
docs/DPDP-COMPLIANCE.md   data inventory, controls, outstanding approvals
```

The DP pipeline (`generateDP(buffer, variant)`) and the `Store` interface are self-contained, so the app can
later be embedded in ECO's larger WhatsApp Branding Update Portal.
