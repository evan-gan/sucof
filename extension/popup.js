const readBtn  = document.getElementById('readBtn');
const copyBtn  = document.getElementById('copyBtn');
const statusEl = document.getElementById('status');
const htmlPanel = document.getElementById('htmlPanel');
const mdPanel   = document.getElementById('markdownPanel');
const tabs      = document.querySelectorAll('.tab');

let currentHtml     = '';
let currentMarkdown = '';
let activeTab       = 'html';

// ── Tab switching ────────────────────────────────────────────────────────────

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;

    tabs.forEach(t => t.classList.toggle('active', t === tab));
    htmlPanel.classList.toggle('active', activeTab === 'html');
    mdPanel.classList.toggle('active',   activeTab === 'markdown');

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
  headingStyle:   'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence:          '```',
  hr:             '---',
  strongDelimiter: '**',
  emDelimiter:    '*',
});

function convertToMarkdown() {
  statusEl.textContent = 'Converting to markdown…';
  mdPanel.classList.add('empty');

  // Yield to the browser so the status update paints before the (sync) parse
  setTimeout(() => {
    try {
      currentMarkdown = turndown.turndown(currentHtml);
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetPanels() {
  currentHtml     = '';
  currentMarkdown = '';

  htmlPanel.textContent = '';
  htmlPanel.classList.add('empty');
  mdPanel.textContent = '';
  mdPanel.classList.add('empty');
}