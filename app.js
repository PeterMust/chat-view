// ── State ──
let db = null;
let allSessions = [];
let allToolNames = []; // unique tool names across all sessions
let allCategories = []; // unique request categories
let allRequestTypes = []; // unique request types
let currentSessionId = null;
let realtimeChannel = null;
let environments = []; // parsed from window.CHAT_VIEW_CONFIG

// ── DOM Elements ──
const loginPanel = document.getElementById('login-panel');
const chatPanel = document.getElementById('chat-panel');
const connectBtn = document.getElementById('connect-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const userBadge = document.getElementById('user-badge');
const refreshBtn = document.getElementById('refresh-btn');
const sessionSearch = document.getElementById('session-search');
const sessionCount = document.getElementById('session-count');
const sessionList = document.getElementById('session-list');
const chatMain = document.getElementById('chat-main');
const chatEmpty = document.getElementById('chat-empty');
const filterToggle = document.getElementById('filter-toggle');
const filterPanel = document.getElementById('filter-panel');
const filterDateFrom = document.getElementById('filter-date-from');
const filterDateTo = document.getElementById('filter-date-to');
const filterMsgMin = document.getElementById('filter-msg-min');
const filterMsgMax = document.getElementById('filter-msg-max');
const filterToolsTrigger = document.getElementById('filter-tools-trigger');
const filterToolsPanel = document.getElementById('filter-tools-panel');
const filterSort = document.getElementById('filter-sort');
const filterCategoryTrigger = document.getElementById('filter-category-trigger');
const filterCategoryPanel = document.getElementById('filter-category-panel');
const filterRequestTypeTrigger = document.getElementById('filter-request-type-trigger');
const filterRequestTypePanel = document.getElementById('filter-request-type-panel');
const filterReviewed = document.getElementById('filter-reviewed');
const filterClear = document.getElementById('filter-clear');
const feedbackOverlay = document.getElementById('feedback-overlay');
const fbSubtitle = document.getElementById('fb-subtitle');
const fbCategory = document.getElementById('fb-category');
const fbComment = document.getElementById('fb-comment');
const fbCancel = document.getElementById('fb-cancel');
const fbSubmit = document.getElementById('fb-submit');
const fbStatus = document.getElementById('fb-status');
const fbUserName = document.getElementById('fb-user-name');
const liveBadge = document.getElementById('live-badge');
const envSelect = document.getElementById('env-select');
const envSelectorWrap = document.getElementById('env-selector-wrap');

// Hidden metadata for the currently open feedback form
let feedbackMeta = {};
let reviewedSessions = new Set();
let currentUser = null; // { id, email, name } — set after Google sign-in

console.log('[app.js] Script loaded. Supabase available:', !!(window.supabase && window.supabase.createClient));

// ── Init ──
(async function init() {
  connectBtn.addEventListener('click', handleGoogleSignIn);
  logoutBtn.addEventListener('click', handleLogout);
  refreshBtn.addEventListener('click', handleRefresh);
  sessionSearch.addEventListener('input', renderSessionList);

  // Filter controls
  filterToggle.addEventListener('click', () => {
    filterToggle.classList.toggle('open');
    filterPanel.classList.toggle('open');
  });
  filterDateFrom.addEventListener('change', renderSessionList);
  filterDateTo.addEventListener('change', renderSessionList);
  filterMsgMin.addEventListener('input', renderSessionList);
  filterMsgMax.addEventListener('input', renderSessionList);
  filterSort.addEventListener('change', renderSessionList);
  filterReviewed.addEventListener('change', renderSessionList);

  // Dropdown checklist toggle + click-outside
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.dd-trigger');
    if (trigger) {
      const panel = trigger.nextElementSibling;
      const isOpen = panel.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) { panel.classList.add('open'); trigger.classList.add('active'); }
      return;
    }
    if (!e.target.closest('.dd-filter')) closeAllDropdowns();
  });
  filterClear.addEventListener('click', clearFilters);

  // Feedback modal
  fbCancel.addEventListener('click', closeFeedbackModal);
  fbSubmit.addEventListener('click', submitFeedback);
  feedbackOverlay.addEventListener('click', (e) => {
    if (e.target === feedbackOverlay) closeFeedbackModal();
  });

  // ── Build environments list from config ──
  const cfg = window.CHAT_VIEW_CONFIG || {};
  if (Array.isArray(cfg.environments) && cfg.environments.length > 0) {
    environments = cfg.environments;
  } else if (cfg.projectId && cfg.anonKey) {
    // Backward compat: single-env format
    environments = [{ name: 'Default', projectId: cfg.projectId, anonKey: cfg.anonKey, allowedDomains: cfg.allowedDomains || [] }];
  }

  // ── Populate environment selector dropdown ──
  if (environments.length > 1) {
    envSelect.innerHTML = '';
    environments.forEach((env, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = env.name || ('Environment ' + (i + 1));
      envSelect.appendChild(opt);
    });
    if (envSelectorWrap) envSelectorWrap.style.display = '';
  } else {
    if (envSelectorWrap) envSelectorWrap.style.display = 'none';
    if (environments.length === 1) {
      const opt = document.createElement('option');
      opt.value = 0;
      opt.textContent = environments[0].name || 'Default';
      envSelect.appendChild(opt);
    }
  }

  // ── Try to restore session from config / localStorage ──
  const savedEnvIdx = parseInt(localStorage.getItem('sb_selected_env') || '0', 10);
  const projectId = localStorage.getItem('sb_project_id');
  const key = localStorage.getItem('sb_key');

  // Restore dropdown selection to match the saved environment
  if (envSelect && !isNaN(savedEnvIdx) && savedEnvIdx < environments.length) {
    envSelect.value = savedEnvIdx;
  }

  if (projectId && key && window.supabase && window.supabase.createClient) {
    initSupabaseClient(projectId, key);
    const { data: { session } } = await db.auth.getSession();
    if (session && session.user) {
      await afterAuthSuccess(session.user);
      return;
    }
  }

  console.log('[app.js] Init complete. Showing login panel.');
})();

