# CLAUDE.md — Chat View

This file provides context for AI assistants working in this repository.

## Project Overview

**Chat View** is a single-page web application for viewing AI chat conversations stored in a Supabase (PostgreSQL) database. It presents sessions in a WhatsApp-style interface, with per-session and per-message feedback capabilities.

The application is a zero-build-step frontend: open `index.html` in a browser and it works. There are no npm scripts, no bundlers, and no test runner.

## Repository Structure

```
chat-view/
├── index.html                              # Single-page app (HTML + all CSS)
├── app.js                                  # All application logic (~1330 lines)
├── config.js                               # Gitignored — Supabase credentials, multi-env config + optional domain restriction
├── favicon.svg                             # Eyes emoji favicon
├── FEATURES.md                             # Feature list and todo tracker
├── SETUP.md                                # Google OAuth setup guide
└── supabase/
    ├── functions/
    │   ├── chat-feedback/
    │   │   └── index.ts                    # Deno Edge Function: store & forward feedback
    │   └── invite-user/
    │       └── index.ts                    # Deno Edge Function: admin invite + role upsert
    └── migrations/
        ├── create_chat_feedback.sql        # DB schema for feedback table
        └── create_user_roles.sql           # DB schema + RLS + trigger for user roles
```

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES2020+), HTML5, CSS |
| Database | Supabase (PostgreSQL) |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| Auth | Supabase Auth with Google OAuth provider |
| Supabase client | `@supabase/supabase-js@2` via CDN (`jsdelivr`) |
| Build system | None |
| Test framework | None |
| CSS preprocessor | None |

## Running the Application

No build step is needed. Open `index.html` directly in a browser, or serve it with any static file server:

```bash
# Any of these work:
npx serve .
python3 -m http.server
# Or just open index.html in a browser
```

**Login screen** shows only a "Sign in with Google" button. No credential fields are displayed.

**Credentials must be provided via `config.js`** (gitignored) — the login button will show an error if neither `config.js` nor saved `localStorage` values are present.

`config.js` supports two formats:

```js
// Single-environment format (original, backward compatible)
window.CHAT_VIEW_CONFIG = {
  projectId: 'your-project-id',   // subdomain of your Supabase project
  anonKey:   'your-anon-key',     // public anon key from Supabase Dashboard → Project Settings → API
  // allowedDomains: ['yourcompany.com'],  // optional: restrict to specific email domains
};
```

```js
// Multi-environment format — shows a named dropdown on the login screen
window.CHAT_VIEW_CONFIG = {
  environments: [
    { name: 'Staging',    projectId: 'staging-id',    anonKey: 'staging-key',    allowedDomains: [] },
    { name: 'Production', projectId: 'prod-id',       anonKey: 'prod-key',       allowedDomains: ['yourcompany.com'] },
  ]
};
```

When `environments` has 2+ entries, an **"Environment"** `<select>` dropdown appears on the login card above the Google sign-in button. With only 1 entry (or the single-env format), the dropdown is hidden.

Credentials and the selected environment index are persisted in `localStorage` (`sb_project_id`, `sb_key`, `sb_selected_env`) after the first successful OAuth redirect, so subsequent visits restore the correct environment without re-reading `config.js`.

## Database Schema

The app reads from a `chat_messages` table (not created in this repo — it must pre-exist) and writes feedback to a `chat_feedback` table.

### Expected `chat_messages` table columns

| Column | Type | Notes |
|---|---|---|
| `id` | any | Primary key |
| `session_id` | text | Groups messages into conversations |
| `created_at` | timestamptz | Used for ordering and date filters |
| `message` | jsonb / text | JSON object with message data (see Message Format below) |

### `chat_feedback` table (created by migration)

Run the migrations on your Supabase project:
```bash
supabase db push
# or apply manually via Supabase SQL Editor
```

### `chat_view_user_roles` table (created by migration)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | Primary key |
| `user_id` | uuid | FK to `auth.users(id)` on delete cascade |
| `role` | text | `'user'` or `'admin'` |
| `email` | text | User's email address |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

RLS is enabled; users may only read their own row (anon key access). A DB trigger (`on_auth_user_created`) auto-inserts a `'user'` row when a new `auth.users` record is created, covering both Google OAuth sign-ins and accepted invitations.

## Message Format

Messages in `chat_messages.message` must be a JSON object with a `type` field:

```json
// Human (customer) message
{ "type": "human", "content": "Hello, I need help..." }

// AI agent message (final response, no tool calls)
{
  "type": "ai",
  "content": "{\"output\": {\"text\": \"...\", \"request_category\": \"...\", \"request_type\": \"...\", \"identity_verified\": true, \"end_conversation\": false}}"
}

// AI message with tool calls
{
  "type": "ai",
  "content": "...",
  "tool_calls": [{ "name": "tool_name", "args": { ... } }]
}

// Tool result
{ "type": "tool", "name": "tool_name", "tool_call_id": "...", "content": "..." }

// System message
{ "type": "system", "content": "..." }
```

AI messages without `tool_calls` (or with an empty array) are treated as final responses. Their `content` is parsed as JSON and the `output` object is used to extract:
- `output.text` — the response text displayed to the user
- `output.request_category` — shown as a badge
- `output.request_type` — shown as a badge
- `output.identity_verified` — shown as a green "verified" badge
- `output.end_conversation` — shown as a red "end" badge

## Edge Functions

### `chat-feedback`

The `chat-feedback` Edge Function is deployed separately from the frontend. It is invoked by the frontend as `chat-feedback` (the deployed Supabase slug matches the folder name).

#### Deploy

```bash
supabase functions deploy chat-feedback
```

#### Required Secrets (set in Supabase Dashboard → Edge Functions → Secrets)

| Secret | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Auto | Provided automatically by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Provided automatically by Supabase |
| `VA_FEEDBACK_FORM_WEBHOOK` | Optional | n8n webhook URL for forwarding feedback |

The Edge Function:
1. Inserts feedback into `chat_feedback` using the service role key (bypasses RLS)
2. Optionally forwards the full payload to an n8n webhook

### `invite-user`

Admin-only function that sends a Supabase invitation email and upserts a role row in `chat_view_user_roles`.

#### Deploy

```bash
supabase functions deploy invite-user
```

#### Required Secrets (set in Supabase Dashboard → Edge Functions → Secrets)

| Secret | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Auto | Provided automatically by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Provided automatically by Supabase |
| `SUPABASE_ANON_KEY` | **Manual** | Required to verify caller's JWT — copy from Dashboard → Project Settings → API |

The Edge Function:
1. Verifies the caller's JWT and confirms they have `admin` role in `chat_view_user_roles`
2. Calls `auth.admin.inviteUserByEmail(email)` to send an invitation email
3. If the user already exists in Auth, looks them up via the Admin REST API and updates their role
4. Upserts the assigned role row in `chat_view_user_roles`

## Key Code Conventions

### JavaScript (app.js)

- **No framework** — plain DOM manipulation with `document.createElement`, `innerHTML`, `addEventListener`
- **Module pattern** — IIFE `init()` runs on load; no ES modules
- **Global state** — `db`, `allSessions`, `allToolNames`, `allCategories`, `allRequestTypes`, `currentSessionId`, `feedbackMeta`, `reviewedSessions`, `environments`, `currentUserRole` (`'user' | 'admin' | null`) are top-level variables
- **XSS prevention** — all user-supplied or database-sourced text is passed through `escapeHtml()` before setting `innerHTML`. Never set `innerHTML` with raw data.
- **Pagination** — `loadSessions()` fetches `chat_messages` in pages of 1000 rows using `.range(from, from + pageSize - 1)`
- **Timezone** — All dates displayed in `'Europe/Chisinau'` timezone (hardcoded constant `TIME_ZONE` near the bottom of `app.js`)
- **Error handling** — connection errors shown in `#login-error`; message errors logged to console
- **Status log** — `logStatus()` is a no-op that writes to `console.log` only; the visible status log was removed from the login UI

### CSS (index.html)

- All styles are in a single `<style>` block in `index.html`
- CSS custom properties (variables) defined in `:root` control the color palette
- WhatsApp-inspired design: white left bubbles for customers, green right bubbles for AI, yellow center bubbles for tool calls
- Responsive breakpoint at `768px` (mobile: sidebar overlays)

### HTML Structure

- Two top-level panels: `#login-panel` (flex, visible by default) and `#chat-panel` (hidden until connected, shown via `.active` class)
- Inside `#chat-panel`:
  - `#sidebar` — session list, search, filters; sidebar header contains the **Sessions** title, a pulsing `• Live` badge, and an **Invite** button (`#admin-settings-btn`, hidden for non-admins, shown only for `admin` role users)
  - `.chat-area` — wraps the header bar and `#chat-main`:
    - `#chat-header-bar` — permanent header with `#chat-session-controls` (left, session-specific) and `.chat-header-right` (right: Refresh, user name, Logout)
    - `#chat-main` — scrollable message area; wiped and repopulated on session switch
