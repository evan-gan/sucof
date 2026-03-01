/**
 * mcp.js – Tool Definitions
 *
 * Add tools here so the AI can call them during a conversation.
 * Each tool needs:
 *   name        : string  – what the model calls the tool
 *   description : string  – what it does
 *   args        : object  – { argName: "type – description" } (shown in prompt)
 *   execute     : async (args, context) => string
 *
 * `context` passed to execute:
 *   pageMarkdown : string  – current page content (empty if not yet fetched)
 *   fetchPage    : async () => string  – fetches and returns page markdown
 *
 * ── Adding a tool ────────────────────────────────────────────────────────────
 * Push a new object into MCP_TOOLS. The model will automatically know about it.
 */

const MCP_TOOLS = [
  {
    name: 'get_page_content',
    description: 'Read the full content of the web page the user is viewing. Call this before answering questions about the page.',
    args: {},
    execute: async (_args, { fetchPage }) => fetchPage(),
  },

  {
    name: 'get_current_time',
    description: 'Get the current local date and time.',
    args: {},
    execute: async () => new Date().toLocaleString(),
  },

  {
    name: 'search_page',
    description: 'Search the page for lines containing a given term. Fetches the page first if needed. Returns up to 20 matches. The query must be keywords from the user request (not a guessed answer).',
    args: { query: 'string – keyword or short phrase to find (case-insensitive). Use user-provided terms, not invented facts.' },
    execute: async ({ query }, { pageMarkdown, fetchPage }) => {
      const content = pageMarkdown || await fetchPage();
      const matches = content
        .split('\n')
        .filter(l => l.toLowerCase().includes(query.toLowerCase()));
      return matches.length
        ? matches.slice(0, 20).join('\n')
        : `No matches for "${query}".`;
    },
  },

  {
    name: 'send_slack_message',
    description: 'Send a message to a Slack channel using the bot token and channel ID configured in Settings.',
    args: {
      message: 'string – the message text to send',
    },
    execute: async ({ message }) => {
      let settings = {};
      try { settings = JSON.parse(localStorage.getItem('sucof_settings')) || {}; } catch {}
      const token = settings.token;
      const channelId = settings.channelId;
      if (!token) return 'Error: No Slack token configured. Add one in Settings (xoxb-…).';
      if (!channelId) return 'Error: No channel ID configured. Add one in Settings or pass a channel argument.';
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ channel: channelId, text: message }),
      });
      const data = await res.json();
      if (!data.ok) return `Slack error: ${data.error}`;
      return `Message sent to ${channelId}.`;
    },
  },

  {
    name: 'schedule_productivity_check',
    description: 'Schedule a future check-in that automatically reopens this chat and sends a prompt you write. Use this to snitch on users who stopped being productive — schedule it to fire in a few minutes and call them out.',
    args: {
      // IMPORTANT: delay_minutes must be a plain integer like 5 or 10 — NOT true/false/yes/no
      delay_minutes: 'integer – whole number of minutes from now before the check-in fires (minimum 1). Example: 5  NOT true, NOT false, NOT "5 minutes" — just the digit(s).',
      prompt: 'string – the message to auto-send when the check-in fires (should call out non-productive behavior, e.g. "You\'ve been on YouTube for 10 minutes — get back to work!")',
    },
    execute: async ({ delay_minutes, prompt }) => {
      // Clamp to a minimum of 1 minute so alarms always fire in the future
      const delayNum = Math.max(1, parseFloat(delay_minutes) || 1);
      const alarmName = `productivity_check_${Date.now()}`;

      // Persist the prompt keyed by alarm name so background.js can retrieve it
      await chrome.storage.local.set({
        [`alarm_${alarmName}`]: { prompt, scheduledAt: new Date().toISOString() },
      });

      // chrome.alarms uses minutes as the unit
      chrome.alarms.create(alarmName, { delayInMinutes: delayNum });

      const fireTime = new Date(Date.now() + delayNum * 60 * 1000).toLocaleTimeString();
      return `Productivity check scheduled for ${fireTime} (${delayNum} minute${delayNum !== 1 ? 's' : ''} from now). Prompt saved: "${prompt}"`;
    },
  },

  // Add your own tools below:
  //
  // {
  //   name: 'count_words',
  //   description: 'Count the total words on the current page.',
  //   args: {},
  //   execute: async (_args, { pageMarkdown, fetchPage }) => {
  //     const content = pageMarkdown || await fetchPage();
  //     return content.split(/\s+/).filter(Boolean).length + ' words';
  //   },
  // },
];

// ── Helpers used by popup.js ──────────────────────────────────────────────────

/**
 * Build the system prompt for the first turn.
 * Page content is NOT embedded here — the model uses get_page_content when needed.
 */