// ── Connection ──
function initSupabaseClient(projectId, key) {
  const url = 'https://' + projectId + '.supabase.co';
  db = window.supabase.createClient(url, key);
}

async function handleGoogleSignIn() {
  if (!window.supabase || !window.supabase.createClient) {
    showLoginError('Supabase library failed to load. Check your network or ad blocker.');
    return;
  }

  const selectedIdx = envSelect ? parseInt(envSelect.value || '0', 10) : 0;
  const selectedEnv = environments[selectedIdx] || environments[0];

  let projectId, key;
  if (selectedEnv) {
    projectId = selectedEnv.projectId;
    key = selectedEnv.anonKey;
  }

  if (!projectId || !key) {
    showLoginError('No Supabase credentials configured. Please provide a config.js with projectId and anonKey.');
    return;
  }

  // Save credentials and selected env index so they survive the OAuth redirect
  localStorage.setItem('sb_project_id', projectId);
  localStorage.setItem('sb_key', key);
  localStorage.setItem('sb_selected_env', selectedIdx);

  hideLoginError();
  connectBtn.disabled = true;
  connectBtn.textContent = 'Redirecting to Google...';

  initSupabaseClient(projectId, key);

  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });

  if (error) {
    showLoginError('Failed to start Google sign-in: ' + error.message);
    connectBtn.disabled = false;
    connectBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Sign in with Google';
    db = null;
  }
  // On success the browser navigates away; no further code runs here.
}

async function afterAuthSuccess(user) {
  const savedEnvIdx = parseInt(localStorage.getItem('sb_selected_env') || '0', 10);
  const activeEnv = environments[savedEnvIdx] || environments[0] || {};
  const allowedDomains = Array.isArray(activeEnv.allowedDomains) ? activeEnv.allowedDomains : [];

  if (allowedDomains.length > 0) {
    const domain = (user.email || '').split('@')[1] || '';
    if (!allowedDomains.includes(domain)) {
      await db.auth.signOut();
      db = null;
      showLoginError('Access restricted. Only accounts from ' + allowedDomains.join(', ') + ' are allowed.');
      return;
    }
  }

  currentUser = {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || '',
  };

  if (userBadge) userBadge.textContent = currentUser.name;

  hideLoginError();
  clearStatusLog();
  logStatus('Signed in as ' + currentUser.email + '. Loading sessions...');

  connectBtn.disabled = true;
  connectBtn.textContent = 'Loading...';

  try {
    const testPromise = db
      .from('chat_messages')
      .select('id', { count: 'exact', head: true });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out after 10s. Check your Project ID.')), 10000)
    );
    const { count, error } = await Promise.race([testPromise, timeoutPromise]);

    if (error) {
      logStatus('ERROR from Supabase: ' + JSON.stringify(error));
      throw error;
    }
    logStatus('Connection OK. Row count: ' + (count !== null ? count : 'unknown (RLS may hide count)'));

    logStatus('Loading sessions...');
    const sessions = await loadSessions();

    if (sessions === false) {
      logStatus('Failed to load sessions. Staying on login screen.');
      db = null;
      currentUser = null;
      return;
    }

    if (allSessions.length === 0) {
      logStatus('Connected but no sessions found. Table may be empty or restricted by RLS.');
      showLoginError('Connected successfully, but no sessions found. The chat_messages table may be empty or restricted by RLS policies.');
      db = null;
      currentUser = null;
      return;
    }

    logStatus('Loaded ' + allSessions.length + ' sessions. Switching to chat view...');
    loadReviewed();

    loginPanel.style.display = 'none';
    chatPanel.classList.add('active');
    populateFilters();
    renderSessionList();
    subscribeRealtime();
  } catch (err) {
    logStatus('FAILED: ' + (err.message || String(err)));
    showLoginError('Connection failed: ' + (err.message || 'Check your credentials.'));
    db = null;
    currentUser = null;
  } finally {
    connectBtn.disabled = false;
    connectBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Sign in with Google';
  }
}

async function handleLogout() {
  if (db) {
    await db.auth.signOut().catch(() => {});
  }
  localStorage.removeItem('sb_project_id');
  localStorage.removeItem('sb_key');
  localStorage.removeItem('sb_selected_env');
  unsubscribeRealtime();
  db = null;
  currentUser = null;
  allSessions = [];
  currentSessionId = null;
  reviewedSessions = new Set();
  if (userBadge) userBadge.textContent = '';
  const sc = document.getElementById('chat-session-controls');
  if (sc) sc.innerHTML = '';
  chatPanel.classList.remove('active');
  loginPanel.style.display = 'flex';
  sessionList.innerHTML = '';
  chatMain.innerHTML = '<div class="chat-empty">Select a session to view the conversation</div>';
}

