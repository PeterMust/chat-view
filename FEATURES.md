# FEATURES.md — Chat View

Tracks implemented features and the todo list for future work.
Update this file whenever a feature is added, changed, or completed.

---

## Implemented Features

### Authentication & Connection
- [x] Google OAuth sign-in via Supabase Auth (no manual credential input fields)
- [x] Credentials (`projectId`, `anonKey`) loaded from `config.js` (`window.CHAT_VIEW_CONFIG`) or `localStorage`
- [x] Credentials persisted in `localStorage` (`sb_project_id`, `sb_key`) across page reloads and OAuth redirects
- [x] Session restored automatically on page load if a valid Supabase session exists
- [x] Optional domain restriction via `config.js` `allowedDomains` array — sign-out forced if domain not allowed
- [x] Connection test with 10-second timeout before switching to chat view
- [x] Clear error messages for failed connections (timeout, bad credentials, RLS, domain restriction)
- [x] Logout button clears auth session and returns to login screen
- [x] Login card shows only the Google sign-in button and an error area (no credential fields, no status log)

### Navigation & Header
- [x] Permanent chat header bar (`#chat-header-bar`) outside `#chat-main`, always visible after login
- [x] Right side of chat header: Refresh button, signed-in user name, Logout button — always present
- [x] Left side of chat header (`#chat-session-controls`): session-specific controls populated when a session is selected:
  - Mark Reviewed / Reviewed ✓ toggle button
  - Feedback button
  - Session ID
  - Total message count
  - Type-count pills (human / ai / tool / system)
- [x] Sidebar header shows only the `Sessions` title and pulsing `• Live` badge

### Session List
- [x] All sessions loaded via paginated fetching (1000 rows/page) to handle large tables
- [x] Sessions grouped by `session_id`, sorted by selected sort order
- [x] Each session shows: ID, total message count, latest date, type-count pills, metadata badges
- [x] Type-count pills: human / ai / tool / system message counts per session
- [x] Metadata badges per session: request category, request type, `verified`, `end`, `reviewed` flags
- [x] Refresh button reloads all sessions from the database
- [x] Realtime updates: new messages and sessions appear automatically via Supabase Realtime (INSERT events)
- [x] Pulsing `• Live` badge shown in sidebar header when Realtime channel is active (`SUBSCRIBED`)
- [x] Filters and sort order preserved across realtime updates and manual refreshes

### Mark as Reviewed
- [x] "Mark Reviewed" button in the chat header toggles reviewed state for the open session
- [x] Reviewed sessions show a `reviewed` badge in the session list
- [x] Reviewed state stored in `localStorage` (key `sb_reviewed_<projectId>`, persisted as JSON array)
- [x] Reviewed state loaded on init and on every refresh

### Filtering & Search
- [x] Text search: substring match on `session_id`
- [x] Date range filter (from/to), inclusive of the full "to" day
- [x] Message count filter (min/max), inclusive
- [x] Tools filter: multi-select dropdown+checklist, AND logic (session must use ALL selected tools)
- [x] Category filter: multi-select dropdown+checklist, OR logic (session matches any selected category)
- [x] Request type filter: multi-select dropdown+checklist, OR logic (session matches any selected type)
- [x] Reviewed filter: all / unreviewed only / reviewed only
- [x] Sort: newest first, oldest first, most messages, fewest messages
- [x] Clear filters button resets all filter inputs
- [x] Session count shown ("N sessions" or "N of M sessions" when filters are active)
- [x] Collapsible filter panel (toggle open/closed)
- [x] Custom dropdown+checklist UI for tools, category, and request type:
  - Trigger button label updates to show count of selected items (e.g. "Tools (2)")
  - Clicking outside any open dropdown closes it; opening one closes the others
  - Checked state preserved when realtime updates rebuild dropdown options

### Message View
- [x] Messages loaded on session click, ordered by `created_at` ascending
- [x] Loading spinner while messages fetch
- [x] Messages scroll to bottom on load
- [x] Human (customer) messages: white left-aligned bubbles
- [x] AI final response messages: green right-aligned bubbles with metadata badges (category, type, verified, end)
- [x] AI tool-call messages: yellow center bubbles with collapsible args (`<details>`)
- [x] Tool result messages: yellow center bubbles with collapsible response (`<details>`)
- [x] System messages: compact centered pill-style bubbles
- [x] All message bubbles show formatted timestamp (Europe/Chisinau timezone)
- [x] Realtime: new messages appended live when the currently viewed session receives an INSERT
- [x] XSS protection: all database content passed through `escapeHtml()` before rendering

### Feedback System
- [x] Per-session feedback: "Feedback" button in chat header session controls
- [x] Per-message feedback: hover button (💬) on every message bubble
- [x] Feedback modal with category select (bug / suggestion / praise / other) and free-text comment
- [x] Feedback submitted to Supabase Edge Function (`hyper-processor`) with full message metadata and signed-in user email
- [x] Edge Function stores feedback in `chat_feedback` table (service role key bypasses RLS)
- [x] Edge Function optionally forwards feedback to n8n webhook (`VA_FEEDBACK_FORM_WEBHOOK`)
- [x] Success/error status shown in modal after submission
- [x] Modal closes automatically 1.5s after successful submission
- [x] Click outside modal to cancel

### UI / UX
- [x] WhatsApp-inspired design with CSS custom properties for theming
- [x] Responsive layout: sidebar overlays at ≤768px
- [x] Collapsible tool call / tool result details (`<details>` element)
- [x] Cache-busting query param on `app.js` (`?v=17`) — increment when deploying
- [x] Global JS error handler shows errors in the browser console
- [x] CDN load error handler for Supabase library (error shown in `#login-error`)

---

## Todo

### High Priority
- [ ] **Configurable timezone** — currently hardcoded to `Europe/Chisinau`; let user pick from a dropdown or detect from browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
- [ ] **Filter by verified / end-conversation flags** — two boolean session properties visible as badges but not yet exposed as filter options

### Medium Priority
- [ ] **Keyboard navigation** — arrow keys to move between sessions in the list; Escape to close feedback modal

### Low Priority / Nice to Have
- [ ] **Export** — download a session's messages as JSON or plain text
- [ ] **Session notes** — let users add a private text note to a session, stored in localStorage alongside reviewed state