function buildSystemPrompt() {
  const toolLines = MCP_TOOLS.map(t => {
    const argStr = Object.keys(t.args).length
      ? Object.entries(t.args).map(([k, v]) => `      ${k}: ${v}`).join('\n')
      : '      (no arguments)';
    return `  • ${t.name}: ${t.description}\n${argStr}`;
  }).join('\n');

  const toolSection = MCP_TOOLS.length ? `

## How to call a tool — read carefully
To call a tool you MUST output EXACTLY this format and nothing else — no extra text, no code fences, no JSON:

TOOL_USE
TOOL: tool_name_here
argument_name: argument value here
TOOL_USE_END

─── CORRECT EXAMPLES ────────────────────────────────────────────
Example 1 – send a Slack message:
TOOL_USE
TOOL: send_slack_message
message: Hello from the bot!
TOOL_USE_END

Example 2 - search the page:
TOOL_USE
TOOL: search_page
query: pricing
TOOL_USE_END

Example 3 – get page content (no arguments):
TOOL_USE
TOOL: get_page_content
TOOL_USE_END

Example 4 – schedule a productivity check in 5 minutes:
TOOL_USE
TOOL: schedule_productivity_check
delay_minutes: 5
prompt: You've been slacking for 5 minutes — get back to work!
TOOL_USE_END
(delay_minutes is a plain integer — 5, 10, 15 — NEVER true, false, yes, or no)

─── WRONG — NEVER DO THESE ──────────────────────────────────────
❌ Wrong: using a code fence or "tool_output" label:
\`\`\`tool_output
send_slack_message: "Hello!"
\`\`\`

❌ Wrong: using JSON:
{"action":"tool","name":"send_slack_message","args":{"message":"Hello!"}}

❌ Wrong: just writing the tool name and value without the TOOL_USE wrapper:
send_slack_message: "Hello!"

❌ Wrong: wrapping the arg value in quotes:
TOOL_USE
TOOL: send_slack_message
message: "Hello!"
TOOL_USE_END
(Correct: message: Hello!  — no quote marks around the value)

❌ Wrong: adding extra text before or after the block:
I'll send the message now.
TOOL_USE
TOOL: send_slack_message
message: Hello!
TOOL_USE_END
Here it is!

The TOOL_USE / TOOL_USE_END wrapper is REQUIRED every single time. Nothing else is acceptable.
─────────────────────────────────────────────────────────────────

Tool argument accuracy rules:
- Never invent facts, quotes, numbers, or page content in tool arguments.
- Use only information from (a) the user's message and (b) prior tool results.
- For search_page.query, pass literal keywords/phrases to find (e.g. "refund", "pricing").
- Do NOT write a guessed answer as the search_page.query value.
- For "search the page and send to Slack": (1) call get_page_content, (2) summarise from that result, (3) call send_slack_message with the summary.
- For schedule_productivity_check.delay_minutes: write a bare integer only (e.g. 5). NEVER write true, false, yes, no, or a sentence.

─── TOOL SPAM RULES — violations will break everything ──────────
❌ NEVER call the same tool twice in a row with the same arguments — the result will be identical.
❌ NEVER call get_page_content more than once per conversation — page content does not change.
❌ NEVER call a tool "just to confirm" something you already have a result for.
❌ NEVER chain more than 3 tool calls in a single response turn.
✅ Once you have a tool result, USE IT — answer from the result, do not call more tools.
✅ Call ONE tool at a time. Wait for its result before deciding whether another tool is needed.
✅ If the user asks a simple question that doesn't need the page, answer directly without any tool.
─────────────────────────────────────────────────────────────────

Available tools:
${toolLines}

After a tool result is given to you, reply with your final answer as plain text.` : '';

  return `You are a helpful, friendly assistant. The user is viewing a web page.

IMPORTANT: You MUST use tools to gather information — NEVER guess, assume, or answer from memory. If you don't have the information yet, call a tool to get it first.

Reply with plain text. Do NOT use JSON or any special format for regular responses.${toolSection}`;
}

/**
 * Parse a TOOL_USE block from model output.
 * Returns { name, args } or null if no valid block is found.
 *
 * Tolerates a missing TOOL_USE_END: if the closing tag is absent the block is
 * parsed to end-of-string, allowing dumb models that forget the tag to still
 * trigger tools once all their args have been emitted.
 *
 * Also strips surrounding double-quotes from arg values so that a model
 * writing  message: "Hello"  is treated the same as  message: Hello.
 *
 * Format:
 *   TOOL_USE
 *   TOOL: tool_name
 *   arg: single-line value
 *   arg2: first line
 *   |continuation line
 *   TOOL_USE_END          ← optional
 */
function parseToolUse(text) {
  // Prefer a properly-closed block; fall back to end-of-string if TOOL_USE_END is missing.
  const match =
    text.match(/TOOL_USE[\r\n]+TOOL:\s*(\S+)[\r\n]+([\s\S]*?)[\r\n]*TOOL_USE_END/) ??
    text.match(/TOOL_USE[\r\n]+TOOL:\s*(\S+)[\r\n]+([\s\S]*)$/);
  if (!match) return null;

  const name = match[1].trim();

  // Only accept the fallback (no closing tag) when the named tool exists and
  // every one of its declared args has been provided — avoids false positives
  // on a still-streaming partial response.
  const tool = MCP_TOOLS.find(t => t.name === name);
  const hasClosed = text.includes('TOOL_USE_END');
  if (!hasClosed && tool) {
    const requiredArgs = Object.keys(tool.args);
    const presentArgs = [...match[2].matchAll(/^(\w+):/gm)].map(m => m[1]);
    const allPresent = requiredArgs.every(k => presentArgs.includes(k));
    if (!allPresent) return null;
  }

  const args = {};
  let currentKey = null;
  for (const raw of match[2].split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('|')) {
      if (currentKey !== null) args[currentKey] += '\n' + line.slice(1);
    } else {
      const colon = line.indexOf(':');
      if (colon !== -1) {
        currentKey = line.slice(0, colon).trim();
        let value = line.slice(colon + 1).trim();
        // Strip surrounding double-quotes that dumb models sometimes add.
        if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
          value = value.slice(1, -1);
        }
        args[currentKey] = value;
      }
    }
  }
  return { name, args };
}

/** Execute a tool by name. Always returns a string. */
async function runMCPTool(name, args, context) {
  const tool = MCP_TOOLS.find(t => t.name === name);
  if (!tool) return `Unknown tool: "${name}".`;
  try {
    return String(await tool.execute(args ?? {}, context));
  } catch (err) {
    return `Error in "${name}": ${err.message}`;
  }
}