async function handleRefresh() {
  if (!db) return;
  unsubscribeRealtime();
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Refreshing...';
  sessionCount.textContent = 'Refreshing sessions...';
  await loadSessions();
  if (allSessions.length > 0) {
    populateFilters();
    renderSessionList();
  } else {
    sessionCount.textContent = 'No sessions found.';
  }
  refreshBtn.disabled = false;
  refreshBtn.textContent = 'Refresh';
  subscribeRealtime();
}

// ── Realtime ──
function subscribeRealtime() {
  if (!db || realtimeChannel) return;
  realtimeChannel = db.channel('chat-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, handleRealtimeInsert)
    .subscribe((status) => {
      liveBadge.classList.toggle('active', status === 'SUBSCRIBED');
    });
}

function unsubscribeRealtime() {
  if (realtimeChannel && db) db.removeChannel(realtimeChannel);
  realtimeChannel = null;
  liveBadge.classList.remove('active');
}

function handleRealtimeInsert(payload) {
  const row = payload.new;
  if (!row || !row.session_id) return;
  const { session_id: sid, created_at: ts, message: rawMsg } = row;

  let msg = null;
  try { msg = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg; } catch (e) {}

  let session = allSessions.find((s) => s.id === sid);
  if (!session) {
    session = {
      id: sid, count: 0, latest: ts, earliest: ts,
      tools: [], typeCounts: { human: 0, ai: 0, tool: 0, system: 0 },
      categories: [], requestTypes: [], hasVerified: false, hasEndConversation: false,
    };
    allSessions.push(session);
  }

  session.count++;
  if (ts > session.latest) session.latest = ts;
  if (ts < session.earliest) session.earliest = ts;

  if (msg) {
    const t = msg.type;
    if (t in session.typeCounts) session.typeCounts[t]++;

    if (msg.tool_calls && msg.tool_calls.length) {
      for (const tc of msg.tool_calls) {
        if (tc.name && !session.tools.includes(tc.name)) session.tools.push(tc.name);
        if (tc.name && !allToolNames.includes(tc.name)) { allToolNames.push(tc.name); allToolNames.sort(); }
      }
    }
    if (t === 'tool' && msg.name) {
      if (!session.tools.includes(msg.name)) session.tools.push(msg.name);
      if (!allToolNames.includes(msg.name)) { allToolNames.push(msg.name); allToolNames.sort(); }
    }

    if (t === 'ai' && !(msg.tool_calls && msg.tool_calls.length)) {
      let c = msg.content;
      try { if (typeof c === 'string') c = JSON.parse(c); } catch (e) { c = null; }
      if (c && c.output) {
        const { request_category: cat, request_type: rtype, identity_verified, end_conversation } = c.output;
        if (cat && !session.categories.includes(cat)) session.categories.push(cat);
        if (cat && !allCategories.includes(cat)) { allCategories.push(cat); allCategories.sort(); }
        if (rtype && !session.requestTypes.includes(rtype)) session.requestTypes.push(rtype);
        if (rtype && !allRequestTypes.includes(rtype)) { allRequestTypes.push(rtype); allRequestTypes.sort(); }
        if (identity_verified) session.hasVerified = true;
        if (end_conversation) session.hasEndConversation = true;
      }
    }
  }

  allSessions.sort((a, b) => b.latest.localeCompare(a.latest));
  repopulateFiltersPreservingSelection();
  renderSessionList();
  if (sid === currentSessionId) appendRealtimeMessage(row);
}

function repopulateFiltersPreservingSelection() {
  const selTools = getCheckedValues(filterToolsPanel);
  const selCats  = getCheckedValues(filterCategoryPanel);
  const selTypes = getCheckedValues(filterRequestTypePanel);
  populateFilters();
  restoreChecked(filterToolsPanel, filterToolsTrigger, selTools, 'All tools', 'Tools');
  restoreChecked(filterCategoryPanel, filterCategoryTrigger, selCats, 'All categories', 'Category');
  restoreChecked(filterRequestTypePanel, filterRequestTypeTrigger, selTypes, 'All types', 'Type');
}

function getCheckedValues(panel) {
  return Array.from(panel.querySelectorAll('input[type=checkbox]:checked')).map((cb) => cb.value);
}

function restoreChecked(panel, trigger, values, defaultLabel, activePrefix) {
  for (const cb of panel.querySelectorAll('input[type=checkbox]')) {
    cb.checked = values.includes(cb.value);
  }
  updateDropdownLabel(panel, trigger, defaultLabel, activePrefix);
}

function updateDropdownLabel(panel, trigger, defaultLabel, activePrefix) {
  const count = panel.querySelectorAll('input[type=checkbox]:checked').length;
  trigger.textContent = count ? activePrefix + ' (' + count + ')' : defaultLabel;
}

function closeAllDropdowns() {
  document.querySelectorAll('.dd-panel.open').forEach((p) => {
    p.classList.remove('open');
    p.previousElementSibling.classList.remove('active');
  });
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
}

function hideLoginError() {
  loginError.style.display = 'none';
}

// ── Status Log ──
function logStatus(msg) {
  console.log('[status]', msg);
}

function clearStatusLog() {
  // no-op: status log removed from UI
}

// ── Sessions ──
async function loadSessions() {
  // Fetch all rows in pages of 1000 (Supabase default limit)
  const sessionMap = {};
  let from = 0;
  const pageSize = 1000;
  let totalRows = 0;
  const globalToolSet = new Set();
  const globalCategorySet = new Set();
  const globalRequestTypeSet = new Set();

  while (true) {
    logStatus('Fetching rows ' + from + '–' + (from + pageSize - 1) + '...');

    const { data, error } = await db
      .from('chat_messages')
      .select('session_id, created_at, message')
      .range(from, from + pageSize - 1);

    if (error) {
      logStatus('Session fetch ERROR: ' + (error.message || JSON.stringify(error)));
      console.error('Failed to load sessions:', error);
      return false;
    }

    logStatus('Got ' + data.length + ' rows in this page.');
    totalRows += data.length;

    for (const row of data) {
      if (!sessionMap[row.session_id]) {
        sessionMap[row.session_id] = {
          count: 0, latest: row.created_at, earliest: row.created_at,
          tools: new Set(),
          typeCounts: { human: 0, ai: 0, tool: 0, system: 0 },
          categories: new Set(),
          requestTypes: new Set(),
          hasVerified: false,
          hasEndConversation: false,
        };
      }
      const s = sessionMap[row.session_id];
      s.count++;
      if (row.created_at > s.latest) s.latest = row.created_at;
      if (row.created_at < s.earliest) s.earliest = row.created_at;

      // Parse message for metadata
      try {
        const msg = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
        if (!msg) continue;

        // Count by type
        const mtype = msg.type || 'unknown';
        if (s.typeCounts[mtype] !== undefined) s.typeCounts[mtype]++;

        // Extract tool names
        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            if (tc.name) { s.tools.add(tc.name); globalToolSet.add(tc.name); }
          }
        }
        if (mtype === 'tool' && msg.name) {
          s.tools.add(msg.name); globalToolSet.add(msg.name);
        }

        // Extract AI metadata (category, request type, verified, end)
        if (mtype === 'ai' && !(msg.tool_calls && msg.tool_calls.length > 0)) {
          let content = msg.content;
          if (typeof content === 'string') { try { content = JSON.parse(content); } catch { content = null; } }
          if (content && content.output) {
            if (content.output.request_category) {
              s.categories.add(content.output.request_category);
              globalCategorySet.add(content.output.request_category);
            }
            if (content.output.request_type) {
              s.requestTypes.add(content.output.request_type);
              globalRequestTypeSet.add(content.output.request_type);
            }
            if (content.output.identity_verified) s.hasVerified = true;
            if (content.output.end_conversation) s.hasEndConversation = true;
          }
        }
      } catch { /* skip unparseable */ }
    }

    // If we got fewer rows than the page size, we've reached the end
    if (data.length < pageSize) break;
    from += pageSize;
  }

  logStatus('Total rows fetched: ' + totalRows + ', unique sessions: ' + Object.keys(sessionMap).length);

  allSessions = Object.entries(sessionMap)
    .map(([id, info]) => ({
      id,
      count: info.count,
      latest: info.latest,
      earliest: info.earliest,
      tools: Array.from(info.tools),
      typeCounts: info.typeCounts,
      categories: Array.from(info.categories),
      requestTypes: Array.from(info.requestTypes),
      hasVerified: info.hasVerified,
      hasEndConversation: info.hasEndConversation,
    }))
    .sort((a, b) => b.latest.localeCompare(a.latest));

  allToolNames = Array.from(globalToolSet).sort();
  allCategories = Array.from(globalCategorySet).sort();
  allRequestTypes = Array.from(globalRequestTypeSet).sort();

  return true;
}

