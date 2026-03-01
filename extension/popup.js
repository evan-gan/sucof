const statusEl      = document.getElementById('status');
const chatArea      = document.getElementById('chatArea');
const welcome       = document.getElementById('welcome');
const userInput     = document.getElementById('userInput');
const sendBtn       = document.getElementById('sendBtn');
const modelBadge    = document.getElementById('modelBadge');
const modelPicker   = document.getElementById('modelPicker');
const modelDropdown = document.getElementById('modelDropdown');
const modelFilter   = document.getElementById('modelFilter');
const modelList     = document.getElementById('modelList');
const refreshBtn    = document.getElementById('refreshBtn');
const faviconEl     = document.getElementById('favicon');
const settingsBtn   = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const inputArea     = document.querySelector('.input-area');

// Set favicon from the active tab
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab?.favIconUrl) faviconEl.src = tab.favIconUrl;
});

let currentMarkdown     = '';
let isBusy              = false;
let availableModels     = [];
let modelToUse          = 'gemma3:1b';
let conversationHistory = [];  // [{role, content}]

const DEFAULT_MODEL  = 'gemma3:1b';
const STORAGE_KEY    = 'sucof_preferred_model';

// ── Model dropdown ───────────────────────────────────────────────────────────

function buildDropdown(filter = '') {
  modelList.innerHTML = '';
  const q = filter.toLowerCase();
  for (const name of availableModels) {
    if (q && !name.toLowerCase().includes(q)) continue;
    const btn = document.createElement('button');
    btn.className = 'model-option' + (name === modelToUse ? ' active' : '');
    btn.dataset.model = name;
    btn.innerHTML = `<span>${name}</span><span class="model-check">✓</span>`;
    btn.addEventListener('click', () => {
      modelToUse = name;
      localStorage.setItem(STORAGE_KEY, name);
      modelBadge.textContent = name;
      modelDropdown.classList.remove('open');
      buildDropdown();
    });
    modelList.appendChild(btn);
  }
}

modelFilter.addEventListener('input', () => buildDropdown(modelFilter.value));

modelBadge.addEventListener('click', (e) => {
  e.stopPropagation();
  if (availableModels.length === 0) return;
  const opening = !modelDropdown.classList.contains('open');
  modelDropdown.classList.toggle('open');
  if (opening) {
    modelFilter.value = '';
    buildDropdown();
    modelFilter.focus();
  }
});

document.addEventListener('click', (e) => {
  if (!modelPicker.contains(e.target)) modelDropdown.classList.remove('open');
});

// ── Connect to Ollama on startup ─────────────────────────────────────────────

(async () => {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    availableModels = data.models?.map(m => m.name) ?? [];

    if (availableModels.length === 0) {
      statusEl.textContent = 'No Ollama models found — pull one first.';
      modelBadge.textContent = 'no models';
    } else {
      // Prefer saved preference, then default, then first available
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && availableModels.includes(saved)) {
        modelToUse = saved;
      } else if (availableModels.includes(DEFAULT_MODEL)) {
        modelToUse = DEFAULT_MODEL;
      } else {
        modelToUse = availableModels[0];
      }
      modelBadge.textContent = modelToUse;
      buildDropdown();
      statusEl.textContent = 'Ready · send a message to get started';
    }
  } catch {
    statusEl.textContent = 'Ollama not running — start it first.';
    modelBadge.textContent = 'offline';
  }
})();

// ── Settings ──────────────────────────────────────────────────────────────────

// Add fields here to expand the settings panel
const SETTINGS_FIELDS = [
  { key: 'token',     label: 'Token',      type: 'password', placeholder: 'xoxb-…' },
  { key: 'channelId', label: 'Channel ID', type: 'text',     placeholder: 'C0XXXXXXXX' },
];

const SETTINGS_STORAGE_KEY = 'sucof_settings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function saveSettings(values) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(values));
}

function renderSettingsForm() {
  settingsPanel.innerHTML = '';

  const saved = loadSettings();
  const fields = document.createElement('div');
  fields.className = 'settings-fields';

  for (const field of SETTINGS_FIELDS) {
    const group = document.createElement('div');
    group.className = 'settings-field';

    const label = document.createElement('label');
    label.htmlFor = `setting-${field.key}`;
    label.className = 'settings-label';
    label.textContent = field.label;

    const input = document.createElement('input');
    input.type = field.type;
    input.id = `setting-${field.key}`;
    input.className = 'settings-input';
    input.placeholder = field.placeholder || '';
    input.value = saved[field.key] || '';

    group.appendChild(label);
    group.appendChild(input);
    fields.appendChild(group);
  }
  settingsPanel.appendChild(fields);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'settings-save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    const values = {};
    for (const field of SETTINGS_FIELDS) {
      const input = document.getElementById(`setting-${field.key}`);
      if (input) values[field.key] = input.value.trim();
    }
    saveSettings(values);
    saveBtn.classList.add('saved');
    saveBtn.textContent = 'Saved!';
    setTimeout(() => { saveBtn.classList.remove('saved'); saveBtn.textContent = 'Save'; }, 1500);
  });
  settingsPanel.appendChild(saveBtn);
}

