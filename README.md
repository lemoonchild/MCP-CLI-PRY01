
# CLI to Test MCP (Filesystem, Git, and Food Recommender)

This CLI lets you chat with an LLM (Anthropic) and **enable MCP tools** via STDIO:

* **Filesystem** (create folders, write files, list directories)  
* **Git** (init, add, commit, status, log, show)  
* **Food** (geocode, search nearby/text, restaurant details and ranking)

When you enable *tools mode*, the LLM can **discover** and **use** these tools automatically.

---

## Main Structure

* `src/main.mjs` → Chat loop, commands, Anthropic integration, and tools.  
* `src/healthcheck.mjs` → Quick connectivity check with the 3 MCP servers.  
* `src/logger.mjs` → Session logs in JSONL format.  
* `src/mcp/connect.mjs` → MCP server connection via STDIO.  
* `src/mcp/servers.mjs` → Loads `.env` configs (FS, Git, Food).  
* `src/mcp/toolbridge.mjs` → Unified tool catalog and call routing.  
* `src/mcp/tools/*` → Specific tool handlers (filesystem, git) and utilities to list/call tools.

---

## Requirements

* Node.js 18+  
* **Anthropic API Key** (to use the `claude-3-5-sonnet-20240620` model by default)  
* MCP servers accessible via **STDIO**:
  * Filesystem MCP  
  * Git MCP  
  * Food MCP (Google-based recommendation server)

> Food MCP additionally requires a **Google API Key** and a **build** of your server (see Variables and Notes section).

---

## Installation

```bash
npm install
```

---

## Usage

### 1) Healthcheck (optional)

Check basic connectivity with all three MCP servers:

```bash
node src/healthcheck.mjs
```

Expected output (example):

```
--- MCP Healthcheck ---
Filesystem responded, tools: [ ... ]
Git responded, tools: [ ... ]
Food responded, tools: [ geocode, places_findNearby, places_findByText, places_details, ranking_rank ]
--- End Healthcheck ---
```

---

### 2) Start the CLI Chat

```bash
node src/main.mjs
```

You’ll see something like:

```
-- LLM Chat with Anthropic (multi-turn) --
Commands:
  /salir → exit
  /clear → clear context
  /mcp:connect → connect FS and Git
  /tools:on → connect MCP and enable tool usage by the LLM
  /tools:off → disable tool usage
  /demo:git <name> → create repo, README, and commit in ./repos/<name>

(Logs saved in: .../src/logs/session-...jsonl)
```

---

## CLI Commands

* **`/salir`**: exit the program.  
* **`/clear`**: clear session history with the LLM.  
* **`/mcp:connect`**: connect all MCP servers (Filesystem, Git, Food).  
  > *Tip:* This shows "MCP connected (FS + Git)" by default; use `tools:on` to see available tools.  
* **`/tools:on`**: connect MCP **and** announce tools to the LLM. Enables “tools mode.”  
* **`/tools:off`**: disable “tools mode.”  
* **`/demo:git <name>`**: create a demo repo with a README and an initial commit.

When *tools mode* is **ENABLED**, the LLM can:

* read the catalog of available tools (Filesystem, Git, Food),  
* call them automatically based on your prompt,  
* and chain them (if it decides) to deliver a final response.

---

## Test the Food MCP

1. **Connect to all MCP servers**:

```
/mcp:connect
```

2. **Enable tools**:

```
/tools:on
```

You’ll see tool lists per server, including Food MCP.

3. **Example prompts** (the LLM decides which tools to use):

* "I’m at **6a Avenida 12-34 Zona 1**. I want **tacos** **open now**, **within 1.5 km**, **cheap**, and with a **minimum rating of 4.2**. Give me the **top 5**."  
* "Looking for **vegan ramen** **under Q60**, near me and **open now**."  
* "Only **\$ and \$\$**, **min rating 4.0**, **within 2 km**, **pizza**."

> Under the hood:
> 
> * The LLM might call `geocode` (if you provided an address), `places_findByText` or `places_findNearby` for candidates, and `ranking_rank` with your profile (keywords, priceLevels, minRating, requireOpen, maxDistanceKm, and optionally `maxBudget`).

---

## Logs

* Stored in `src/logs/session-YYYY-MM-DDTHH-MM-SS-sssZ.jsonl`.  
* Each line is JSON: `{ timestamp, role, content }`.  
* Useful for debugging and auditing tool calls.

---

## Troubleshooting

### 1) "Missing ANTHROPIC_API_KEY in your .env file"

* Ensure you have the key in `.env` and are running with `dotenv/config` (already imported in `main.mjs`).

### 2) "MCP_*_COMMAND is not defined in .env"

* Make sure you’ve defined the variables for each MCP server:
  * `MCP_FS_COMMAND`, `MCP_FS_ARGS`  
  * `MCP_GIT_COMMAND`, `MCP_GIT_ARGS`  
  * `MCP_FOOD_COMMAND`, `MCP_FOOD_ARGS`
  * `MCP_JOKES_URL`, `MCP_JOKES_URL`

### 3) MCP connection timeouts/errors

* Run `node src/healthcheck.mjs` to isolate the issue.  
* Verify `MCP_*_ARGS` points to an **existing** file runnable with `node`.  
* For Food MCP: confirm you ran `npm run build` and `dist/src/index.js` exists.

### 4) Google API (Food MCP)

* Make sure `GOOGLE_API_KEY` is exported in the **same environment** running Food MCP (CLI forwards `env: { ...process.env }`).  
* Enable **Geocoding API** and **Places API v1** in Google Cloud. Google requires a card to create the key (with **$300 free credits** initially).

### 5) Filesystem/Git paths

* The *toolbridge* enforces paths under `MCP_BASE_REPOS` and `MCP_BASE_DEMO` for safety. Absolute paths are normalized to keep you within those bases.

---

## How *tools mode* Works

1. `buildToolCatalog` discovers tools from each server and creates a unified catalog for Anthropic (`toolsForAnthropic`).  
2. The LLM responds with `tool_use` events.  
3. `fulfillToolUses` routes each `tool_use` to the appropriate MCP server and **sanitizes** arguments (paths, repos) per tool.  
4. `tool_result` responses are sent back to the LLM until it generates the final answer.

---

## Security Notes

* Filesystem and Git paths are restricted to base folders (`MCP_BASE_REPOS`, `MCP_BASE_DEMO`).  
* All tool executions are logged (redact secrets before sharing logs publicly).