function populateFilters() {
  buildDropdown(filterToolsPanel, filterToolsTrigger, allToolNames, 'All tools', 'Tools');
  buildDropdown(filterCategoryPanel, filterCategoryTrigger, allCategories, 'All categories', 'Category');
  buildDropdown(filterRequestTypePanel, filterRequestTypeTrigger, allRequestTypes, 'All types', 'Type');
}

function buildDropdown(panel, trigger, items, defaultLabel, activePrefix) {
  panel.innerHTML = '';
  for (const item of items) {
    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = item;
    cb.addEventListener('change', () => {
      updateDropdownLabel(panel, trigger, defaultLabel, activePrefix);
      renderSessionList();
    });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + item));
    panel.appendChild(lbl);
  }
  updateDropdownLabel(panel, trigger, defaultLabel, activePrefix);
}

function clearFilters() {
  filterDateFrom.value = '';
  filterDateTo.value = '';
  filterMsgMin.value = '';
  filterMsgMax.value = '';
  for (const cb of filterToolsPanel.querySelectorAll('input[type=checkbox]')) cb.checked = false;
  filterToolsTrigger.textContent = 'All tools';
  for (const cb of filterCategoryPanel.querySelectorAll('input[type=checkbox]')) cb.checked = false;
  filterCategoryTrigger.textContent = 'All categories';
  for (const cb of filterRequestTypePanel.querySelectorAll('input[type=checkbox]')) cb.checked = false;
  filterRequestTypeTrigger.textContent = 'All types';
  filterSort.value = 'newest';
  filterReviewed.value = 'all';
  renderSessionList();
}

