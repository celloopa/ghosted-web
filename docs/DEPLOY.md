# Deploying Ghosted to Coolify

This document covers deploying the Ghosted web app to a Coolify instance so
people on the owner's network can test it using the owner's Claude subscription
(the "house account"), behind an invite code gate, with a daily usage cap.

---

## What the image contains

- Next.js 15 standalone server (Node 22)
- `typst` binary (for PDF resume/cover-letter export)
- `pdftotext` from poppler-utils (for CV text extraction and ATS validation)
- `python3` (for the ATS validator script)

Persistent data (generation run logs, usage cap counters, exported files) lives
in `/app/apps/web/.ghosted-local` — mount a named volume there.

---

## 1. Get a house token

On the owner's machine, run:

```bash
claude setup-token
```

Copy the printed token (`sk-ant-oat01-…`). It grants API access under the
owner's Claude subscription. **Treat it like a password** — it never leaves the
server and is never sent to browsers.

If it leaks, revoke it by running `claude setup-token` again (the old token is
immediately invalidated) and update the `GHOSTED_HOUSE_TOKEN` env var in Coolify.

---

## 2. Coolify setup

### 2a. Create a new Resource → Docker (Dockerfile)

1. Point Coolify at this repository.
2. Set **Dockerfile location**: `Dockerfile` (repo root).
3. Set **Port**: `3000`.

### 2b. Environment variables

Set these in Coolify → Service → Environment Variables:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GHOSTED_HOUSE_TOKEN` | **yes** | — | `sk-ant-oat01-…` from `claude setup-token`. The secret. Never set this on the client. |
| `GHOSTED_HOUSE_PROVIDER` | no | `anthropic` | Leave as-is unless you're using a different provider. |
| `GHOSTED_HOUSE_MODEL` | no | `claude-sonnet-4-6` | Override the model the house account uses. |
| `GHOSTED_INVITE_CODE` | **yes** | — | Any string, e.g. `my-test-group`. Share it with your testers. Unset = gate off (local dev). |
| `GHOSTED_GEN_DAILY_CAP` | no | `30` | Max AI generation calls per tester per day when using the house account. Testers who connect their own key are uncapped. |

### 2c. Persistent volume

Add a volume mount:

- **Host path / named volume**: `ghosted-local-data` (Coolify will create it)
- **Container path**: `/app/apps/web/.ghosted-local`

This ensures run logs, usage counters, and exported files survive container
restarts and re-deployments.

### 2d. Domain + TLS

In Coolify → Service → Domains:

1. Add your domain (e.g. `ghosted.yourdomain.com`).
2. Enable Let's Encrypt — Coolify handles certificate provisioning automatically.

---

## 3. Deploy

Click **Deploy** in Coolify. The build takes 2–4 minutes on first run (pnpm
install + Next.js build). Subsequent deploys are faster thanks to Docker layer
caching.

---

## 4. Sharing access

Give testers the invite code you set in `GHOSTED_INVITE_CODE`. They visit the
domain, are redirected to `/unlock`, enter the code, and the cookie is set for
30 days.

Testers using the house account are limited to `GHOSTED_GEN_DAILY_CAP`
generation calls per day. The 429 response message tells them to connect their
own AI key in Settings if they need more.

---

## 5. Local smoke test (before deploying)

Run locally with the house account and invite gate enabled:

```bash
# From the repo root:
GHOSTED_HOUSE_TOKEN=sk-ant-oat01-… \
GHOSTED_HOUSE_PROVIDER=anthropic \
GHOSTED_HOUSE_MODEL=claude-sonnet-4-6 \
GHOSTED_INVITE_CODE=test \
GHOSTED_GEN_DAILY_CAP=5 \
pnpm --filter web start
```

Then open `http://localhost:3000` and check:

1. You are redirected to `/unlock`.
2. Entering `test` as the invite code sets the cookie and redirects to `/`.
3. Wrong code shows 'That code did not match.'
4. A generation request (via the apply flow) completes successfully without
   needing to connect your own AI in Settings.
5. After 5 generations in one session, you receive the 'Daily limit reached'
   message.
6. Providing your own AI key in Settings bypasses the cap entirely.

---

## 6. Rotating the house token

```bash
claude setup-token   # on the owner's machine — prints a new sk-ant-oat01-… token
```

Update `GHOSTED_HOUSE_TOKEN` in Coolify → redeploy. The old token is revoked
immediately upon generating the new one.

---

## Architecture notes

- The house token only ever flows through `apps/web/lib/server/houseConnection.ts`
  and is used in `apps/web/app/api/generate/route.ts`. It is never serialised
  into a response body or a client-readable cookie.
- The invite gate runs in Next.js middleware (`apps/web/middleware.ts`).  
  The pure logic is in `apps/web/lib/server/inviteGate.ts` and is fully unit-tested.
- Usage counting is in `apps/web/lib/server/genCap.ts` and writes to
  `.ghosted-local/usage/<YYYY-MM-DD>.json` — one file per day, mapping
  session ID → count. The session ID is an httpOnly cookie `ghosted_sid`.
