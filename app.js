// ── State ──
let db = null;
let allSessions = [];
let allToolNames = []; // unique tool names across all sessions
let allCategories = []; // unique request categories
let allRequestTypes = []; // unique request types
let currentSessionId = null;

// ── DOM Elements ──
const loginPanel = document.getElementById('login-panel');
const chatPanel = document.getElementById('chat-panel');
const urlInput = document.getElementById('supabase-url');
const keyInput = document.getElementById('supabase-key');
const connectBtn = document.getElementById('connect-btn');
const loginError = document.getElementById('login-error');
const disconnectBtn = document.getElementById('disconnect-btn');
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
const filterTools = document.getElementById('filter-tools');
const filterSort = document.getElementById('filter-sort');
const filterCategory = document.getElementById('filter-category');
const filterRequestType = document.getElementById('filter-request-type');
const filterClear = document.getElementById('filter-clear');
const feedbackOverlay = document.getElementById('feedback-overlay');
const fbSubtitle = document.getElementById('fb-subtitle');
const fbCategory = document.getElementById('fb-category');
const fbComment = document.getElementById('fb-comment');
const fbCancel = document.getElementById('fb-cancel');
const fbSubmit = document.getElementById('fb-submit');
const fbStatus = document.getElementById('fb-status');

// Hidden metadata for the currently open feedback form
let feedbackMeta = {};

console.log('[app.js] Script loaded. Supabase available:', !!(window.supabase && window.supabase.createClient));

// ── Init ──
(function init() {
  const savedProjectId = localStorage.getItem('sb_project_id');
  const savedKey = localStorage.getItem('sb_key');
  if (savedProjectId && savedKey) {
    urlInput.value = savedProjectId;
    keyInput.value = savedKey;
  }

  connectBtn.addEventListener('click', handleConnect);
  disconnectBtn.addEventListener('click', handleDisconnect);
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
  filterTools.addEventListener('change', renderSessionList);
  filterSort.addEventListener('change', renderSessionList);
  filterCategory.addEventListener('change', renderSessionList);
  filterRequestType.addEventListener('change', renderSessionList);
  filterClear.addEventListener('click', clearFilters);

  // Feedback modal
  fbCancel.addEventListener('click', closeFeedbackModal);
  fbSubmit.addEventListener('click', submitFeedback);
  feedbackOverlay.addEventListener('click', (e) => {
    if (e.target === feedbackOverlay) closeFeedbackModal();
  });

  // Allow Enter to submit login
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleConnect();
  });
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleConnect();
  });

  console.log('[app.js] Init complete. Event listeners attached.');
})();

// ── Connection ──
async function handleConnect() {
  const projectId = urlInput.value.trim();
  const key = keyInput.value.trim();

  if (!projectId || !key) {
    showLoginError('Please enter both Project ID and anon key.');
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    showLoginError('Supabase library failed to load. Check your network or ad blocker.');
    return;
  }

  const url = 'https://' + projectId + '.supabase.co';

  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  hideLoginError();
  clearStatusLog();

  logStatus('Connecting to ' + url + ' ...');

  try {
    db = window.supabase.createClient(url, key);
    logStatus('Supabase client created. Testing connection...');

    // Test connection with a timeout
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

    // Save credentials
    localStorage.setItem('sb_project_id', projectId);
    localStorage.setItem('sb_key', key);

    // Load sessions BEFORE switching panels so the user can see progress
    logStatus('Loading sessions...');
    const sessions = await loadSessions();

    if (sessions === false) {
      // loadSessions encountered an error, stay on login
      logStatus('Failed to load sessions. Staying on login screen.');
      db = null;
      return;
    }

    if (allSessions.length === 0) {
      logStatus('Connected but no sessions found. Table may be empty or restricted by RLS.');
      showLoginError('Connected successfully, but no sessions found. The chat_messages table may be empty or restricted by RLS policies.');
      db = null;
      return;
    }

    logStatus('Loaded ' + allSessions.length + ' sessions. Switching to chat view...');

    // Now switch to chat panel
    loginPanel.style.display = 'none';
    chatPanel.classList.add('active');
    populateFilters();
    renderSessionList();
  } catch (err) {
    logStatus('FAILED: ' + (err.message || String(err)));
    showLoginError('Connection failed: ' + (err.message || 'Check your credentials.'));
    db = null;
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect';
  }
}