function buildTypePillsHtml(tc) {
  const parts = [];
  if (tc.human) parts.push(`<span class="type-pill human">${tc.human} human</span>`);
  if (tc.ai) parts.push(`<span class="type-pill ai">${tc.ai} ai</span>`);
  if (tc.tool) parts.push(`<span class="type-pill tool">${tc.tool} tool</span>`);
  if (tc.system) parts.push(`<span class="type-pill system">${tc.system} sys</span>`);
  return parts.join('');
}

function buildSessionBadgesHtml(session) {
  const badges = [];
  if (reviewedSessions.has(session.id)) {
    badges.push('<span class="badge reviewed-badge">reviewed</span>');
  }
  for (const cat of session.categories) {
    badges.push(`<span class="badge">${escapeHtml(cat)}</span>`);
  }
  for (const rt of session.requestTypes) {
    badges.push(`<span class="badge">${escapeHtml(rt)}</span>`);
  }
  if (session.hasVerified) badges.push('<span class="badge verified">verified</span>');
  if (session.hasEndConversation) badges.push('<span class="badge end-conv">end</span>');
  return badges.length ? `<div class="session-badges">${badges.join('')}</div>` : '';
}

function renderSessionList() {
  const query = sessionSearch.value.trim().toLowerCase();
  const dateFrom = filterDateFrom.value; // 'YYYY-MM-DD' or ''
  const dateTo = filterDateTo.value;
  const msgMin = filterMsgMin.value ? parseInt(filterMsgMin.value, 10) : null;
  const msgMax = filterMsgMax.value ? parseInt(filterMsgMax.value, 10) : null;
  const selectedTools = getCheckedValues(filterToolsPanel);
  const selectedCategories = getCheckedValues(filterCategoryPanel);
  const selectedReqTypes = getCheckedValues(filterRequestTypePanel);
  const sortBy = filterSort.value;
  const reviewedFilter = filterReviewed.value; // 'all', 'reviewed', 'unreviewed'

  let filtered = allSessions;

  // Text search
  if (query) {
    filtered = filtered.filter((s) => s.id.toLowerCase().includes(query));
  }

  // Date range (compare against session's date span: show if session overlaps the range)
  if (dateFrom) {
    filtered = filtered.filter((s) => s.latest >= dateFrom);
  }
  if (dateTo) {
    // Include the full "to" day
    const toEnd = dateTo + 'T23:59:59';
    filtered = filtered.filter((s) => s.earliest <= toEnd);
  }

  // Message count
  if (msgMin !== null && !isNaN(msgMin)) {
    filtered = filtered.filter((s) => s.count >= msgMin);
  }
  if (msgMax !== null && !isNaN(msgMax)) {
    filtered = filtered.filter((s) => s.count <= msgMax);
  }

  // Tools (session must contain ALL selected tools)
  if (selectedTools.length > 0) {
    filtered = filtered.filter((s) =>
      selectedTools.every((t) => s.tools.includes(t))
    );
  }

  // Categories (session must have at least one matching category)
  if (selectedCategories.length > 0) {
    filtered = filtered.filter((s) =>
      selectedCategories.some((c) => s.categories.includes(c))
    );
  }

  // Request types (session must have at least one matching request type)
  if (selectedReqTypes.length > 0) {
    filtered = filtered.filter((s) =>
      selectedReqTypes.some((r) => s.requestTypes.includes(r))
    );
  }

  // Reviewed filter
  if (reviewedFilter === 'reviewed') {
    filtered = filtered.filter((s) => reviewedSessions.has(s.id));
  } else if (reviewedFilter === 'unreviewed') {
    filtered = filtered.filter((s) => !reviewedSessions.has(s.id));
  }

  // Sort
  filtered = [...filtered];
  switch (sortBy) {
    case 'oldest':
      filtered.sort((a, b) => a.earliest.localeCompare(b.earliest));
      break;
    case 'most-msgs':
      filtered.sort((a, b) => b.count - a.count);
      break;
    case 'least-msgs':
      filtered.sort((a, b) => a.count - b.count);
      break;
    default: // 'newest'
      filtered.sort((a, b) => b.latest.localeCompare(a.latest));
  }

  const hasFilters = query || dateFrom || dateTo || msgMin !== null || msgMax !== null
    || selectedTools.length > 0 || selectedCategories.length > 0 || selectedReqTypes.length > 0
    || reviewedFilter !== 'all';
  sessionCount.textContent = `${filtered.length} session${filtered.length !== 1 ? 's' : ''}${hasFilters ? ' found' : ''}`;

  sessionList.innerHTML = '';
  for (const session of filtered) {
    const li = document.createElement('li');
    li.className = 'session-item' + (session.id === currentSessionId ? ' active' : '');
    const tc = session.typeCounts;
    const typePills = buildTypePillsHtml(tc);
    const badgesHtml = buildSessionBadgesHtml(session);
    li.innerHTML = `
      <div class="session-id">${escapeHtml(session.id)}</div>
      <div class="session-meta">${session.count} messages &middot; ${formatDate(session.latest)}</div>
      <div class="type-counts">${typePills}</div>
      ${badgesHtml}
    `;
    li.addEventListener('click', () => selectSession(session.id));
    sessionList.appendChild(li);
  }
}

