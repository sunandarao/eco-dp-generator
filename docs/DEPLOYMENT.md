# Deployment guide

## Option A – Free: Hugging Face Spaces + Supabase (recommended for a pilot)

Cost: **₹0**. No credit card. Hugging Face's free CPU Space has 2 vCPU and 16 GB RAM, which is plenty for the AI model.

Things to know before choosing it:
- Hugging Face, Inc. hosts the app on servers in the **USA**. Photos are processed there in memory and never
  stored, but Hugging Face is still a hosting processor. ECO IT/Legal must approve it, and the privacy notice
  must name it (set `HOSTING_DISCLOSURE`, step 4).
- The Space **must be Public** so employees can open it. Your code is visible (it's already public on GitHub);
  secrets stay hidden.
- A free Space **sleeps after 48 hours without visitors** and takes about 1–2 minutes to wake. The daily cron
  call in step 6 keeps it awake.
- Share the direct link `https://<owner>-<space>.hf.space`, not the huggingface.co page (the app refuses to be
  shown inside another site's frame, for security).

### 1. Add the official logo
GitHub repo → `public/brand` → **Add file → Upload files** → upload the logo as `eco-logo.png` → Commit.

### 2. Database (Supabase free tier)
1. supabase.com → **New project** → region **South Asia (Mumbai)**.
2. **SQL Editor** → paste all of `supabase/schema.sql` → **Run**.
3. **Project Settings → API** → copy the **Project URL** and the **service_role** key.

The free tier pauses a project after about a week with no database activity. The daily cron call (step 6)
touches the database and prevents that.

### 3. Create the Space
1. huggingface.co → sign up → **New Space**.
2. Name: e.g. `eco-dp`. SDK: **Docker** (Blank template). Hardware: **CPU basic – free**. Visibility: **Public**.
3. **Settings → Access Tokens** (your profile) → **New token** → type **Write** → copy it.

### 4. Space secrets (Space → Settings → Variables and secrets → New secret)

| Name | Value |
|---|---|
| `SUPABASE_URL` | from step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 2 |
| `ADMIN_USERNAME` | e.g. `ecoadmin` |
| `ADMIN_PASSWORD_HASH` / `ADMIN_SESSION_SECRET` | output of `npm run hash-password -- "<strong password>"` |
| `CRON_SECRET` | any long random text |
| `PRIVACY_CONTACT_EMAIL`, `GRIEVANCE_OFFICER_NAME` | ECO privacy contact |
| `HOSTING_DISCLOSURE` | `Hugging Face, Inc. (servers in the USA) hosts this application for ECO.` |
| `PUBLIC_URL` | `https://<owner>-<space>.hf.space` |
| `BRANCHES` | your branch list, comma-separated |

### 5. Connect GitHub → Space (automatic deploys)
GitHub repo → **Settings → Secrets and variables → Actions**:
- **Secrets** tab → New secret `HF_TOKEN` = the write token from step 3.
- **Variables** tab → New variable `HF_SPACE` = `<hf-username>/eco-dp`.

Then **Actions → Deploy to Hugging Face Space → Run workflow**. From now on, every push to `main` redeploys
automatically. Watch the build in the Space's **Logs** tab; the first build takes about 5–10 minutes.

### 6. Daily deletion job (cron-job.org, free)
Create a daily job: URL `https://<owner>-<space>.hf.space/api/cron/retention`, method GET, header
`Authorization: Bearer <CRON_SECRET>`.

### 7. Check
Open `https://<owner>-<space>.hf.space/admin`, sign in, and confirm **System configuration** shows ✓ for
everything. Then make a DP on an Android phone and see it appear on the dashboard.

## Option B – Paid, India region (recommended for full roll-out)

Run the same Docker image on AWS App Runner / ECS (`ap-south-1` Mumbai), Azure (Central India) or Google Cloud
Run (`asia-south1`) with ≥2 vCPU / 2 GB RAM. About USD 30–80 a month. Same environment variables as above.

## Why not Vercel?

- Vercel's free **Hobby plan is for personal, non-commercial use only**, so it can't be used for an ECO campaign;
  Pro costs about USD 20 a month per member.
- The on-server AI (onnxruntime + a 176 MB model) exceeds Vercel's 250 MB function size limit. Making it fit
  would need either downloading the model on every cold start, or moving the AI into the phone's browser
  (smaller, lower-quality model, slower on low-end phones).
