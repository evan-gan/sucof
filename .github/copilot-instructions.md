# sucof Copilot Instructions

## Project overview
- Browser extension that chats with the active web page via a local Ollama model.
- Main runtime files are in `extension/`.
- `popup.js` handles UI, conversation state, and tool-call orchestration.
- `mcp.js` defines MCP tools, tool-call parsing, and system prompt rules.
- `background.js` is the Manifest V3 service worker; handles `chrome.alarms` events for scheduled productivity checks.
- `manifest.json` declares extension permissions and entry points.

## Core behavior
- First user turn seeds a system prompt from `buildSystemPrompt()` in `mcp.js`.
- Model can request tool calls using the `TOOL_USE` block format.
- `popup.js` parses tool calls with `parseToolUse()`, executes them through `runMCPTool()`, then feeds tool results back to the model.
- Tool results are shown in UI as collapsible tool-call chips.

## MCP tools currently available
- `get_page_content`: fetches and returns full page markdown.
- `get_current_time`: returns local date/time.
- `search_page`: keyword search over page markdown (up to 20 matches).
- `send_slack_message`: posts configured text to Slack channel from settings.
- `schedule_productivity_check`: schedules a `chrome.alarms` alarm; when it fires the background service worker stores the prompt in `chrome.storage.local` (`sucof_pending_prompt`) and calls `chrome.action.openPopup()`. On open, `popup.js` consumes the prompt and auto-submits it, triggering the check-in. Minimum delay is 1 minute.

## Prompting constraints
- Tool call format is `TOOL_USE / TOOL: name / args / TOOL_USE_END` — no code fences, no JSON, no bare `tool_output` blocks.
- The prompt includes multiple correct and incorrect (❌) examples to guide small/dumb models.
- Tool arguments must be grounded in user request or prior tool output.
- `search_page.query` should be literal keywords/phrases, not predicted answers.
- For page-summary-to-Slack tasks: fetch page content, summarize from result, then send to Slack.

## Settings
- Slack settings are stored in `localStorage` key `sucof_settings`.
- Current expected keys: `token`, `channelId`.

## Local model runtime
- Extension expects Ollama API at `http://localhost:11434`.
- Model selection is loaded from available tags and stored in `sucof_preferred_model`.

## Editing guidance
- Keep changes focused and minimal; preserve existing UI/UX patterns.
- Prefer extending `MCP_TOOLS` in `mcp.js` for new tool capabilities.
- If adding new tools, include clear argument descriptions and tool-usage constraints in system prompt guidance.