async function selectSession(sessionId) {
  currentSessionId = sessionId;
  renderSessionList(); // Update active highlight

  // Show loading state
  chatMain.innerHTML = '<div class="loading-messages"><div class="spinner"></div> Loading messages...</div>';

  const { data, error } = await db
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    chatMain.innerHTML = '<div class="chat-empty">Failed to load messages.</div>';
    console.error(error);
    return;
  }

  renderMessages(data, sessionId);
}

// ── Message Parsing ──
function parseMessage(row) {
  let msg;
  try {
    msg = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
  } catch {
    return { type: 'unknown', text: row.message, raw: row.message };
  }

  const type = msg.type || 'unknown';
  const result = { type, raw: msg, timestamp: row.created_at };

  if (type === 'human') {
    // Human messages: content is a plain text string or could be JSON
    let text = msg.content;
    if (typeof text === 'string') {
      // Try parsing as JSON in case it's nested
      try {
        const parsed = JSON.parse(text);
        text = parsed.text || parsed.content || parsed.input || JSON.stringify(parsed, null, 2);
      } catch {
        // It's plain text, use as-is
      }
    }
    result.text = text || '';
  } else if (type === 'ai') {
    const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
    result.hasToolCalls = hasToolCalls;

    if (hasToolCalls) {
      result.toolCalls = msg.tool_calls;
      result.text = msg.content || '';
    } else {
      // Parse the content JSON for output.text
      let content = msg.content;
      if (typeof content === 'string') {
        try {
          content = JSON.parse(content);
        } catch {
          result.text = content;
          return result;
        }
      }

      if (content && content.output) {
        result.text = content.output.text || '';
        result.meta = {
          identityVerified: content.output.identity_verified,
          requestCategory: content.output.request_category,
          requestType: content.output.request_type,
          endConversation: content.output.end_conversation,
        };
      } else {
        result.text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      }
    }
  } else if (type === 'tool') {
    result.toolName = msg.name || 'Tool';
    result.toolCallId = msg.tool_call_id || '';
    let content = msg.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        // plain text
      }
    }
    result.toolContent = content;
    result.text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  } else if (type === 'system') {
    let content = msg.content;
    if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content);
        // Format system metadata nicely
        if (parsed.session_id || parsed.client_id || parsed.platform) {
          const parts = [];
          if (parsed.session_id) parts.push('Session: ' + parsed.session_id);
          if (parsed.client_id) parts.push('Client: ' + parsed.client_id);
          if (parsed.platform) parts.push('Platform: ' + parsed.platform);
          result.text = parts.join(' · ');
        } else {
          result.text = JSON.stringify(parsed, null, 2);
        }
      } catch {
        result.text = content;
      }
    } else {
      result.text = JSON.stringify(content, null, 2);
    }
  } else {
    result.text = JSON.stringify(msg, null, 2);
  }

  return result;
}

