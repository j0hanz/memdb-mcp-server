# memdb

[![npm version](https://img.shields.io/npm/v/%40j0hanz%2Fmemdb)](https://www.npmjs.com/package/@j0hanz/memdb) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT) [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?logo=node.js)](https://nodejs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org/) [![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.26-blueviolet)](https://modelcontextprotocol.io/)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0078d7?logo=visual-studio-code&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%7B%22name%22%3A%22memdb%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemdb%40latest%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?logo=visual-studio-code&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%7B%22name%22%3A%22memdb%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemdb%40latest%22%5D%7D)

> A SQLite-backed MCP memory server with local workspace storage, full-text search (FTS5), and knowledge graph capabilities for AI assistants.

---

## Overview

**memdb** is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides persistent memory storage for AI assistants. It uses Node.js's native `node:sqlite` module to store memories locally with SHA-256 content deduplication, FTS5 full-text search, and a knowledge graph of typed relationships between memories. Communication happens over **stdio** transport.

## Key Features

- **Persistent local storage** — SQLite database stored in the workspace (`.memdb/memory.db` by default) with WAL mode for performance
- **Full-text search** — FTS5-powered content and tag search with BM25 relevance scoring and recency boosting
- **Knowledge graph** — Directed, typed relationships between memories with recursive graph traversal (`recall`)
- **SHA-256 deduplication** — Content-addressed storage prevents duplicate memories automatically
- **Batch operations** — Store or delete up to 50 memories in a single call with partial success support
- **Memory classification** — Categorize memories by type (general, fact, plan, decision, reflection, lesson, error, gradient) and importance (0–10)
- **Protocol safety** — Custom stdio transport that rejects JSON-RPC batch requests, protocol version guard, and tool execution timeouts

## Tech Stack

| Component       | Technology                                |
| --------------- | ----------------------------------------- |
| Runtime         | Node.js ≥ 24                              |
| Language        | TypeScript 5.9 (strict mode)              |
| MCP SDK         | `@modelcontextprotocol/sdk` v1.26.0       |
| Database        | SQLite via native `node:sqlite` with FTS5 |
| Validation      | Zod v4                                    |
| Transport       | stdio                                     |
| Package Manager | npm                                       |

## Architecture

```text
┌─────────────────────────────────────────────┐
│                   Client                    │
└──────────────────┬──────────────────────────┘
                   │ stdio (JSON-RPC)
┌──────────────────▼──────────────────────────┐
│ 1. BatchRejectingStdioServerTransport       │  ← Rejects JSON-RPC batch arrays
│ 2. ProtocolVersionGuardTransport            │  ← Validates protocol version
│ 3. McpServer (MCP SDK)                      │  ← Tool/resource registration
│ 4. Tool handlers with timeout + error wrap  │  ← Zod validation, abort signals
│ 5. Core layer (db, search, relationships)   │  ← SQLite + FTS5 + knowledge graph
└─────────────────────────────────────────────┘
```

## Repository Structure

```text
memdb/
├── src/
│   ├── core/               # Database and business logic
│   │   ├── db.ts            # SQLite connection, schema, WAL, statement cache
│   │   ├── memory-read.ts   # Get, delete, stats operations
│   │   ├── memory-write.ts  # Store, update with SHA-256 deduplication
│   │   ├── relationships.ts # Knowledge graph edge operations
│   │   ├── search.ts        # FTS5 search and graph traversal (recall)
│   │   └── abort.ts         # Abort signal utilities
│   ├── index.ts             # Server entrypoint, stdio transport, shutdown
│   ├── tools.ts             # MCP tool registration with timeout handling
│   ├── schemas.ts           # Zod schemas for all 12 tools
│   ├── types.ts             # TypeScript interfaces
│   ├── config.ts            # Environment variable configuration
│   ├── logger.ts            # Logging (console.error, never stdout)
│   ├── stdio-transport.ts   # Custom stdio transport with batch rejection
│   ├── protocol-version-guard.ts  # Protocol version validation
│   ├── instructions.md      # User-facing instructions (MCP resource)
│   ├── async-context.ts     # AsyncLocalStorage for tool context
│   └── error-utils.ts       # Error message extraction
├── tests/                   # node:test runner tests
├── scripts/                 # Build & task automation
├── assets/                  # Logo/icon assets
├── .github/workflows/       # CI/CD (npm publish on release)
├── package.json
├── tsconfig.json
└── eslint.config.mjs
```

## Requirements

- **Node.js ≥ 24** — required for the native `node:sqlite` module

## Quickstart

The fastest way to start using memdb is via `npx`:

```bash
npx -y @j0hanz/memdb@latest
```

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "memdb": {
      "command": "npx",
      "args": ["-y", "@j0hanz/memdb@latest"]
    }
  }
}
```

## Installation

### NPX (recommended)

No installation needed — runs the latest version directly:

```bash
npx -y @j0hanz/memdb@latest
```

### Global Install

```bash
npm install -g @j0hanz/memdb
memdb
```

### From Source

```bash
git clone https://github.com/j0hanz/memdb-mcp-server.git
cd memdb-mcp-server
npm install
npm run build
npm start
```

## Configuration

### Environment Variables

| Variable                | Type                        | Default            | Description                                                                    |
| ----------------------- | --------------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `MEMDB_PATH`            | `string`                    | `.memdb/memory.db` | Path to the SQLite database file. Set to `:memory:` for an in-memory database. |
| `MEMDB_LOG_LEVEL`       | `error` \| `warn` \| `info` | `info`             | Logging verbosity level                                                        |
| `MEMDB_TOOL_TIMEOUT_MS` | `integer`                   | `15000`            | Tool execution timeout in milliseconds (non-negative integer)                  |

Environment variables can be set via a `.env` file when using `npm run dev:run`, or passed directly to the process.

### Database Location

By default, memdb creates the database at `.memdb/memory.db` relative to the working directory. The directory is created automatically if it doesn't exist.

## Usage

memdb communicates exclusively over **stdio** transport. Start the server and connect via any MCP-compatible client:

```bash
# Direct
node dist/index.js