const headerName = document.querySelector('.header-name');

function openSettings() {
  renderSettingsForm();
  chatArea.style.display = 'none';
  inputArea.style.display = 'none';
  statusEl.style.display = 'none';
  settingsPanel.style.display = 'flex';
  settingsBtn.classList.add('active');
  headerName.textContent = 'Settings';
}

function closeSettings() {
  settingsPanel.style.display = 'none';
  chatArea.style.display = 'flex';
  inputArea.style.display = 'flex';
  statusEl.style.display = '';
  settingsBtn.classList.remove('active');
  headerName.textContent = 'Page Chat';
}

settingsBtn.addEventListener('click', () => {
  if (settingsPanel.style.display === 'flex') closeSettings();
  else openSettings();
});

// ── Auto-resize textarea ─────────────────────────────────────────────────────

userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 110) + 'px';
});

// ── Markdown / page utilities ────────────────────────────────────────────────

const turndown = new TurndownService({
  headingStyle:     'atx',
  bulletListMarker: '-',
  codeBlockStyle:   'fenced',
  fence:            '```',
  hr:               '---',
  strongDelimiter:  '**',
  emDelimiter:      '*',
});

const STRIP = [
  'script', 'style', 'noscript', 'svg', 'canvas', 'picture',
  'iframe', 'frame', 'frameset', 'template', 'head', 'link', 'meta',
].join(',');

function cleanHtml(rawHtml) {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  doc.querySelectorAll(STRIP).forEach(el => el.remove());
  return doc.body.innerHTML;
}

async function fetchPageMarkdown() {
  statusEl.textContent = 'Reading page…';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.documentElement.outerHTML,
  });
  const html = results[0].result;

  statusEl.textContent = 'Parsing…';
  await new Promise(r => setTimeout(r, 0)); // let status paint
  currentMarkdown = turndown.turndown(cleanHtml(html));

  const shortUrl = tab.url.length > 55 ? tab.url.slice(0, 55) + '…' : tab.url;
  statusEl.textContent = `Page loaded · ${shortUrl}`;
}

// ── Refresh button ───────────────────────────────────────────────────────────

refreshBtn.addEventListener('click', async () => {
  if (isBusy) return;
  currentMarkdown = '';
  conversationHistory = [];
  // Clear chat, restore welcome
  chatArea.innerHTML = '';
  chatArea.appendChild(welcome);
  statusEl.textContent = 'Page cleared — send a message to re-read it.';
});

// ── Chat UI helpers ──────────────────────────────────────────────────────────

function hideWelcome() {
  if (welcome.isConnected) welcome.remove();
}

/** Appends a bubble and returns the bubble element (for streaming updates). */
function addMessage(role, content) {
  hideWelcome();
  const wrap   = document.createElement('div');
  wrap.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;
  wrap.appendChild(bubble);
  chatArea.appendChild(wrap);
  chatArea.scrollTop = chatArea.scrollHeight;
  return bubble;
}

/** Appends an animated typing indicator and returns its wrapper element. */
function addTypingIndicator() {
  hideWelcome();
  const wrap   = document.createElement('div');
  wrap.className = 'message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'bubble typing-dots';
  bubble.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(bubble);
  chatArea.appendChild(wrap);
  chatArea.scrollTop = chatArea.scrollHeight;
  return wrap;
}


