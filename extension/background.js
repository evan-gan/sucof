/**
 * background.js — Service Worker
 *
 * Listens for scheduled productivity-check alarms (created by the
 * schedule_productivity_check MCP tool in mcp.js).
 *
 * When an alarm fires:
 *   1. Retrieves the saved prompt from chrome.storage.local.
 *   2. Writes it to the `sucof_pending_prompt` key so popup.js picks it up.
 *   3. Opens the extension popup to trigger the auto-send.
 *
 * If openPopup() fails (Chrome not focused), the prompt stays in storage and
 * will be auto-sent the next time the user opens the popup manually.
 */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Only handle alarms that this extension scheduled
  if (!alarm.name.startsWith('productivity_check_')) return;

  const storageKey = `alarm_${alarm.name}`;
  const stored = await chrome.storage.local.get(storageKey);
  const entry = stored[storageKey];

  if (!entry?.prompt) return;

  // Move the prompt into the pending slot for popup.js to consume
  await chrome.storage.local.set({ sucof_pending_prompt: entry.prompt });
  await chrome.storage.local.remove(storageKey);

  // Try to open the popup so the check fires immediately
  try {
    await chrome.action.openPopup();
  } catch {
    // openPopup() throws when the Chrome window isn't focused.
    // The prompt remains in storage and fires on the next manual popup open.
  }
});