# Via npx
npx -y @j0hanz/memdb@latest

# With custom database path
MEMDB_PATH=/path/to/my.db npx -y @j0hanz/memdb@latest
```

## MCP Surface

### Tools

memdb exposes **12 tools** organized into memory management, search, knowledge graph, and diagnostics.

---

#### `store_memory`

Store a new memory with tags. Idempotent — storing the same content returns the existing hash.

| Parameter     | Type       | Required | Default     | Description                                                                                      |
| ------------- | ---------- | -------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `content`     | `string`   | Yes      | —           | The content of the memory (1–100,000 chars)                                                      |
| `tags`        | `string[]` | Yes      | —           | Tags to categorize the memory (1–100 tags, no whitespace, max 50 chars each)                     |
| `importance`  | `integer`  | No       | `0`         | Priority level 0–10 (0=lowest, 10=critical). Higher importance memories surface first in search. |
| `memory_type` | `string`   | No       | `"general"` | Category: `general`, `fact`, `plan`, `decision`, `reflection`, `lesson`, `error`, `gradient`     |

**Returns:**

```json
{
  "ok": true,
  "result": {
    "id": 1,
    "hash": "a1b2c3d4e5f6...",
    "isNew": true
  }
}
```

---

#### `store_memories`

Store multiple memories in a single batch operation (1–50 items). Supports partial success.

| Parameter | Type       | Required | Default | Description                                                                                            |
| --------- | ---------- | -------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `items`   | `object[]` | Yes      | —       | Array of 1–50 memory objects, each with `content`, `tags`, and optional `importance` and `memory_type` |

**Returns:**

```json
{
  "ok": true,
  "result": {
    "results": [
      { "ok": true, "index": 0, "hash": "a1b2...", "isNew": true },
      { "ok": false, "index": 1, "error": "Tag must not contain whitespace" }
    ],
    "succeeded": 1,
    "failed": 1
  }
}
```

---

#### `get_memory`

Retrieve a single memory by its SHA-256 hash.

| Parameter | Type     | Required | Default | Description                               |
| --------- | -------- | -------- | ------- | ----------------------------------------- |
| `hash`    | `string` | Yes      | —       | SHA-256 hash of the memory (64 hex chars) |

**Returns:**

```json
{
  "ok": true,
  "result": {
    "id": 1,
    "content": "TypeScript uses structural typing",
    "summary": null,
    "tags": ["typescript", "types"],
    "importance": 5,
    "memory_type": "fact",
    "created_at": "2025-01-15 10:30:00",
    "accessed_at": "2025-01-15 10:30:00",
    "hash": "a1b2c3d4..."
  }
}
```

---

#### `update_memory`

Update memory content. Returns the new hash since content changes affect the hash. Idempotent.

| Parameter | Type       | Required | Default | Description                                    |
| --------- | ---------- | -------- | ------- | ---------------------------------------------- |
| `hash`    | `string`   | Yes      | —       | Hash of the memory to update                   |
| `content` | `string`   | Yes      | —       | New content for the memory (1–100,000 chars)   |
| `tags`    | `string[]` | No       | —       | Replace tags (max 100 tags, each max 50 chars) |

**Returns:**

```json
{
  "ok": true,
  "result": {
    "updated": true,
    "oldHash": "a1b2c3d4...",
    "newHash": "e5f6g7h8..."
  }
}
```

---

#### `delete_memory`

Delete a single memory by hash. Destructive operation.

| Parameter | Type     | Required | Default | Description                               |
| --------- | -------- | -------- | ------- | ----------------------------------------- |
| `hash`    | `string` | Yes      | —       | SHA-256 hash of the memory (64 hex chars) |

**Returns:**

```json
{ "ok": true, "result": { "deleted": true } }
```

---

#### `delete_memories`

Delete multiple memories by hash in a single batch operation (1–50 hashes). Supports partial success. Destructive.

| Parameter | Type       | Required | Default | Description                            |
| --------- | ---------- | -------- | ------- | -------------------------------------- |
| `hashes`  | `string[]` | Yes      | —       | Array of 1–50 SHA-256 hashes to delete |

**Returns:**

```json
{
  "ok": true,
  "result": {
    "results": [
      { "hash": "a1b2...", "deleted": true },
      { "hash": "c3d4...", "deleted": false, "error": "Memory not found" }
    ],
    "succeeded": 1,
    "failed": 1
  }
}
```

---

#### `search_memories`

Search memories by content and tags using FTS5 full-text search with BM25 relevance scoring and recency boosting. Read-only.

| Parameter | Type     | Required | Default | Description                                             |
| --------- | -------- | -------- | ------- | ------------------------------------------------------- |
| `query`   | `string` | Yes      | —       | Search query (1–1,000 chars, searches content and tags) |

**Returns:**

```json
{
  "ok": true,
  "result": [
    {
      "id": 1,
      "content": "TypeScript uses structural typing",
      "tags": ["typescript", "types"],
      "importance": 5,
      "memory_type": "fact",
      "relevance": 0.85,
      "hash": "a1b2c3d4...",
      "created_at": "2025-01-15 10:30:00",
      "accessed_at": "2025-01-15 10:30:00"
    }
  ]
}
```

---

#### `recall`

Search for memories and traverse relationships to return a connected graph cluster. Use for deeper context retrieval that follows knowledge graph connections. Read-only.

| Parameter | Type      | Required | Default | Description                                                                      |
| --------- | --------- | -------- | ------- | -------------------------------------------------------------------------------- |
| `query`   | `string`  | Yes      | —       | Search query to find initial memories (1–1,000 chars)                            |
| `depth`   | `integer` | No       | `1`     | How many relationship hops to follow (0–3). 0 = search only, no graph traversal. |

**Returns:**

```json
{
  "ok": true,
  "result": {
    "memories": [{ "id": 1, "content": "...", "relevance": 0.9, "...": "..." }],
    "relationships": [
      {
        "id": 1,
        "from_hash": "a1b2...",
        "to_hash": "c3d4...",
        "relation_type": "related_to",
        "created_at": "2025-01-15 10:30:00"
      }
    ],
    "depth": 1
  }
}
```

---

#### `create_relationship`

Link two memories with a typed, directed relationship. Idempotent — creating the same relationship returns the existing ID.

| Parameter       | Type     | Required | Default | Description                                                                                                        |
| --------------- | -------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `from_hash`     | `string` | Yes      | —       | SHA-256 hash of the source memory                                                                                  |
| `to_hash`       | `string` | Yes      | —       | SHA-256 hash of the target memory                                                                                  |
| `relation_type` | `string` | Yes      | —       | Type of relationship (e.g., `related_to`, `causes`, `depends_on`, `part_of`, `follows`; 1–50 chars, no whitespace) |

**Returns:**

```json
{ "ok": true, "result": { "id": 1, "isNew": true } }
```

---

#### `get_relationships`

Get all relationships for a memory. Read-only.

| Parameter   | Type     | Required | Default  | Description                                         |
| ----------- | -------- | -------- | -------- | --------------------------------------------------- |
| `hash`      | `string` | Yes      | —        | SHA-256 hash of the memory                          |
| `direction` | `string` | No       | `"both"` | Direction filter: `outgoing`, `incoming`, or `both` |

**Returns:**

```json
{
  "ok": true,
  "result": [
    {
      "id": 1,
      "from_hash": "a1b2...",
      "to_hash": "c3d4...",
      "relation_type": "depends_on",
      "created_at": "2025-01-15 10:30:00"
    }
  ]
}
```

---

#### `delete_relationship`

Remove a relationship between two memories. Destructive.

| Parameter       | Type     | Required | Default | Description                       |
| --------------- | -------- | -------- | ------- | --------------------------------- |
| `from_hash`     | `string` | Yes      | —       | SHA-256 hash of the source memory |
| `to_hash`       | `string` | Yes      | —       | SHA-256 hash of the target memory |
| `relation_type` | `string` | Yes      | —       | Type of relationship to delete    |

**Returns:**

```json
{ "ok": true, "result": { "deleted": true } }
```

---

#### `memory_stats`

Database statistics and health. No parameters required. Read-only.

**Returns:**

```json
{
  "ok": true,
  "result": {
    "memoryCount": 42,
    "tagCount": 15,
    "oldestMemory": "2025-01-01 00:00:00",
    "newestMemory": "2025-02-09 12:00:00"
  }
}
```

---

### Resources

| URI                       | MIME Type       | Description                                        |
| ------------------------- | --------------- | -------------------------------------------------- |
| `internal://instructions` | `text/markdown` | Server usage instructions and tool reference guide |

