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
- [ ] **Google OAuth + Admin Control Panel** — Replace manual credential entry with Google OAuth sign-in (required domain restriction via `CONFIG.ALLOWED_DOMAIN`). Add admin panel for managing user roles (`admin` / `user`). Requires `user_roles` table in Supabase (see SQL in "Database Setup: user_roles" section below). CONFIG object in `app.js` allows hardcoding Supabase URL + Anon Key to hide manual fields. Admin panel accessible only to `admin` role users via sidebar button.
  - [ ] Add `CONFIG` object to `app.js` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_DOMAIN`
  - [ ] Add Google sign-in button with SVG logo to login panel
  - [ ] Add `#manual-login-section` wrapper + `#auth-divider` for conditional display
  - [ ] Rewrite `init()` to handle CONFIG-based auto-connect and OAuth redirect session
  - [ ] Implement `handleGoogleSignIn()` — triggers OAuth with `hd` domain param
  - [ ] Implement `handleAuthSuccess(session)` — domain check (required), role fetch, UI switch
  - [ ] Implement `handleSignOut()` — clears auth session + local state
  - [ ] Add admin overlay HTML + CSS (modal with user table, role dropdowns)
  - [ ] Implement `openAdminPanel()`, `handleRoleChange()`, `closeAdminPanel()`
  - [ ] Add `user-email-display`, `admin-btn`, `signout-btn` to sidebar header
  - [ ] Create `user_roles` table + RLS policies + trigger in Supabase (SQL provided below)
  - [ ] Bump `app.js?v=9` → `app.js?v=10`
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

---

## Database Setup: user_roles

Required SQL for the Google OAuth + Admin Control Panel feature. Run in Supabase SQL Editor.

### Table

```sql
CREATE TABLE user_roles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
```

### RLS Policies

```sql
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users can read their own role
CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can read all roles
CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Admins can update roles
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
```

### Trigger: auto-create role on signup (first user = admin)

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN (SELECT count(*) FROM public.user_roles) = 0 THEN 'admin' ELSE 'user' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```
