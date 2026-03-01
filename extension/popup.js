const readBtn = document.getElementById('readBtn');
const copyBtn = document.getElementById('copyBtn');
const output = document.getElementById('output');
const status = document.getElementById('status');

let currentHtml = '';

readBtn.addEventListener('click', async () => {
  status.textContent = 'Reading...';
  output.textContent = '';
  output.classList.add('empty');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });

    currentHtml = results[0].result;
    output.textContent = currentHtml;
    output.classList.remove('empty');
    status.textContent = `Loaded ${currentHtml.length.toLocaleString()} characters from: ${tab.url}`;
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
    output.classList.remove('empty');
    status.textContent = 'Failed to read page HTML.';
  }
});

copyBtn.addEventListener('click', async () => {
  if (!currentHtml) {
    status.textContent = 'Nothing to copy — read a page first.';
    return;
  }
  await navigator.clipboard.writeText(currentHtml);
  status.textContent = 'Copied to clipboard!';
});
