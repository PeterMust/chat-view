# Google OAuth Setup Log

Tracking setup steps for PR: `claude/add-authentication-feedback-Wzcq8`
Working branch: `claude/auth-feedback-setup-Qlz0k`

---

## Steps

| # | Who | Step | Status |
|---|-----|------|--------|
| 1 | YOU | Enable Google OAuth in Supabase Dashboard → Authentication → Providers | ⏳ pending |
| 2 | YOU | Add app URL to Supabase → Authentication → URL Configuration → Redirect URLs | ⏳ pending |
| 3 | YOU | Add `https://<project-id>.supabase.co/auth/v1/callback` to Google Cloud Console → Authorized redirect URIs | ⏳ pending |
| 4 | ME  | Create `config.js` from `config.example.js` (gitignored, local only) | ✅ done |
| 5 | YOU | Run `supabase/migrations/add_submitted_by_to_chat_feedback.sql` on your DB | ✅ skipped — `submitted_by` column already exists in table |
| 6 | YOU | Redeploy Edge Function: `supabase functions deploy chat-feedback --no-verify-jwt` | ⏳ pending |

---

## Step-by-step instructions for manual steps

### Step 1 — Enable Google OAuth in Supabase Dashboard

1. Open **Supabase Dashboard** → your project → **Authentication** → **Providers**
2. Find **Google** → toggle **enabled**
3. Paste your Google **Client ID** and **Client Secret** (you get these in step 3)
4. Save

### Step 2 — Add Redirect URL in Supabase

1. **Authentication** → **URL Configuration**
2. Under **Redirect URLs**, add your app's URL:
   - Local: `http://localhost:8080` (or whichever port you serve on)
   - Production: `https://your-domain.com`
3. The URL must match exactly what the browser shows when you open `index.html`

### Step 3 — Google Cloud Console

1. Go to <https://console.cloud.google.com> → your project
2. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
3. Under **Authorized redirect URIs**, add:
   ```
   https://<your-project-id>.supabase.co/auth/v1/callback
   ```
4. Copy the **Client ID** and **Client Secret** into Supabase (step 1)

### Step 4 — config.js (ME — already done)

`config.js` was created from `config.example.js`. Fill in your values:

```js
window.CHAT_VIEW_CONFIG = {
  projectId: 'your-project-id',   // ← replace
  anonKey: 'your-anon-key',       // ← replace
  allowedDomains: [],             // ← e.g. ['yourcompany.com']
};
```

`config.js` is gitignored — it stays local only.

### Step 5 — Run migration SQL (YOU)

In Supabase SQL Editor or via CLI:

```bash
# Via CLI:
supabase db push

# Or paste the file content manually in SQL Editor:
# supabase/migrations/add_submitted_by_to_chat_feedback.sql
```

SQL content:
```sql
alter table chat_feedback
  add column if not exists submitted_by text;
```

### Step 6 — Redeploy Edge Function (YOU)

```bash
supabase functions deploy chat-feedback --no-verify-jwt
```

---

## Notes

- `config.js` is gitignored. Each developer must create their own copy from `config.example.js`.
- The Supabase project ID is the subdomain: `abcdefghij` from `abcdefghij.supabase.co`
- The anon key is found in: Supabase Dashboard → Project Settings → API → `anon` `public`
- After completing step 3, update the table in this file to reflect your progress.
