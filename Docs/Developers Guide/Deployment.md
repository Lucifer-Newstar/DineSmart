# Deployment inputs checklist

This is the list of accounts, settings and environment variables needed to deploy Andhrímnir with the frontend on **Vercel**, the backend on **Render**, and the database in an **existing MongoDB Atlas cluster**. Nothing here has been deployed or verified live yet; the code paths are covered by local tests with fakes only.

**Secrets** (marked 🔒) are typed straight into the Vercel or Render dashboard. Never commit them, paste them in chat, or put them in an issue. `backend/.env.example` and `frontend/.env.example` list the same variables with safe placeholders.

## 1. MongoDB Atlas (existing cluster)

One Atlas cluster can hold many databases, so no new cluster is needed.

| Item | Required | Where | Notes |
| --- | --- | --- | --- |
| Database name `andhrimnir` | Required | Connection string | The database is created on first write. It sits beside any other database in the cluster and does not touch it. |
| Dedicated database user 🔒 | Required | Atlas → Database Access | Create a user only for this app, with *readWrite* on the `andhrimnir` database (Specific Privileges), not *Atlas admin*. Use a long generated password. |
| Network Access allowlist | Required | Atlas → Network Access | Add Render's outbound IP addresses (Render dashboard → the service → *Connect* → *Outbound*). `0.0.0.0/0` also works but relies on the password alone; prefer the Render list. |
| Connection string 🔒 | Required | Atlas → Connect → Drivers | `mongodb+srv://<user>:<password>@<cluster-host>/andhrimnir?retryWrites=true&w=majority` → this becomes `MONGODB_URI` on Render. URL-encode special characters in the password. |

Indexes (including the TTL index that expires unverified sign-ups) are created by the API on startup.

## 2. Backend on Render (Web Service)

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Runtime / Node version | Node `24.21.0` (set `NODE_VERSION=24.21.0` or rely on the repository `.nvmrc`) |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/health` (liveness only; it does not check the database) |

Environment variables:

| Variable | Required | Secret | Value / how to get it |
| --- | --- | --- | --- |
| `NODE_ENV` | Required | No | `production` |
| `MONGODB_URI` | Required | 🔒 | The Atlas connection string from section 1, ending in `/andhrimnir`. |
| `JWT_SECRET` | Required | 🔒 | At least 32 bytes of random data. Generate with `openssl rand -base64 48` or `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. Only one secret is used: refresh sessions are stored server-side, not signed with a second key. Changing it signs everyone out. |
| `WEB_ORIGIN` | Required | No | The public frontend origin, exactly, with no path or trailing slash, e.g. `https://dinesmart.vercel.app`. It is the CORS origin and the WebSocket origin check. Production refuses to start without it. |
| `TRUST_PROXY` | Required in practice | No | Number of proxy hops in front of the API, used for per-IP rate limits. Behind Vercel's rewrite to Render this is probably `2` (Vercel + Render's load balancer). **Not verified live:** after deploying, log in and check that the API sees the client's real IP (rate-limit keys should differ between two networks). Never set `true`. Unset means `1` in production. |
| `PORT` | Optional | No | Render sets this itself; leave it unset. |
| `EMAIL_PROVIDER` | Required | No | `smtp` or `resend`. `mock` is refused in production, and the server will not start without a real provider (sign-up codes and password resets depend on it). |
| `EMAIL_FROM` | Required | No | Sender shown to users, e.g. `DineSmart <no-reply@your-domain.com>`. Must be an address/domain the provider has verified. |
| `SMTP_HOST` | If `smtp` | No | e.g. `smtp.gmail.com`, `smtp-relay.brevo.com`. |
| `SMTP_PORT` | If `smtp` | No | `587` (STARTTLS) or `465` (implicit TLS). |
| `SMTP_SECURE` | If `smtp` | No | `false` for 587, `true` for 465. |
| `SMTP_USER` | If `smtp` | No | SMTP login (for Gmail, the full address). |
| `SMTP_PASSWORD` | If `smtp` | 🔒 | SMTP password. For Gmail this must be an **App Password** (Google Account → Security → 2-Step Verification → App passwords), not the account password. |
| `RESEND_API_KEY` | If `resend` | 🔒 | Resend dashboard → API Keys. |
| `GOOGLE_CLIENT_ID` | Optional | No | OAuth client ID from section 4. Without it, Google sign-in is disabled and email/password still works. |
| `GEMINI_API_KEY` | Optional | 🔒 | Google AI Studio → Get API key. Without it, the deterministic fallback recommendations are used. |
| `GEMINI_MODEL` | Optional | No | Defaults to `gemini-3.5-flash-lite`. |

