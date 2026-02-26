// ── State ──
let supabase = null;
let allSessions = [];
let currentSessionId = null;

// ── DOM Elements ──
const loginPanel = document.getElementById('login-panel');
const chatPanel = document.getElementById('chat-panel');
const urlInput = document.getElementById('supabase-url');
const keyInput = document.getElementById('supabase-key');
const connectBtn = document.getElementById('connect-btn');
const loginError = document.getElementById('login-error');
const disconnectBtn = document.getElementById('disconnect-btn');
const sessionSearch = document.getElementById('session-search');
const sessionCount = document.getElementById('session-count');
const sessionList = document.getElementById('session-list');
const chatMain = document.getElementById('chat-main');
const chatEmpty = document.getElementById('chat-empty');

// ── Init ──
(function init() {
  const savedUrl = localStorage.getItem('sb_url');
  const savedKey = localStorage.getItem('sb_key');
  if (savedUrl && savedKey) {
    urlInput.value = savedUrl;
    keyInput.value = savedKey;
  }

  connectBtn.addEventListener('click', handleConnect);
  disconnectBtn.addEventListener('click', handleDisconnect);
  sessionSearch.addEventListener('input', renderSessionList);

  // Allow Enter to submit login
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleConnect();
  });
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleConnect();
  });
})();

// ── Connection ──
async function handleConnect() {
  const url = urlInput.value.trim();
  const key = keyInput.value.trim();

  if (!url || !key) {
    showLoginError('Please enter both URL and anon key.');
    return;
  }

  // Check that the Supabase CDN library loaded
  if (!window.supabase || !window.supabase.createClient) {
    showLoginError('Supabase library failed to load. Check your network or ad blocker.');
    return;
  }

  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  hideLoginError();

  try {
    supabase = window.supabase.createClient(url, key);

    // Test connection with a timeout
    const testPromise = supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out. Check your Supabase URL.')), 10000)
    );

    const { count, error } = await Promise.race([testPromise, timeoutPromise]);

    if (error) throw error;

    // Save credentials
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);

    // Switch to chat panel
    loginPanel.style.display = 'none';
    chatPanel.classList.add('active');

    await loadSessions();
  } catch (err) {
    showLoginError('Connection failed: ' + (err.message || 'Check your credentials.'));
    supabase = null;
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect';
  }
}

function handleDisconnect() {
  localStorage.removeItem('sb_url');
  localStorage.removeItem('sb_key');
  supabase = null;
  allSessions = [];
  currentSessionId = null;
  chatPanel.classList.remove('active');
  loginPanel.style.display = 'flex';
  urlInput.value = '';
  keyInput.value = '';
  sessionList.innerHTML = '';
  chatMain.innerHTML = '<div class="chat-empty">Select a session to view the conversation</div>';
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
}

function hideLoginError() {
  loginError.style.display = 'none';
}

// ── Sessions ──
async function loadSessions() {
  sessionCount.textContent = 'Loading sessions...';

  // Fetch all rows in pages of 1000 (Supabase default limit)
  const sessionMap = {};
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('session_id, created_at')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Failed to load sessions:', error);
      sessionCount.textContent = 'Failed to load sessions. Check console for details.';
      return;
    }

    for (const row of data) {
      if (!sessionMap[row.session_id]) {
        sessionMap[row.session_id] = { count: 0, latest: row.created_at };
      }
      sessionMap[row.session_id].count++;
      if (row.created_at > sessionMap[row.session_id].latest) {
        sessionMap[row.session_id].latest = row.created_at;
      }
    }

    // If we got fewer rows than the page size, we've reached the end
    if (data.length < pageSize) break;
    from += pageSize;
  }

  allSessions = Object.entries(sessionMap)
    .map(([id, info]) => ({ id, count: info.count, latest: info.latest }))
    .sort((a, b) => b.latest.localeCompare(a.latest));

  if (allSessions.length === 0) {
    sessionCount.textContent = 'No sessions found. The table may be empty or restricted by RLS.';
  } else {
    renderSessionList();
  }
}

function renderSessionList() {
  const query = sessionSearch.value.trim().toLowerCase();
  const filtered = query
    ? allSessions.filter((s) => s.id.toLowerCase().includes(query))
    : allSessions;

  sessionCount.textContent = `${filtered.length} session${filtered.length !== 1 ? 's' : ''}${query ? ' found' : ''}`;

  sessionList.innerHTML = '';
  for (const session of filtered) {
    const li = document.createElement('li');
    li.className = 'session-item' + (session.id === currentSessionId ? ' active' : '');
    li.innerHTML = `
      <div class="session-id">${escapeHtml(session.id)}</div>
      <div class="session-meta">${session.count} messages &middot; ${formatDate(session.latest)}</div>
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

  const { data, error } = await supabase
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

  // Chat header
  const header = document.createElement('div');
  header.className = 'chat-header';
  header.innerHTML = `
    <h3>${escapeHtml(sessionId)}</h3>
    <span class="meta-info">${rows.length} messages</span>
  `;
  chatMain.appendChild(header);

  // Messages container
  const container = document.createElement('div');
  container.className = 'messages-container';
  chatMain.appendChild(container);

  for (const row of rows) {
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

// ── Utilities ──
function escapeHtml(str) {
  if (typeof str !== 'string') str = String(str);
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  });
}