/** Appends a collapsible tool-call chip showing the tool name, inputs, and output. */
function addToolCallMessage(name, args, result) {
  hideWelcome();
  const wrap = document.createElement('div');
  wrap.className = 'message assistant tool-call-wrap';

  const details = document.createElement('details');
  details.className = 'tool-call';

  const summary = document.createElement('summary');
  const icon = document.createElement('span');
  icon.className = 'tool-call-icon';
  icon.textContent = '⚙';
  const nameEl = document.createElement('span');
  nameEl.className = 'tool-call-name';
  nameEl.textContent = name;
  const chevron = document.createElement('span');
  chevron.className = 'tool-call-chevron';
  summary.append(icon, nameEl, chevron);
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'tool-call-body';

  const argStr = Object.keys(args).length ? JSON.stringify(args, null, 2) : '(none)';
  const truncate = s => s.length > 400 ? s.slice(0, 400) + '\n… (truncated)' : s;
  for (const [label, value, cls] of [['Input', argStr, 'input'], ['Output', truncate(result), '']]) {
    const section = document.createElement('div');
    section.className = 'tool-call-section';
    const labelEl = document.createElement('span');
    labelEl.className = 'tool-call-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('pre');
    valueEl.className = 'tool-call-value' + (cls ? ' ' + cls : '');
    valueEl.textContent = value;
    section.append(labelEl, valueEl);
    body.appendChild(section);
  }

  details.appendChild(body);
  wrap.appendChild(details);
  chatArea.appendChild(wrap);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ── Send message ─────────────────────────────────────────────────────────────

sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage() {
  const question = userInput.value.trim();
  if (!question || isBusy) return;

  isBusy = true;
  sendBtn.disabled = true;
  userInput.value = '';
  userInput.style.height = 'auto';

  addMessage('user', question);
  let typingEl = addTypingIndicator();

  try {
    // Seed the system message on the first turn (no page content — model fetches it via tool).
    if (conversationHistory.length === 0) {
      conversationHistory.push({ role: 'system', content: buildSystemPrompt() });
    }

    conversationHistory.push({ role: 'user', content: question });
    statusEl.textContent = 'Thinking…';

    // Tool-call loop: keep going until the model replies with action "respond".
    let fullResponse = '';
    let aiBubble = null;   // bubble for the current iteration; reset after each tool call
    let lastToolKey = null;
    let sameCallStreak = 0;
    const mcpContext = {
      get pageMarkdown() { return currentMarkdown; },
      fetchPage: async () => {
        await fetchPageMarkdown();
        return currentMarkdown;
      },
    };

    for (let iteration = 0; iteration < 10; iteration++) {
      const res = await fetch('http://localhost:11434/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model: modelToUse, messages: conversationHistory, stream: true }),
      });

      if (!res.ok) throw new Error(`Ollama error ${res.status}: ${res.statusText}`);

      fullResponse = '';
      aiBubble = null;
      let totalDuration = null;
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n').filter(l => l.trim())) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullResponse += data.message.content;
              if (fullResponse.includes('TOOL_USE')) {
                // Tool call in progress — hide any text we started showing.
                if (aiBubble) { aiBubble.remove(); aiBubble = null; }
              } else {
                // Plain text response — stream it live.
                if (!aiBubble) {
                  typingEl?.remove();
                  typingEl = null;
                  aiBubble = addMessage('assistant', '');
                }
                aiBubble.textContent = fullResponse;
                chatArea.scrollTop = chatArea.scrollHeight;
              }
            }
            if (data.done) totalDuration = data.total_duration ?? null;
          } catch { /* skip non-JSON lines */ }
        }
      }

      const toolCall = parseToolUse(fullResponse);

      // Model called a tool.
      if (toolCall) {
        if (aiBubble) { aiBubble.remove(); aiBubble = null; }
        conversationHistory.push({ role: 'assistant', content: fullResponse });
        statusEl.textContent = `Tool: ${toolCall.name}…`;
        const result = await runMCPTool(toolCall.name, toolCall.args, mcpContext);
        addToolCallMessage(toolCall.name, toolCall.args, result);

        // Detect repeated identical calls and nudge the model to stop looping.
        const callKey = `${toolCall.name}:${JSON.stringify(toolCall.args)}`;
        if (callKey === lastToolKey) {
          sameCallStreak++;
        } else {
          lastToolKey = callKey;
          sameCallStreak = 0;
        }
        const loopHint = sameCallStreak >= 1
          ? ` You have now called "${toolCall.name}" with the same arguments ${sameCallStreak + 1} times and the result will not change. Stop calling tools and respond with plain text.`
          : '';
        conversationHistory.push({ role: 'user', content: `Tool result (${toolCall.name}): ${result}${loopHint}` });
        statusEl.textContent = 'Thinking…';
        continue;
      }

      // Plain text final answer — already streamed live.
      if (aiBubble) {
        aiBubble.textContent = fullResponse;
      } else {
        typingEl?.remove();
        typingEl = null;
        addMessage('assistant', fullResponse);
      }
      conversationHistory.push({ role: 'assistant', content: fullResponse });
      const secs = totalDuration ? (totalDuration / 1e9).toFixed(1) : '?';
      statusEl.textContent = `Done · ${secs}s`;
      break;
    }

  } catch (err) {
    typingEl?.remove();
    addMessage('assistant', `Something went wrong: ${err.message}`);
    statusEl.textContent = 'Error — is Ollama running?';
    // Roll back the user turn so history stays consistent
    if (conversationHistory.at(-1)?.role === 'user') conversationHistory.pop();
  } finally {
    isBusy = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}
