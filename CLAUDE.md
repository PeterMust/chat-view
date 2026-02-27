# CLAUDE.md — Chat View

This file provides context for AI assistants working in this repository.

## Project Overview

**Chat View** is a single-page web application for viewing AI chat conversations stored in a Supabase (PostgreSQL) database. It presents sessions in a WhatsApp-style interface, with per-session and per-message feedback capabilities.

The application is a zero-build-step frontend: open `index.html` in a browser and it works. There are no npm scripts, no bundlers, and no test runner.

## Repository Structure

```
chat-view/
├── index.html                              # Single-page app (HTML + all CSS)
├── app.js                                  # All application logic (~900 lines)
├── favicon.svg                             # Eyes emoji favicon
└── supabase/
    ├── functions/
    │   └── chat-feedback/
    │       └── index.ts                    # Deno Edge Function: store & forward feedback
    └── migrations/
        └── create_chat_feedback.sql        # DB schema for feedback table
```

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES2020+), HTML5, CSS |
| Database | Supabase (PostgreSQL) |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
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

**Login screen requires:**
- **Project ID** — the subdomain of your Supabase project (e.g. `abcdefghij` from `abcdefghij.supabase.co`)
- **Anon Key** — the public anon key from Supabase Dashboard → Project Settings → API

Credentials are saved in `localStorage` under `sb_project_id` and `sb_key`.

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

Run the migration on your Supabase project:
```bash
supabase db push
# or apply manually via Supabase SQL Editor
```

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

## Edge Function

The `chat-feedback` Edge Function is deployed separately from the frontend. It is invoked by the frontend as `hyper-processor` (note: the function name in the Supabase deployment is `hyper-processor`, not `chat-feedback`).

### Deploy

```bash
supabase functions deploy chat-feedback --no-verify-jwt
```

### Required Secrets (set in Supabase Dashboard → Edge Functions → Secrets)

| Secret | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Auto | Provided automatically by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Provided automatically by Supabase |
| `VA_FEEDBACK_FORM_WEBHOOK` | Optional | n8n webhook URL for forwarding feedback |

The Edge Function:
1. Inserts feedback into `chat_feedback` using the service role key (bypasses RLS)
2. Optionally forwards the full payload to an n8n webhook

## Key Code Conventions

### JavaScript (app.js)

- **No framework** — plain DOM manipulation with `document.createElement`, `innerHTML`, `addEventListener`
- **Module pattern** — IIFE `init()` runs on load; no ES modules
- **Global state** — `db`, `allSessions`, `allToolNames`, `allCategories`, `allRequestTypes`, `currentSessionId`, `feedbackMeta` are top-level variables
- **XSS prevention** — all user-supplied or database-sourced text is passed through `escapeHtml()` before setting `innerHTML`. Never set `innerHTML` with raw data.
- **Pagination** — `loadSessions()` fetches `chat_messages` in pages of 1000 rows using `.range(from, from + pageSize - 1)`
- **Timezone** — All dates displayed in `'Europe/Chisinau'` timezone (hardcoded constant `TIME_ZONE` at `app.js:883`)
- **Error handling** — connection errors shown in `#status-log` during login; message errors logged to console

### CSS (index.html)

- All styles are in a single `<style>` block in `index.html`
- CSS custom properties (variables) defined in `:root` control the color palette
- WhatsApp-inspired design: white left bubbles for customers, green right bubbles for AI, yellow center bubbles for tool calls
- Responsive breakpoint at `768px` (mobile: sidebar overlays)

### HTML Structure

- Two top-level panels: `#login-panel` (flex, visible by default) and `#chat-panel` (hidden until connected, shown via `.active` class)
- `app.js` is loaded with a cache-busting query param (`?v=9`) — increment this when deploying changes

## Filtering Logic

Session filtering in `renderSessionList()`:
- **Text search** — substring match on `session_id`
- **Date range** — session is included if it overlaps the selected range (uses `earliest` and `latest` timestamps)
- **Message count** — inclusive min/max filter on `session.count`
- **Tools** — session must contain **all** selected tools (AND logic)
- **Categories** — session must match **at least one** selected category (OR logic)
- **Request types** — session must match **at least one** selected request type (OR logic)

## Common Gotchas

1. **Edge function name mismatch**: The file is `supabase/functions/chat-feedback/` but the frontend calls `db.functions.invoke('hyper-processor', ...)`. Ensure the deployed function name on Supabase matches `hyper-processor`.

2. **cache-busting**: `app.js` is loaded as `app.js?v=9`. Increment the version number when deploying updated `app.js` to avoid browsers serving stale cached versions.

3. **Empty tool_calls array**: AI messages with `tool_calls: []` (empty array) are treated the same as AI messages with no `tool_calls` field at all — they are rendered as final AI responses, not as tool call bubbles.

4. **RLS policies**: The app uses the anon key. If Supabase Row Level Security restricts `chat_messages`, the app will connect successfully but show 0 sessions. The `chat_feedback` table bypasses RLS via the Edge Function's service role key.

5. **Content parsing**: `message.content` in `chat_messages` may be either a string (requiring `JSON.parse`) or already a parsed object. The code handles both cases in `parseMessage()`.

## Development Workflow

Since there is no build step:

1. Edit `index.html` (for HTML structure or CSS changes) or `app.js` (for logic changes)
2. Reload the browser
3. Increment the `?v=N` cache-busting param in `index.html` when deploying

For Edge Function changes:
1. Edit `supabase/functions/chat-feedback/index.ts`
2. Deploy: `supabase functions deploy chat-feedback --no-verify-jwt`

## Git

- Default branch: `master`
- No CI/CD pipelines
- Remote: Gitea instance via local proxy
