# DPDP Act 2023 / DPDP Rules 2025 – privacy-by-design record and outstanding dependencies

> **Status: NOT production-approved.** This application has been built with privacy-by-design controls, but
> a consent checkbox does not make it compliant. The items in section 3 must be closed by ECO's Legal, IT and
> Information Security teams before production deployment. Nothing in this document is legal advice.

Note on commencement: the DPDP Rules, 2025 bring provisions into force in phases (for example, Data Protection
Board provisions first, and the consent-manager and most Data Fiduciary obligations after transition periods).
ECO Legal should confirm which obligations are in force on the launch date. The design below aims to meet the
substantive obligations regardless of phasing.

## 0. Processing mode

In the default **device mode** (`AI_MODE=device`), the photograph is processed by AI inside the user's own phone
browser and is **never transmitted** to ECO, the hosting provider or any AI company. ECO receives only the
participation records listed below. The hosting provider (e.g. Render) and the database provider (Supabase) process
only those non-image records. In **server mode** the photograph is processed in server memory as described below.

## 1. Data inventory

| Data | Purpose | Where | Retention |
|---|---|---|---|
| Photograph (source) | Create the DP | Browser memory → server RAM only | Discarded once the response is sent. Never written to disk, DB, logs or backups. EXIF/GPS stripped **on the phone** before upload. |
| Generated DP | Give it to the user | Server RAM → user's phone | Not stored by ECO. User can clear it from the screen. |
| Face location (bounding box) | Centring and the one-person check | Server RAM | Discarded with the photo. **No embeddings, templates, recognition or matching.** |
| Pseudonymous record ID | Link the user's own events | httpOnly cookie + DB | `PARTICIPANT_RECORD_RETENTION_DAYS` (default 180) after last update |
| Employee/Chauffeur ID (compulsory when `REQUIRE_STAFF_ID=true`, as configured for ECO); category and branch (optional) | Recording who has made a DP; participation metrics | DB | as above |
| Events (generated / downloaded / WhatsApp confirmed) | Metrics | DB | as above |
| Consent and withdrawal events (record ID, notice version, language, time) | Evidence of consent | DB | `CONSENT_LOG_RETENTION_DAYS` (default 365) |
| Privacy requests | Data principal rights | DB | Closed requests: `PRIVACY_REQUEST_RETENTION_DAYS` (default 365) |
| Admin audit log | Accountability | DB | ≥365 days |

The application does **not** collect name, phone number, email (except optionally in a privacy request),
location, device identifiers or IP addresses. IP addresses are used only in memory for rate limiting.

## 2. Controls implemented

- **Notice before collection**: shown in 12 languages (English + 11 Eighth-Schedule languages) before any
  upload. Covers purpose, processing method, processor, retention, deletion, rights and contact. A versioned
  full English notice is on `/privacy`.
- **Affirmative consent**: unticked checkbox and a separate button. Server-side enforcement: `/api/generate`
  refuses without consent to the *current* notice version. A consent event is recorded.
- **Voluntary**: "No thanks" path with manual instructions and a no-consequences statement.
- **Withdrawal as easy as consent**: one button on `/privacy` deletes the record and stops processing.
- **Rights**: access (view record), correction (edit details), erasure, grievance and nomination requests
  with a reference number. Admins manage them in the dashboard, including "erase linked record".
- **Data minimisation**: optional details only; no biometric identification; metadata stripped client-side.
- **Security**: HTTPS (HSTS), strict CSP, no public storage, secrets server-side only, service-role DB access
  with RLS denying anon, scrypt-hashed admin password, HMAC-signed 8-hour sessions, SameSite cookies plus an
  origin check, login rate limiting, optional admin IP allow-list, audit log, CSV formula-injection
  protection, upload size and pixel limits, concurrency limits.
- **No training**: the local AI models are pre-trained, inference-only, and never updated with user data.
- **No third-party transfer by default**: `AI_PROVIDER=local`. An external provider is blocked unless
  `EXTERNAL_AI_PROVIDER_APPROVED=true`, and the notice text changes automatically to disclose it.
- **Automatic deletion**: `/api/cron/retention` (secret-protected) plus a manual admin trigger.
- **Dashboard**: never shows photographs; download and WhatsApp confirmation are separate metrics.

## 3. Outstanding legal, contractual, security and technical dependencies

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Approve the privacy notice text, notice version and retention periods | Legal | **Open** |
| 2 | Native-speaker and legal review of all 11 Indian-language translations (currently DRAFT, machine-quality) | Legal / HR / Comms | **Open** |
| 3 | Appoint and publish a privacy contact / Grievance Officer (`PRIVACY_CONTACT_EMAIL`, `GRIEVANCE_OFFICER_NAME`) and define response SLAs | Legal | **Open** |
| 4a | Compulsory staff ID: confirm the ID is necessary for the campaign purpose (data minimisation) and that recording it does not make participation non-voluntary | Legal / HR | **Open** |
| 4 | Confirm the lawful basis: consent (as built) vs. "certain legitimate uses" for employment; confirm there is no coercion for chauffeurs engaged via vendors | Legal / HR | **Open** |
| 5 | Record the HR / vendor-management confirmation that non-participation has no adverse consequences, and communicate it to supervisors | HR / Ops | **Open** |
| 6 | Hosting approval: provider, India region (e.g. AWS Mumbai `ap-south-1`), DPA, backups and access policy | IT / InfoSec | **Open** |
| 7 | Database approval: Supabase project region (choose Mumbai), DPA, staff access, backup retention aligned with deletion | IT / InfoSec / Legal | **Open** |
| 8 | VAPT / security review and penetration test before go-live | InfoSec | **Open** |
| 9 | Official logo file installed at `public/brand/eco-logo.png` (plus optional transparent watermark variant) | Brand | **Open** |
| 10 | Model licence review: U²-Net (Apache-2.0), Ultra-Light-Fast face detector (MIT) | Legal / IT | **Open** |
| 11 | Only if an external AI provider is ever enabled: vendor due diligence (no-training clause, deletion SLA, processing location, cross-border transfer review, sub-processors, breach notification) | IT / Legal / InfoSec | Not needed with `local` |
| 12 | Personal-data-breach response procedure (Board and data principals) covering this application | InfoSec / Legal | **Open** |
| 13 | Schedule the daily deletion job (`/api/cron/retention`) and monitor it | IT | **Open** |
| 14 | Children's data: the tool is for adult employees and chauffeurs; confirm no minors are in scope | HR | **Open** |
| 15 | Rate limiting is per server instance and in memory; use a shared store if running more than one instance | IT | **Open** if scaled |
| 16 | Real-device testing on low-end Android phones and in-app browsers (WhatsApp's link browser), plus a pilot with chauffeurs | Ops / IT | **Open** |
| 17 | Bias and quality testing of segmentation across skin tones, head coverings (turbans, hijabs, caps), beards and spectacles, with a pilot group's consent | IT / HR | **Open** |
| 18 | Supabase path is implemented but was not executed against a live Supabase project during development | IT | **Open** |
| 19 | Device mode: approve the hosting provider (Render, Singapore) and Supabase as processors of the non-image participation records | IT / Legal | **Open** |
| 20 | Device mode: test on low-end Android phones and on slow mobile data (first use downloads ~26 MB) | Ops / IT | **Open** |
