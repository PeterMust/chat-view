# FEATURES.md — Chat View

Tracks implemented features and the todo list for future work.
Update this file whenever a feature is added, changed, or completed.

---

## Implemented Features

### Authentication & Connection
- [x] Login form with Supabase Project ID + Anon Key fields
- [x] Credentials persisted in `localStorage` (`sb_project_id`, `sb_key`) and pre-filled on next visit
- [x] Connection test with 10-second timeout before switching to chat view
- [x] Verbose status log shown during connection (timestamped, scrollable)
- [x] Clear error messages for failed connections (timeout, bad credentials, RLS)
- [x] Disconnect button clears credentials and returns to login screen
- [x] Enter key submits login form

### Session List
- [x] All sessions loaded via paginated fetching (1000 rows/page) to handle large tables
- [x] Sessions grouped by `session_id`, sorted newest-first by default
- [x] Each session shows: ID, total message count, latest date, type-count pills, metadata badges
- [x] Type-count pills: human / ai / tool / system message counts per session
- [x] Metadata badges per session: request category, request type, "verified", "end" flags
- [x] Refresh button reloads all sessions from the database

### Filtering & Search
- [x] Text search: substring match on `session_id`
- [x] Date range filter (from/to), inclusive of full "to" day
- [x] Message count filter (min/max)
- [x] Tools filter: multi-select, AND logic (session must use ALL selected tools)
- [x] Category filter: multi-select, OR logic (session matches any selected category)
- [x] Request type filter: multi-select, OR logic (session matches any selected request type)
- [x] Sort: newest, oldest, most messages, fewest messages
- [x] Clear filters button resets all filter inputs
- [x] Session count shown ("N sessions" / "N sessions found" when filtered)
- [x] Collapsible filter panel (toggle open/closed)

### Message View
- [x] Messages loaded on session click, ordered by `created_at` ascending
- [x] Loading spinner while messages fetch
- [x] Chat header shows: session ID, total message count, type-count pills, Feedback button
- [x] Messages scroll to bottom on load
- [x] Human (customer) messages: white left-aligned bubbles
- [x] AI final response messages: green right-aligned bubbles with metadata badges
- [x] AI tool-call messages: yellow center bubbles with collapsible args
- [x] Tool result messages: yellow center bubbles with collapsible response
- [x] System messages: compact centered pill-style bubbles
- [x] All message bubbles show formatted timestamp (Europe/Chisinau timezone)
- [x] XSS protection: all database content passed through `escapeHtml()` before rendering

### Feedback System
- [x] Per-session feedback: "Feedback" button in chat header
- [x] Per-message feedback: hover button (💬) on every message bubble
- [x] Feedback modal with category select (bug / suggestion / praise / other) and free-text comment
- [x] Feedback submitted to Supabase Edge Function (`hyper-processor`) with full message metadata
- [x] Edge Function stores feedback in `chat_feedback` table (service role key bypasses RLS)
- [x] Edge Function optionally forwards feedback to n8n webhook (`VA_FEEDBACK_FORM_WEBHOOK`)
- [x] Success/error status shown in modal after submission
- [x] Modal closes automatically 1.5s after successful submission
- [x] Click outside modal to cancel

### UI / UX
- [x] WhatsApp-inspired design with CSS custom properties for theming
- [x] Responsive layout: sidebar overlays at ≤768px
- [x] Collapsible tool call / tool result details (`<details>` element)
- [x] Cache-busting query param on `app.js` (`?v=9`) — increment when deploying
- [x] Global JS error handler shows errors on the login screen
- [x] CDN load error handler for Supabase library

---

## Todo

### High Priority
- [ ] **Configurable timezone** — currently hardcoded to `Europe/Chisinau`; let user pick from a dropdown or detect from browser
- [ ] **Filter by verified / end-conversation flags** — two boolean session properties not yet exposed in filters
- [ ] **Keyboard navigation** — arrow keys to move between sessions in the list; Escape to close modal

### Medium Priority
- [ ] **Copy message text** — a copy-to-clipboard button on each message bubble
- [ ] **Export conversation** — download current session as JSON, plain text, or CSV
- [ ] **Search highlight** — highlight the matching substring when text-searching sessions
- [ ] **Mark session as reviewed** — local flag (localStorage) to visually distinguish sessions you have already checked
- [ ] **Permalink / shareable URL** — encode project ID + session ID in the URL hash so a specific session can be bookmarked or shared (anon key would still need to be entered manually for security)

### Low Priority / Nice to Have
- [ ] **Dark mode** — toggle using CSS custom properties; respect `prefers-color-scheme`
- [ ] **Statistics panel** — aggregate view: total sessions, messages per day chart, top tools, category breakdown
- [ ] **Session notes** — free-text annotation saved to localStorage (or a new `session_notes` table)
- [ ] **Collapse system messages** — option to hide system messages from the conversation view
- [ ] **Token / character count** — show rough size of AI responses and total conversation length
- [ ] **Configurable table name** — currently hardcoded to `chat_messages`; could be a login-screen option for multi-tenant setups
- [ ] **Infinite scroll for sessions** — currently all sessions are loaded into memory at once; could lazy-render the list for very large datasets