// ── Message Rendering ──
function renderMessages(rows, sessionId) {
  chatMain.innerHTML = '';

  // Count message types
  const headerCounts = { human: 0, ai: 0, tool: 0, system: 0 };
  for (const row of rows) {
    try {
      const msg = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
      const t = msg && msg.type;
      if (headerCounts[t] !== undefined) headerCounts[t]++;
    } catch { /* skip */ }
  }

  // Chat header — update permanent session controls bar
  const isReviewed = reviewedSessions.has(sessionId);
  const sessionControls = document.getElementById('chat-session-controls');
  sessionControls.innerHTML = `
    <button class="chat-reviewed-btn${isReviewed ? ' reviewed-active' : ''}" id="chat-reviewed-btn">${isReviewed ? 'Reviewed ✓' : 'Mark Reviewed'}</button>
    <button class="chat-feedback-btn" id="chat-feedback-btn">Feedback</button>
    <h3>${escapeHtml(sessionId)}</h3>
    <span class="meta-info">${rows.length} messages</span>
    <div class="chat-header-counts">${buildTypePillsHtml(headerCounts)}</div>
  `;

  sessionControls.querySelector('#chat-reviewed-btn').addEventListener('click', () => toggleReviewed(sessionId));

  sessionControls.querySelector('#chat-feedback-btn').addEventListener('click', () => {
    openFeedbackModal('chat', { session_id: sessionId, message_count: rows.length });
  });

  // Messages container
  const container = document.createElement('div');
  container.className = 'messages-container';
  chatMain.appendChild(container);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const parsed = parseMessage(row);
    const wrapper = document.createElement('div');

    if (parsed.type === 'human') {
      wrapper.className = 'message-wrapper human';
      wrapper.appendChild(createHumanBubble(parsed));
    } else if (parsed.type === 'ai' && parsed.hasToolCalls) {
      wrapper.className = 'message-wrapper tool';
      wrapper.appendChild(createToolCallBubble(parsed));
    } else if (parsed.type === 'ai') {
      wrapper.className = 'message-wrapper ai';
      wrapper.appendChild(createAiBubble(parsed));
    } else if (parsed.type === 'tool') {
      wrapper.className = 'message-wrapper tool';
      wrapper.appendChild(createToolResultBubble(parsed));
    } else if (parsed.type === 'system') {
      wrapper.className = 'message-wrapper system';
      wrapper.appendChild(createSystemBubble(parsed));
    } else {
      wrapper.className = 'message-wrapper system';
      wrapper.appendChild(createSystemBubble(parsed));
    }

    // Hover feedback button on every message
    const fbBtn = document.createElement('button');
    fbBtn.className = 'feedback-hover-btn';
    fbBtn.title = 'Leave feedback on this message';
    fbBtn.textContent = '\uD83D\uDCAC'; // speech bubble
    fbBtn.addEventListener('click', () => {
      openFeedbackModal('message', {
        session_id: sessionId,
        message_index: i,
        message_type: parsed.type,
        message_timestamp: parsed.timestamp,
        message_text_excerpt: (parsed.text || '').substring(0, 200),
        tool_name: parsed.toolName || (parsed.toolCalls ? parsed.toolCalls.map((t) => t.name).join(', ') : undefined),
        raw: parsed.raw,
      });
    });
    wrapper.appendChild(fbBtn);

    container.appendChild(wrapper);
  }

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function appendRealtimeMessage(row) {
  const container = chatMain.querySelector('.messages-container');
  if (!container) return; // chat view not currently loaded

  const parsed = parseMessage(row);
  const wrapper = document.createElement('div');
  const messageIndex = container.querySelectorAll('.message-wrapper').length;

  if (parsed.type === 'human') {
    wrapper.className = 'message-wrapper human';
    wrapper.appendChild(createHumanBubble(parsed));
  } else if (parsed.type === 'ai' && parsed.hasToolCalls) {
    wrapper.className = 'message-wrapper tool';
    wrapper.appendChild(createToolCallBubble(parsed));
  } else if (parsed.type === 'ai') {
    wrapper.className = 'message-wrapper ai';
    wrapper.appendChild(createAiBubble(parsed));
  } else if (parsed.type === 'tool') {
    wrapper.className = 'message-wrapper tool';
    wrapper.appendChild(createToolResultBubble(parsed));
  } else {
    wrapper.className = 'message-wrapper system';
    wrapper.appendChild(createSystemBubble(parsed));
  }

  // Feedback hover button (same pattern as renderMessages)
  const fbBtn = document.createElement('button');
  fbBtn.className = 'feedback-hover-btn';
  fbBtn.title = 'Leave feedback on this message';
  fbBtn.textContent = '\uD83D\uDCAC';
  fbBtn.addEventListener('click', () => {
    openFeedbackModal('message', {
      session_id: currentSessionId,
      message_index: messageIndex,
      message_type: parsed.type,
      message_timestamp: parsed.timestamp,
      message_text_excerpt: (parsed.text || '').substring(0, 200),
      tool_name: parsed.toolName || (parsed.toolCalls ? parsed.toolCalls.map((t) => t.name).join(', ') : undefined),
      raw: parsed.raw,
    });
  });
  wrapper.appendChild(fbBtn);

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;

  // Update header message count and type pills
  const session = allSessions.find((s) => s.id === currentSessionId);
  const sessionControls = document.getElementById('chat-session-controls');
  const metaEl = sessionControls && sessionControls.querySelector('.meta-info');
  if (metaEl && session) metaEl.textContent = session.count + ' messages';
  const pillsEl = sessionControls && sessionControls.querySelector('.chat-header-counts');
  if (pillsEl && session) pillsEl.innerHTML = buildTypePillsHtml(session.typeCounts);
}

function createHumanBubble(parsed) {
  const el = document.createElement('div');
  el.className = 'message human-bubble';
  el.innerHTML = `
    <div class="message-label human-label">Customer</div>
    <div class="message-text">${escapeHtml(parsed.text)}</div>
    <div class="message-time">${formatTime(parsed.timestamp)}</div>
  `;
  return el;
}

function createAiBubble(parsed) {
  const el = document.createElement('div');
  el.className = 'message ai-bubble';

  let badgesHtml = '';
  if (parsed.meta) {
    const badges = [];
    if (parsed.meta.requestCategory) {
      badges.push(`<span class="badge">${escapeHtml(parsed.meta.requestCategory)}</span>`);
    }
    if (parsed.meta.requestType) {
      badges.push(`<span class="badge">${escapeHtml(parsed.meta.requestType)}</span>`);
    }
    if (parsed.meta.identityVerified) {
      badges.push('<span class="badge verified">verified</span>');
    }
    if (parsed.meta.endConversation) {
      badges.push('<span class="badge end-conv">end</span>');
    }
    if (badges.length) {
      badgesHtml = `<div class="badges">${badges.join('')}</div>`;
    }
  }

  el.innerHTML = `
    <div class="message-label ai-label">AI Agent</div>
    <div class="message-text">${escapeHtml(parsed.text)}</div>
    ${badgesHtml}
    <div class="message-time">${formatTime(parsed.timestamp)}</div>
  `;
  return el;
}

function createToolCallBubble(parsed) {
  const el = document.createElement('div');
  el.className = 'message tool-bubble';

  let toolNames = '';
  if (parsed.toolCalls && parsed.toolCalls.length > 0) {
    toolNames = parsed.toolCalls.map((tc) => tc.name || 'unknown').join(', ');
  }

  let detailsHtml = '';
  if (parsed.toolCalls && parsed.toolCalls.length > 0) {
    const argsStr = parsed.toolCalls
      .map((tc) => {
        const args = tc.args || tc.input || {};
        return JSON.stringify(args, null, 2);
      })
      .join('\n---\n');
    detailsHtml = `
      <details class="tool-details">
        <summary>Show tool call details</summary>
        <pre>${escapeHtml(argsStr)}</pre>
      </details>
    `;
  }

  el.innerHTML = `
    <div class="message-label" style="color: #856404;">Tool Call: ${escapeHtml(toolNames)}</div>
    ${parsed.text ? `<div class="message-text">${escapeHtml(parsed.text)}</div>` : ''}
    ${detailsHtml}
    <div class="message-time">${formatTime(parsed.timestamp)}</div>
  `;
  return el;
}