### Prompts

None.

## Client Configuration Examples

<details>
<summary><b>VS Code / VS Code Insiders</b></summary>

Add to your VS Code `settings.json` or use the one-click install buttons above:

```json
{
  "mcp": {
    "servers": {
      "memdb": {
        "command": "npx",
        "args": ["-y", "@j0hanz/memdb@latest"]
      }
    }
  }
}
```

With environment variables:

```json
{
  "mcp": {
    "servers": {
      "memdb": {
        "command": "npx",
        "args": ["-y", "@j0hanz/memdb@latest"],
        "env": {
          "MEMDB_PATH": "${workspaceFolder}/.memdb/memory.db",
          "MEMDB_LOG_LEVEL": "warn"
        }
      }
    }
  }
}
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Add to your Claude Desktop configuration file (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "memdb": {
      "command": "npx",
      "args": ["-y", "@j0hanz/memdb@latest"]
    }
  }
}
```

</details>

<details>
<summary><b>Cursor</b></summary>

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=memdb&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovbWVtZGJAbGF0ZXN0Il19)

Or manually add to Cursor MCP settings:

```json
{
  "mcpServers": {
    "memdb": {
      "command": "npx",
      "args": ["-y", "@j0hanz/memdb@latest"]
    }
  }
}
```

</details>