function handleDisconnect() {
  localStorage.removeItem('sb_project_id');
  localStorage.removeItem('sb_key');
  db = null;
  allSessions = [];
  currentSessionId = null;
  chatPanel.classList.remove('active');
  loginPanel.style.display = 'flex';
  urlInput.value = '';
  keyInput.value = '';
  sessionList.innerHTML = '';
  chatMain.innerHTML = '<div class="chat-empty">Select a session to view the conversation</div>';
}

async function handleRefresh() {
  if (!db) return;
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
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
}

function hideLoginError() {
  loginError.style.display = 'none';
}

// ── Status Log ──
const statusLog = document.getElementById('status-log');

function logStatus(msg) {
  statusLog.style.display = 'block';
  const time = new Date().toLocaleTimeString();
  statusLog.innerHTML += `<div>[${time}] ${escapeHtml(msg)}</div>`;
  statusLog.scrollTop = statusLog.scrollHeight;
}

function clearStatusLog() {
  statusLog.innerHTML = '';
  statusLog.style.display = 'none';
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
  filterTools.innerHTML = '';
  for (const name of allToolNames) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    filterTools.appendChild(opt);
  }
  filterCategory.innerHTML = '';
  for (const name of allCategories) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    filterCategory.appendChild(opt);
  }
  filterRequestType.innerHTML = '';
  for (const name of allRequestTypes) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    filterRequestType.appendChild(opt);
  }
}

function clearFilters() {
  filterDateFrom.value = '';
  filterDateTo.value = '';
  filterMsgMin.value = '';
  filterMsgMax.value = '';
  filterTools.selectedIndex = -1;
  for (const opt of filterTools.options) opt.selected = false;
  filterCategory.selectedIndex = -1;
  for (const opt of filterCategory.options) opt.selected = false;
  filterRequestType.selectedIndex = -1;
  for (const opt of filterRequestType.options) opt.selected = false;
  filterSort.value = 'newest';
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
  const selectedTools = Array.from(filterTools.selectedOptions).map((o) => o.value);
  const selectedCategories = Array.from(filterCategory.selectedOptions).map((o) => o.value);
  const selectedReqTypes = Array.from(filterRequestType.selectedOptions).map((o) => o.value);
  const sortBy = filterSort.value;

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
    || selectedTools.length > 0 || selectedCategories.length > 0 || selectedReqTypes.length > 0;
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

  // Chat header
  const header = document.createElement('div');
  header.className = 'chat-header';
  header.innerHTML = `
    <button class="chat-feedback-btn" id="chat-feedback-btn">Feedback</button>
    <h3>${escapeHtml(sessionId)}</h3>
    <span class="meta-info">${rows.length} messages</span>
    <div class="chat-header-counts">${buildTypePillsHtml(headerCounts)}</div>
  `;
  chatMain.appendChild(header);

  header.querySelector('#chat-feedback-btn').addEventListener('click', () => {
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

  const payload = {
    category,
    comment,
    feedback_type: feedbackMeta.type, // 'chat' or 'message'
    session_id: feedbackMeta.session_id,
    message_index: feedbackMeta.message_index,
    message_type: feedbackMeta.message_type,
    message_timestamp: feedbackMeta.message_timestamp,
    message_text_excerpt: feedbackMeta.message_text_excerpt,
    tool_name: feedbackMeta.tool_name,
    message_count: feedbackMeta.message_count,
    raw_message: feedbackMeta.raw,
    submitted_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await db.functions.invoke('hyper-processor', {
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
