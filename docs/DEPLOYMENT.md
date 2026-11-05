# Deployment guide

The app has two AI modes (environment variable `AI_MODE`):

| Mode | Where the AI runs | Server memory | Hosting |
|---|---|---|---|
| `device` (default) | In the user's phone browser (Google MediaPipe models). **The photo is never uploaded.** | ~200 MB | Free (Render free plan) |
| `server` | On the server (U²-Net + face detector) – slightly crisper hair edges | ~1.5 GB peak (2 GB recommended) | Paid or Cloud Run |

## Recommended free setup: Render (free) + Supabase (free)

**Cost:** ₹0. Render's free plan normally needs no card. Supabase free tier holds the small participation records.

### 1. Database (Supabase)
1. supabase.com → New organization (Free) → New project (choose the Mumbai / Asia-Pacific region).
2. SQL Editor → paste `supabase/schema.sql` → Run → "Success. No rows returned".
3. Save the **Project URL** and the **secret / service_role key**.

### 2. Admin password
Run `npm run hash-password -- "<a strong password>"` on any computer with Node.js. This prints
`ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET`.

### 3. Deploy on Render
1. render.com → **Get started** → sign up with **GitHub**.
2. **New +** → **Blueprint** → select `sunandarao/eco-dp-generator` → Render reads `render.yaml`.
3. Fill in the values it asks for:

| Name | Value |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
| `ADMIN_USERNAME` | e.g. `ecoadmin` |
| `ADMIN_PASSWORD_HASH` / `ADMIN_SESSION_SECRET` | from step 2 |
| `CRON_SECRET` | any long random text |
| `PRIVACY_CONTACT_EMAIL` / `GRIEVANCE_OFFICER_NAME` | ECO privacy contact |
| `BRANCHES` | comma-separated branch list |

4. **Apply**. The first build takes about 5 minutes. The app address is `https://eco-dp-xxxx.onrender.com`.
   Every push to `main` redeploys automatically.

### 4. Keep it awake + daily deletion (cron-job.org, free)
Render's free plan sleeps after 15 minutes without visitors (waking takes about 1 minute). Create two jobs:
1. **Keep awake:** every 10 minutes, GET `https://<app>/api/status`.
   750 free hours a month covers one service running all month.
2. **Daily deletion:** daily at 02:00 IST, GET `https://<app>/api/cron/retention` with header
   `Authorization: Bearer <CRON_SECRET>`.

### 5. Check
Open `https://<app>/admin` → sign in → **System configuration** should be all ✓ ("AI mode: on the phone").
Then make a DP on an Android phone.

### Notes on device mode
- First use downloads about 26 MB (AI runtime + models) to the phone, then it is cached for 30 days.
  On slow mobile data the first DP can take up to a minute; later DPs take a few seconds.
- Tested in Chromium (desktop and emulated Android). Expected to work in current Chrome for Android, Samsung Internet
  and Safari, but real-device testing on low-end phones is still required.
- The server never receives photos: `/api/generate` is disabled in device mode.

## Server-AI alternative: Google Cloud Run (Mumbai)
Set `AI_MODE=server` and deploy the `Dockerfile`:
- Region `asia-south1`, 2 GiB memory, 2 CPU, concurrency 8, max instances 5, request timeout 120 s.
- Free within Cloud Run's monthly allowance for about 900 users. In India, a ₹1,000 prepayment (kept as credit)
  is required to open the account.

## Other options

| Option | Cost | Notes |
|---|---|---|
| Hugging Face Spaces (Docker) | about USD 9 / month (PRO) | Its free plan no longer runs Docker apps. |
| Render Standard (server AI) | about USD 25 / month | `AI_MODE=server`. |
| Vercel | – | Free Hobby plan is non-commercial only. |
