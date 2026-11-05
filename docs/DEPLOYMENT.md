# Deployment guide

## Recommended: Google Cloud Run (Mumbai) + Supabase (Mumbai)

**Cost:** ₹0 for a campaign of this size (about 900 users and ~2,700 DPs use under 20% of Cloud Run's free
monthly allowance). Google needs a card to open the account; set the budget alert in step 8.

**Data location:** India (`asia-south1` Mumbai for the app, `ap-south-1` Mumbai for the database).

### 1. Database (Supabase)
1. supabase.com → New organization (Free) → New project, region **Mumbai**.
2. SQL Editor → paste `supabase/schema.sql` → Run → "Success. No rows returned".
3. Save the **Project URL** and the **secret / service_role key**.

### 2. Google Cloud account
1. Go to console.cloud.google.com and sign in with a Google account.
2. Accept the terms. Start the free trial or set up billing with a card (needed even for free usage).
3. Create a project named `eco-dp`.

### 3. Deploy from GitHub
1. Console search bar → **Cloud Run** → **Deploy container** → **Service**.
2. Choose **Continuously deploy from a repository (source or function)** → **Set up with Cloud Build**.
3. Provider **GitHub** → authenticate → repository `sunandarao/eco-dp-generator` → **Next**.
4. Branch `^main$`, build type **Dockerfile**, path `/Dockerfile` → **Save**.
5. Service name `eco-dp`. Region **asia-south1 (Mumbai)**.
6. Authentication: **Allow public access** (unauthenticated invocations).
7. Billing: **Request-based**. Minimum instances `0`. Maximum instances `5`.
8. **Container(s), Volumes, Networking, Security** → **Settings** tab:
   - Memory **2 GiB**, CPU **2**, Request timeout **120** seconds
   - Maximum concurrent requests per instance **8**
   - Startup CPU boost **on**
9. **Variables & Secrets** tab → add the environment variables (next section).
10. Click **Create**. The first build takes about 10 minutes. Afterwards every push to `main` redeploys automatically.

### 4. Environment variables

| Name | Value |
|---|---|
| `SUPABASE_URL` | from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
| `ADMIN_USERNAME` | e.g. `ecoadmin` |
| `ADMIN_PASSWORD_HASH` / `ADMIN_SESSION_SECRET` | output of `npm run hash-password -- "<strong password>"` |
| `CRON_SECRET` | any long random text |
| `PRIVACY_CONTACT_EMAIL`, `GRIEVANCE_OFFICER_NAME` | ECO privacy contact |
| `HOSTING_DISCLOSURE` | `Google Cloud (Mumbai, India) hosts this application for ECO.` |
| `BRANCHES` | your branch list, comma-separated |
| `MAX_CONCURRENT_JOBS` | `2` |

For stronger protection you can store the two keys in **Secret Manager** and reference them here instead.

### 5. Open it
The service page shows a URL like `https://eco-dp-xxxxxxxx.asia-south1.run.app`. Open `/admin`, sign in, and
check that **System configuration** is all ✓. Then make a DP on an Android phone.
To use a custom domain such as `dp.ecomobility.com`, see Cloud Run → **Manage custom domains**.

### 6. Daily deletion job
Cloud Scheduler (3 jobs are free) → **Create job**:
- Frequency `0 2 * * *`, timezone Asia/Kolkata
- Target **HTTP**, URL `https://<service-url>/api/cron/retention`, method GET
- Header `Authorization: Bearer <CRON_SECRET>`

### 7. Rollout tips
- Each instance processes 2 DPs at a time and up to 5 instances run, so about 10 DPs are processed at once.
  The rest wait a few seconds. Sharing the link branch by branch avoids queues.
- After a quiet period the first visitor waits about 10–20 s while an instance starts.

### 8. Budget alert (recommended)
Billing → **Budgets & alerts** → Create budget → amount ₹100 → alerts at 50%, 90%, 100% → email.

## Other options

| Option | Cost | Notes |
|---|---|---|
| Hugging Face Spaces (Docker) | about USD 9 / month (PRO) | Free plan no longer runs Docker apps. Servers in the USA. |
| Render (Standard 2 GB) | about USD 25 / month | Singapore region. |
| Any VM or container host | varies | Run the Docker image with ≥2 GB RAM. |

**Memory:** the app peaks at about 1.4 GB while generating a DP, so free tiers with 512 MB (Render Free,
Koyeb Free and similar) cannot run it.

**Vercel:** the free Hobby plan is for non-commercial use only, and the AI runtime plus the 176 MB model exceeds
Vercel's 250 MB function limit.
