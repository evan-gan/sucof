const readBtn    = document.getElementById('readBtn');
const copyBtn    = document.getElementById('copyBtn');
const statusEl   = document.getElementById('status');
const htmlPanel  = document.getElementById('htmlPanel');
const mdPanel    = document.getElementById('markdownPanel');
const slackPanel = document.getElementById('slackPanel');
const tabs       = document.querySelectorAll('.tab');

let currentHtml     = '';
let currentMarkdown = '';
let activeTab       = 'html';

// ── Tab switching ────────────────────────────────────────────────────────────

const PANELS = { html: htmlPanel, markdown: mdPanel, slack: slackPanel };

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;

    tabs.forEach(t => t.classList.toggle('active', t === tab));
    Object.entries(PANELS).forEach(([name, el]) =>
      el.classList.toggle('active', name === activeTab)
    );

    if (activeTab === 'markdown' && currentHtml && !currentMarkdown) {
      convertToMarkdown();
    }
  });
});

// ── Read page ────────────────────────────────────────────────────────────────

readBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Reading…';
  resetPanels();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });

    currentHtml     = results[0].result;
    currentMarkdown = ''; // invalidate cached markdown

    htmlPanel.textContent = currentHtml;
    htmlPanel.classList.remove('empty');

    statusEl.textContent =
      `Loaded ${currentHtml.length.toLocaleString()} chars from: ${tab.url}`;

    // If the markdown tab is already visible, convert immediately
    if (activeTab === 'markdown') convertToMarkdown();

  } catch (err) {
    htmlPanel.textContent = `Error: ${err.message}`;
    htmlPanel.classList.remove('empty');
    statusEl.textContent = 'Failed to read page HTML.';
  }
});

// ── Markdown conversion ──────────────────────────────────────────────────────

const turndown = new TurndownService({
  headingStyle:    'atx',
  bulletListMarker: '-',
  codeBlockStyle:  'fenced',
  fence:           '```',
  hr:              '---',
  strongDelimiter: '**',
  emDelimiter:     '*',
});

// Elements whose entire subtree is noise — strip before Turndown sees them
const STRIP = [
  'script', 'style', 'noscript',   // code & styles
  'svg', 'canvas', 'picture',       // graphics
  'iframe', 'frame', 'frameset',    // embeds
  'template',                       // inert HTML templates
  'head', 'link', 'meta',           // document infrastructure
].join(',');

function cleanHtml(rawHtml) {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  doc.querySelectorAll(STRIP).forEach(el => el.remove());
  return doc.body.innerHTML;
}

function convertToMarkdown() {
  statusEl.textContent = 'Converting to markdown…';
  mdPanel.classList.add('empty');

  // Yield to the browser so the status update paints before the (sync) parse
  setTimeout(() => {
    try {
      currentMarkdown = turndown.turndown(cleanHtml(currentHtml));
      mdPanel.textContent = currentMarkdown;
      mdPanel.classList.remove('empty');
      statusEl.textContent =
        `Markdown: ${currentMarkdown.length.toLocaleString()} chars`;
    } catch (err) {
      mdPanel.textContent = `Conversion error: ${err.message}`;
      mdPanel.classList.remove('empty');
      statusEl.textContent = 'Markdown conversion failed.';
    }
  }, 0);
}

// ── Copy ─────────────────────────────────────────────────────────────────────

copyBtn.addEventListener('click', async () => {
  const text = activeTab === 'markdown' ? currentMarkdown : currentHtml;
  if (!text) {
    statusEl.textContent = 'Nothing to copy — read a page first.';
    return;
  }
  await navigator.clipboard.writeText(text);
  statusEl.textContent = `Copied ${activeTab} to clipboard!`;
});

// ── Slack ─────────────────────────────────────────────────────────────────────

const tokenInput      = document.getElementById('tokenInput');
const channelInput    = document.getElementById('channelInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const messageInput    = document.getElementById('messageInput');
const charCount       = document.getElementById('charCount');
const sendBtn         = document.getElementById('sendBtn');

// Load saved settings into inputs on startup
chrome.storage.local.get(['slackToken', 'slackChannel'], (result = {}) => {
  if (chrome.runtime.lastError) return;
  if (result.slackToken)   tokenInput.value   = result.slackToken;
  if (result.slackChannel) channelInput.value = result.slackChannel;
});

// Persist settings whenever an input changes
function saveSlackSettings() {
  const token   = tokenInput.value.trim();
  const channel = channelInput.value.trim();
  if (!token && !channel) return;
  chrome.storage.local.set({ slackToken: token, slackChannel: channel });
}

tokenInput.addEventListener('change',   saveSlackSettings);
channelInput.addEventListener('change', saveSlackSettings);

saveSettingsBtn.addEventListener('click', () => {
  const token   = tokenInput.value.trim();
  const channel = channelInput.value.trim();
  if (!token || !channel) {
    statusEl.textContent = 'Enter both a token and a channel ID before saving.';
    return;
  }
  chrome.storage.local.set({ slackToken: token, slackChannel: channel }, () => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = `Save failed: ${chrome.runtime.lastError.message}`;
      return;
    }
    statusEl.textContent = 'Slack settings saved.';
  });
});

messageInput.addEventListener('input', () => {
  charCount.textContent = `${messageInput.value.length} chars`;
});

sendBtn.addEventListener('click', async () => {
  const text    = messageInput.value.trim();
  const token   = tokenInput.value.trim();
  const channel = channelInput.value.trim();

  if (!text) {
    statusEl.textContent = 'Type a message first.';
    return;
  }
  if (!token || !channel) {
    statusEl.textContent = 'Enter your bot token and channel ID above.';
    return;
  }

  sendBtn.disabled = true;
  statusEl.textContent = 'Sending…';

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel, text }),
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    messageInput.value = '';
    charCount.textContent = '0 chars';
    statusEl.textContent = 'Message sent!';
  } catch (err) {
    statusEl.textContent = `Slack error: ${err.message}`;
  } finally {
    sendBtn.disabled = false;
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetPanels() {
  currentHtml     = '';
  currentMarkdown = '';

  htmlPanel.textContent = '';
  htmlPanel.classList.add('empty');
  mdPanel.textContent = '';
  mdPanel.classList.add('empty');
}