## 3. Frontend on Vercel

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | `frontend` |
| Node version | 24.x (Project Settings → General) |
| Build / install | Defaults (`npm ci`, `next build`) |

Environment variables (Production, and Preview if previews should work):

| Variable | Required | Secret | Value |
| --- | --- | --- | --- |
| `API_PROXY_TARGET` | Required | No | The Render service URL, e.g. `https://dinesmart-api.onrender.com` (no trailing slash). Next.js rewrites `/api/v1/*` and `/health` to it, so the browser stays same-origin and the refresh cookie works. Set before building; rewrites are fixed at build time. |
| `NEXT_PUBLIC_REALTIME_URL` | Recommended | No | The same Render URL. Live notifications connect to it directly over WebSocket (rewrites cannot proxy WebSockets). Without it, notifications fall back to polling every minute. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional | No | Same value as the backend `GOOGLE_CLIENT_ID`. Public by design. |
| `NEXT_PUBLIC_DEMO_RESTAURANT_ID` | Optional | No | Restaurant used by the public `/book` flow. Set it to the id printed by the bootstrap command (section 6), or keep the seeded demo id if the demo data is loaded. |

`NEXT_PUBLIC_*` values are baked into the browser bundle: never put a secret in one. Redeploy after changing any of them.

## 4. Google sign-in (optional)

Google Cloud Console → APIs & Services:

1. **OAuth consent screen**: External, app name, support email; add test users while it is in *Testing*.
2. **Credentials → Create OAuth client ID → Web application.**
3. **Authorised JavaScript origins**: `https://<your-vercel-domain>` and `http://localhost:3000`.
4. **Authorised redirect URIs**: none needed. The app uses Google Identity Services ID tokens (the button returns a token to the page; the backend verifies it against the client ID), not a redirect flow, so there is also **no client secret** to configure.
5. Copy the client ID into `GOOGLE_CLIENT_ID` (Render) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Vercel).

Behaviour: Google sign-in logs in an **existing** account whose email matches the verified Google email and links it on first use. It does not create accounts; new people sign up with email + code, or are added by an administrator.

## 5. Email provider

Pick one:

- **SMTP** (e.g. Gmail with an App Password, Brevo, Mailgun, Amazon SES SMTP). Gmail is fine for a demo but has daily sending limits and may land in spam.
- **Resend**: create an account, add and verify your sending domain (DNS records: SPF/DKIM shown by Resend), create an API key. Without a verified domain Resend only sends from its test address to your own email.

Whichever you use, `EMAIL_FROM` must match a verified sender/domain.

## 6. First administrator (bootstrap)

A fresh database has no restaurant and no users. Run once from a local machine with the backend dependencies installed (`cd backend && npm ci`):

```powershell
$env:MONGODB_URI = "<the Atlas connection string>"
$env:BOOTSTRAP_PASSWORD = "<a password of 12+ characters>"
npm run bootstrap -- --restaurant "Your Restaurant" --name "Admin Name" --email admin@example.com --timezone Asia/Kolkata --currency INR
```

It prints the new restaurant id. More staff: `npm run bootstrap -- --restaurant-id <id> --name "Staff Name" --email staff@example.com --role "Kitchen Staff"`, or add them later from Settings → Staff. Clear the two variables afterwards (`Remove-Item Env:MONGODB_URI, Env:BOOTSTRAP_PASSWORD`). Your current IP must be on the Atlas Network Access list while you run it.

Optional demo data instead (or as well): `npm run seed -- --allow-remote --confirm andhrimnir` with `NODE_ENV=development` and `MONGODB_URI` pointing at Atlas. It refuses to run without both flags, and refuses `NODE_ENV=production`.

## 7. After deploying: what to check live

These have only been tested with fakes and need a live check:

- [ ] Sign up with email → code arrives → verify → log in (email provider + Atlas).
- [ ] Forgot password email arrives and the reset works.
- [ ] Session survives past 15 minutes (token renewal through the Vercel rewrite and refresh cookie).
- [ ] Google sign-in for an existing account (authorised origin correct).
- [ ] Live notifications connect (`NEXT_PUBLIC_REALTIME_URL`, `WEB_ORIGIN` match).
- [ ] AI recommendation shows source *Gemini* (key and model valid).
- [ ] Rate limits key on the real client IP (`TRUST_PROXY`).
- [ ] Render free tier sleeps after inactivity; the first request after a sleep takes extra seconds.