<details>
<summary><b>Windsurf</b></summary>

Add to your Windsurf MCP configuration:

```json
{
  "mcpServers": {
    "memdb": {
      "command": "npx",
      "args": ["-y", "@j0hanz/memdb@latest"]
    }
  }
}
```

</details>

## Security

- **stdio hygiene** — All logging is sent to `stderr` via `console.error()`. No non-MCP output is written to `stdout`, preventing JSON-RPC corruption.
- **Batch request rejection** — JSON-RPC batch arrays are explicitly rejected by the custom `BatchRejectingStdioServerTransport` with proper error responses per MCP spec (≥ 2025-06-18).
- **Protocol version guard** — Unsupported protocol versions are rejected at the transport layer before reaching tool handlers. The connection is closed after sending the error.
- **Input validation** — All tool inputs are validated via Zod strict schemas at the MCP boundary. Null bytes in environment variables are detected and rejected.
- **Database safety** — SQLite defensive mode is enabled, foreign key constraints are enforced, and the `allowExtension` option is set to `false`.

## Development Workflow

### Prerequisites

- Node.js ≥ 24

### Install dependencies

```bash
npm install
```

### Scripts

| Script          | Command                                  | Purpose                                      |
| --------------- | ---------------------------------------- | -------------------------------------------- |
| `dev`           | `tsc --watch`                            | TypeScript watch mode (compile on change)    |
| `dev:run`       | `node --watch dist/index.js`             | Run server with auto-restart and `.env` file |
| `build`         | `node scripts/tasks.mjs build`           | Compile TypeScript to `dist/`                |
| `start`         | `node dist/index.js`                     | Run the compiled server                      |
| `test`          | `node scripts/tasks.mjs test`            | Run tests with `node:test` runner            |
| `test:coverage` | `node scripts/tasks.mjs test --coverage` | Run tests with coverage                      |
| `type-check`    | `node scripts/tasks.mjs type-check`      | TypeScript type checking (`tsc --noEmit`)    |
| `lint`          | `eslint .`                               | Run ESLint                                   |
| `lint:fix`      | `eslint . --fix`                         | Auto-fix linting issues                      |
| `format`        | `prettier --write .`                     | Format code with Prettier                    |
| `clean`         | `node scripts/tasks.mjs clean`           | Remove build artifacts                       |
| `inspector`     | `npx @modelcontextprotocol/inspector`    | Launch MCP Inspector for debugging           |

