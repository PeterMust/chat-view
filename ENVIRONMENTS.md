# GitHub Environments Setup

This document explains how to configure GitHub Environments for the **chat-view / chat-screening** project, following GitHub best practices for dev/prod separation.

---

## Overview

The project uses two GitHub Environments:

| Environment | Branch | Protection | Purpose |
|---|---|---|---|
| `development` | `develop` | None (auto-deploys) | Internal testing, fast iteration |
| `production` | `main` | Required reviewer + wait timer | Live deployment for end users |

Each environment holds its own **secrets** (Supabase credentials) and **variables** (display name, allowed domains). CI generates `config.js` at deploy time from these values — the file is never committed.

---

## Branch Strategy

```
main          ← production deploys only; protected; requires PR + reviewer
  ↑
develop       ← dev deploys; receives feature branches via PR
  ↑
feature/*     ← day-to-day development
```

- All feature work branches off `develop`
- `develop` → `main` PRs trigger production deployment (after approval)
- Direct pushes to `main` are blocked via branch protection rules

---

## Step 1 — Create GitHub Environments

Go to **Repository → Settings → Environments → New environment**.

### `development` environment

| Setting | Value |
|---|---|
| Name | `development` |
| Required reviewers | *(none — auto-deploy)* |
| Wait timer | *(none)* |
| Deployment branches | `develop` |

### `production` environment

| Setting | Value |
|---|---|
| Name | `production` |
| Required reviewers | Add 1–2 team members who must approve before deploy |
| Prevent self-review | ✓ Enabled |
| Wait timer | `5` minutes (gives time to cancel if something looks wrong) |
| Deployment branches | `main` |

---

## Step 2 — Add Environment Secrets

For **each environment** (Settings → Environments → select env → Add secret):

| Secret name | Description | Dev value | Prod value |
|---|---|---|---|
| `SUPABASE_PROJECT_ID` | Supabase project subdomain | dev project subdomain | prod project subdomain |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | dev anon key | prod anon key |

> **Why environment secrets instead of repository secrets?**
> Environment secrets are only injected into jobs that explicitly reference that environment. A workflow targeting `development` cannot read `production` secrets, preventing accidental cross-environment credential exposure.

---

## Step 3 — Add Environment Variables

For **each environment** (Settings → Environments → select env → Add variable):

| Variable name | Description | Dev value | Prod value |
|---|---|---|---|
| `ENV_DISPLAY_NAME` | Label shown in UI dropdown | `Development` | `Production` |
| `SUPABASE_ALLOWED_DOMAINS` | Comma-separated allowed email domains (empty = all) | *(empty)* | `yourcompany.com` |

> Variables (non-sensitive) are separate from secrets and visible in workflow logs — use them for configuration, not credentials.

---

## Step 4 — Add Branch Protection Rules

Go to **Repository → Settings → Branches → Add rule**.

### Protect `main`

| Rule | Setting |
|---|---|
| Branch name pattern | `main` |
| Require pull request before merging | ✓ |
| Required approvals | `1` |
| Dismiss stale reviews | ✓ |
| Require status checks to pass | ✓ (add `deploy` job from the workflow) |
| Restrict who can push | admins only |
| Do not allow bypassing | ✓ (optional but recommended) |

### Protect `develop` (optional but recommended)

| Rule | Setting |
|---|---|
| Branch name pattern | `develop` |
| Require pull request before merging | ✓ |
| Required approvals | `1` |
| Require status checks to pass | ✓ |

---

## Step 5 — (Optional) Add Deployment Secrets

If deploying to Netlify, a VPS, or another provider, add these as **repository secrets** (not environment-specific — they relate to infrastructure, not Supabase credentials):

| Secret name | Description |
|---|---|
| `NETLIFY_AUTH_TOKEN` | Netlify personal access token |
| `NETLIFY_SITE_ID` | Site ID from Netlify dashboard |
| `DEPLOY_USER` | SSH user for rsync deployments |
| `DEPLOY_HOST` | Hostname / IP for rsync deployments |
| `DEPLOY_PATH_DEV` | Remote path for dev deploy |
| `DEPLOY_PATH_PROD` | Remote path for prod deploy |

---

## How the Workflows Work

```
git push → develop
    └─ .github/workflows/deploy-dev.yml
          ├─ environment: development       ← injects dev secrets
          ├─ generate config.js             ← writes dev Supabase credentials
          ├─ bump cache-busting version
          └─ deploy static files → dev host

git push → main  (via PR from develop)
    └─ .github/workflows/deploy-prod.yml
          ├─ environment: production        ← pauses for required reviewer
          ├─ (reviewer approves in GitHub UI)
          ├─ wait 5 min timer
          ├─ generate config.js             ← writes prod Supabase credentials
          ├─ bump cache-busting version
          └─ deploy static files → prod host
```

The generated `config.js` is **never committed** — it is built from secrets at deploy time and exists only in the ephemeral runner workspace.

---

## Selecting a Deployment Provider

Open `.github/workflows/deploy-dev.yml` and `.github/workflows/deploy-prod.yml` and uncomment one of the three deployment options at the bottom of each file:

- **Option A — Netlify**: Recommended for simple static hosting. Dev deploys create preview URLs; prod deploy updates the main site.
- **Option B — GitHub Pages**: Free, zero-configuration. Use `destination_dir: dev` for the dev workflow so both envs coexist on the same Pages site.
- **Option C — rsync / VPS**: Full control. Requires SSH key secrets and a reachable server.

---

## Supabase Edge Functions

Edge functions (`chat-feedback`, `invite-user`) are **not deployed by these workflows** — they are deployed manually:

```bash
# Target the correct project with --project-ref
supabase functions deploy chat-feedback --project-ref <project-id>
supabase functions deploy invite-user   --project-ref <project-id>
```

Run this separately for dev and prod project refs after any function changes.

---

## Security Checklist

- [ ] `config.js` is in `.gitignore` (never committed)
- [ ] Production environment has required reviewers enabled
- [ ] `main` branch has push protection (no direct commits)
- [ ] `SUPABASE_PROJECT_ID` and `SUPABASE_ANON_KEY` are set as **environment** secrets (not repo secrets)
- [ ] Allowed domains (`SUPABASE_ALLOWED_DOMAINS`) are configured for production
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is only ever stored in Supabase Dashboard secrets (never in GitHub)