function createToolResultBubble(parsed) {
  const el = document.createElement('div');
  el.className = 'message tool-bubble';

  el.innerHTML = `
    <div class="message-label" style="color: #856404;">Tool Result: ${escapeHtml(parsed.toolName)}</div>
    <details class="tool-details">
      <summary>Show response</summary>
      <pre>${escapeHtml(parsed.text)}</pre>
    </details>
    <div class="message-time">${formatTime(parsed.timestamp)}</div>
  `;
  return el;
}

function createSystemBubble(parsed) {
  const el = document.createElement('div');
  el.className = 'message system-bubble';
  el.innerHTML = `<div class="message-text">${escapeHtml(parsed.text)}</div>`;
  return el;
}

// ── Feedback ──
function openFeedbackModal(type, meta) {
  feedbackMeta = { type, ...meta };
  fbCategory.value = '';
  fbComment.value = '';
  fbStatus.textContent = '';
  fbStatus.className = 'fb-status';
  fbSubmit.disabled = false;
  fbSubtitle.textContent = type === 'chat'
    ? 'About chat session: ' + (meta.session_id || '').substring(0, 24) + '...'
    : 'About ' + (meta.message_type || '') + ' message at ' + formatTime(meta.message_timestamp);
  if (fbUserName) fbUserName.textContent = currentUser ? (currentUser.name || currentUser.email) : 'Unknown';
  feedbackOverlay.classList.add('open');
}

function closeFeedbackModal() {
  feedbackOverlay.classList.remove('open');
  feedbackMeta = {};
}

async function submitFeedback() {
  const category = fbCategory.value;
  const comment = fbComment.value.trim();

  if (!category) {
    fbStatus.textContent = 'Please select a category.';
    fbStatus.className = 'fb-status error';
    return;
  }
  if (!comment) {
    fbStatus.textContent = 'Please enter a comment.';
    fbStatus.className = 'fb-status error';
    return;
  }

  fbSubmit.disabled = true;
  fbStatus.textContent = 'Submitting...';
  fbStatus.className = 'fb-status';

  const envIdx = parseInt(localStorage.getItem('sb_selected_env') || '0', 10);
  const envName = (environments[envIdx] || environments[0] || {}).name || 'Default';

  const payload = {
    category,
    comment,
    env: envName,
    feedback_type: feedbackMeta.type, // 'chat' or 'message'
    session_id: feedbackMeta.session_id,
    message_index: feedbackMeta.message_index,
    message_type: feedbackMeta.message_type,
    message_timestamp: feedbackMeta.message_timestamp,
    message_text_excerpt: feedbackMeta.message_text_excerpt,
    tool_name: feedbackMeta.tool_name,
    message_count: feedbackMeta.message_count,
    raw_message: feedbackMeta.raw,
    submitted_by: currentUser?.email ?? null,
    submitted_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await db.functions.invoke('chat-feedback', {
      body: payload,
    });

    if (error) throw error;

    fbStatus.textContent = 'Feedback submitted. Thank you!';
    fbStatus.className = 'fb-status success';
    setTimeout(closeFeedbackModal, 1500);
  } catch (err) {
    console.error('Feedback submit error:', err);
    fbStatus.textContent = 'Failed to submit: ' + (err.message || 'Unknown error');
    fbStatus.className = 'fb-status error';
    fbSubmit.disabled = false;
  }
}

// ── Reviewed Sessions ──
function getReviewedKey() {
  return 'sb_reviewed_' + (localStorage.getItem('sb_project_id') || 'default');
}

function loadReviewed() {
  try {
    const data = JSON.parse(localStorage.getItem(getReviewedKey()) || '[]');
    reviewedSessions = new Set(Array.isArray(data) ? data : []);
  } catch { reviewedSessions = new Set(); }
}

function saveReviewed() {
  localStorage.setItem(getReviewedKey(), JSON.stringify(Array.from(reviewedSessions)));
}

function toggleReviewed(sessionId) {
  if (reviewedSessions.has(sessionId)) {
    reviewedSessions.delete(sessionId);
  } else {
    reviewedSessions.add(sessionId);
  }
  saveReviewed();
  updateReviewedButton(sessionId);
  renderSessionList();
}

function updateReviewedButton(sessionId) {
  const btn = document.getElementById('chat-reviewed-btn');
  if (!btn) return;
  const isReviewed = reviewedSessions.has(sessionId);
  btn.textContent = isReviewed ? 'Reviewed ✓' : 'Mark Reviewed';
  btn.classList.toggle('reviewed-active', isReviewed);
}

// ── Utilities ──
function escapeHtml(str) {
  if (typeof str !== 'string') str = String(str);
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

const TIME_ZONE = 'Europe/Chisinau';

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TIME_ZONE });
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: TIME_ZONE,
  });
}