## Build and Release

The project publishes to npm via a GitHub Actions workflow triggered on GitHub Releases:

1. Checkout → Setup Node.js 20 → Install dependencies
2. Lint → Type-check → Test → Coverage
3. Build → Extract version from release tag → Publish to npm with trusted publishing (OIDC)

See [`.github/workflows/publish.yml`](.github/workflows/publish.yml) for the full pipeline.

## Troubleshooting

### `node:sqlite` not found

You are running Node.js < 24. The native `node:sqlite` module requires Node.js ≥ 24.

```bash
node --version  # Must be >= 24.0.0
```

### Database locked errors

The server uses SQLite WAL mode. If you see locked errors, ensure no external tools are accessing `.memdb/memory.db` while the server is running.

### FTS5 errors

If you get errors mentioning `fts5` or `no such module`, ensure your Node.js binary includes the standard SQLite FTS5 extension (it should by default in Node.js ≥ 24).

### Debugging with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### stdout corruption (stdio mode)

If your MCP client receives malformed responses, ensure no middleware or debugging tools are writing to `stdout`. memdb routes all logging to `stderr`.

## Contributing

Contributions are welcome! Please ensure your changes pass all checks before submitting:

```bash
npm run lint && npm run type-check && npm run build && npm test
```

## License

[MIT](https://opensource.org/licenses/MIT)