- `app.js` is loaded with a cache-busting query param (`?v=19`) — increment this when deploying changes
- Login panel contains only the "Sign in with Google" button and `#login-error`; no credential input fields, no status log

## Filtering Logic

Session filtering in `renderSessionList()`:
- **Text search** — substring match on `session_id`
- **Date range** — session is included if it overlaps the selected range (uses `earliest` and `latest` timestamps)
- **Message count** — inclusive min/max filter on `session.count`
- **Tools** — session must contain **all** selected tools (AND logic)
- **Categories** — session must match **at least one** selected category (OR logic)
- **Request types** — session must match **at least one** selected request type (OR logic)
- **Reviewed** — `all` (no filter) / `reviewed` (only sessions in `reviewedSessions`) / `unreviewed` (only sessions not in the set)

## Mark as Reviewed

Reviewed state is managed client-side (no database writes):
- `reviewedSessions` — a `Set<string>` of reviewed session IDs, kept in memory
- Stored in `localStorage` as a JSON array under key `sb_reviewed_<projectId>` (separate per project)
- Loaded in `loadReviewed()` called during `init()` and `handleRefresh()`
- Toggled via `toggleReviewed(sessionId)` from the "Mark Reviewed" button in the chat header
- Sessions in the set show a `reviewed` badge in the session list and a highlighted "Reviewed ✓" button

## Common Gotchas

1. **Edge function slug**: The file is `supabase/functions/chat-feedback/` and the frontend calls `db.functions.invoke('chat-feedback', ...)`. The deployed Supabase slug must match — if you redeploy under a different name, update the `invoke` call in `submitFeedback()` (`app.js`) accordingly.

2. **Cache-busting**: `app.js` is loaded as `app.js?v=19`. Increment the version number when deploying updated `app.js` to avoid browsers serving stale cached versions. Forgetting this has caused runtime errors when HTML and JS are out of sync (e.g. removing a DOM element that old JS still references).

3. **config.js is required**: The login UI has no manual credential input fields. If `config.js` is absent and no credentials are saved in `localStorage`, the Google sign-in button will display an error. Always deploy `config.js` alongside `index.html`. Use the multi-env `environments` array format to expose a named dropdown for multiple Supabase projects.

4. **Empty tool_calls array**: AI messages with `tool_calls: []` (empty array) are treated the same as AI messages with no `tool_calls` field at all — they are rendered as final AI responses, not as tool call bubbles.

5. **RLS policies**: The app uses the anon key. If Supabase Row Level Security restricts `chat_messages`, the app will connect successfully but show 0 sessions. The `chat_feedback` table bypasses RLS via the Edge Function's service role key.

6. **Content parsing**: `message.content` in `chat_messages` may be either a string (requiring `JSON.parse`) or already a parsed object. The code handles both cases in `parseMessage()`.

7. **chat-header-bar lives outside chat-main**: `#chat-header-bar` is a sibling of `#chat-main`, not a child. This means it survives `chatMain.innerHTML = ''` calls during session switches and logout. Do not move it inside `#chat-main`.

8. **`chat_view_user_roles` must exist before first login**: `fetchOrCreateUserRole()` is called on every auth success. If the table is missing, all users are immediately signed out with an "Access denied" error. Run the `create_user_roles.sql` migration before deploying.

## Development Workflow

Since there is no build step:

1. Edit `index.html` (for HTML structure or CSS changes) or `app.js` (for logic changes)
2. Reload the browser
3. Increment the `?v=N` cache-busting param in `index.html` when deploying

For Edge Function changes:
1. Edit `supabase/functions/chat-feedback/index.ts`
2. Deploy: `supabase functions deploy chat-feedback`

For `invite-user` Edge Function changes:
1. Edit `supabase/functions/invite-user/index.ts`
2. Deploy: `supabase functions deploy invite-user`

## Git

- Default branch: `main`
- No CI/CD pipelines
- Remote: Gitea instance via local proxy (forwards to GitHub)
- **Branch creation policy**: Before creating a new branch, always ask the user for confirmation unless explicitly instructed to do so upfront.
