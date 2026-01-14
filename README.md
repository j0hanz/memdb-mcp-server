# memdb

A SQLite-backed MCP memory server with local workspace storage.

[![npm version](https://img.shields.io/npm/v/@j0hanz/memdb.svg)](https://www.npmjs.com/package/@j0hanz/memdb)

## One-Click Install

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memdb&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemdb%40latest%22%5D%7D)[![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memdb&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemdb%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=memdb&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovbWVtZGJAbGF0ZXN0Il19)

## Features

| Feature          | Description                                                       |
| :--------------- | :---------------------------------------------------------------- |
| Memory Storage   | Store text memories with tags                                     |
| Full-Text Search | FTS5-backed tokenized search with relevance ranking               |
| Stats            | Memory and tag counts + activity range                            |
| Local Privacy    | All data stored locally in SQLite (`.memdb/memory.db` by default) |

## Quick Start

### VS Code / Cursor

Add this to your `mcpServers` configuration:

```json
{
  "memdb": {
    "command": "npx",
    "args": ["-y", "@j0hanz/memdb@latest"]
  }
}
```

## Installation

### NPX (Recommended)

```bash
npx -y @j0hanz/memdb@latest
```

### Global Installation

```bash
npm install -g @j0hanz/memdb
```

### From Source

```bash
git clone https://github.com/j0hanz/memdb-mcp-server.git
cd memdb-mcp-server
npm install
npm run build
```

## Storage

The server uses a local SQLite database at `<cwd>/.memdb/memory.db`. The
directory is created automatically when needed. All data remains local to your
workspace.

> **Tip:** Add `.memdb/` to your `.gitignore` to keep your memory database out of
> version control:
>
> ```bash
> echo ".memdb/" >> .gitignore
> ```

To completely reset or remove all stored memories, simply delete the `.memdb/`
folder. The server will create a fresh database on the next run.

## Tool Response Format

All tools return structured JSON in `structuredContent`. For backwards
compatibility, the first `content` item is a JSON string that matches
`structuredContent`.

Success (`structuredContent`):

```json
{
  "ok": true,
  "result": { "...": "..." }
}
```

Error (`structuredContent`):

```json
{
  "ok": false,
  "error": {
    "code": "E_CODE",
    "message": "Human-readable message"
  }
}
```

Error responses also set `isError: true` on the top-level tool result.

Example `content[0].text`:

```text
{"ok":true,"result":{...}}
```

## Tools

### `store_memory`

Store a new memory with tags.

| Parameter | Type     | Required | Default | Description                                         |
| :-------- | :------- | :------- | :------ | :-------------------------------------------------- |
| `content` | string   | Yes      | -       | The content of the memory (1-100000 chars)          |
| `tags`    | string[] | Yes      | -       | Tags (1-100 tags, no whitespace, max 50 chars each) |

**Returns:** `{ id, hash, isNew }`

Notes:

- Content is deduplicated by MD5 hash. Storing the same content again returns the same hash with `isNew: false`.
- Tags must not contain whitespace. Use hyphens for compound words (e.g., `api-design`, `error-handling`).

### `store_memories`

Store multiple memories in a single batch operation.

| Parameter | Type     | Required | Default | Description                            |
| :-------- | :------- | :------- | :------ | :------------------------------------- |
| `items`   | object[] | Yes      | -       | Array of memory items (1-50 items max) |

Each item in `items` has:

| Field     | Type     | Required | Default | Description                                         |
| :-------- | :------- | :------- | :------ | :-------------------------------------------------- |
| `content` | string   | Yes      | -       | The content of the memory (1-100000 chars)          |
| `tags`    | string[] | Yes      | -       | Tags (1-100 tags, no whitespace, max 50 chars each) |

**Returns:** `{ results, succeeded, failed }`

- `results`: Array of `{ index, hash?, isNew?, error? }` for each item
- `succeeded`: Count of successfully stored memories
- `failed`: Count of failed items

Notes:

- Supports partial success: if one item fails, others still process.
- Each item is validated independently.
- Useful for bulk memory imports.

### `search_memories`

Search memories by content and tags.

| Parameter | Type   | Required | Default | Description                               |
| :-------- | :----- | :------- | :------ | :---------------------------------------- |
| `query`   | string | Yes      | -       | Search query (1-1000 chars, max 50 terms) |

**Returns:** Array of search results (`Memory` + `relevance`, includes `tags`).

Notes:

- Searches both memory content (full-text) and tags.
- Returns up to 100 results, ranked by relevance.
- Content matches rank higher than tag matches.

### `get_memory`

Retrieve a specific memory by its hash.

| Parameter | Type   | Required | Default | Description         |
| :-------- | :----- | :------- | :------ | :------------------ |
| `hash`    | string | Yes      | -       | MD5 hash (32 chars) |

**Returns:** `Memory` (includes `tags`).

Notes:

- Updates `accessed_at` on read.

### `delete_memory`

Delete a memory by its hash.

| Parameter | Type   | Required | Default | Description         |
| :-------- | :----- | :------- | :------ | :------------------ |
| `hash`    | string | Yes      | -       | MD5 hash (32 chars) |

**Returns:** `{ deleted: true }`.

### `delete_memories`

Delete multiple memories by hash in a single batch operation.

| Parameter | Type     | Required | Default | Description                           |
| :-------- | :------- | :------- | :------ | :------------------------------------ |
| `hashes`  | string[] | Yes      | -       | Array of MD5 hashes (1-50 hashes max) |

**Returns:** `{ results, succeeded, failed }`

- `results`: Array of `{ hash, deleted, error? }` for each hash
- `succeeded`: Count of successfully deleted memories
- `failed`: Count of hashes not found or failed

Notes:

- Supports partial success: if one hash doesn't exist, others still delete.
- Returns `deleted: false` for non-existent hashes (not an error).
- Useful for bulk cleanup operations.

### `memory_stats`

Get database statistics.

_No parameters required._

**Returns:** `{ memoryCount, tagCount, oldestMemory, newestMemory }`.

### `update_memory`

Update the content of a memory. Returns the new hash since changing content changes the hash.

| Parameter | Type     | Required | Default | Description                             |
| :-------- | :------- | :------- | :------ | :-------------------------------------- |
| `hash`    | string   | Yes      | -       | MD5 hash of memory to update (32 chars) |
| `content` | string   | Yes      | -       | New content (1-100000 chars)            |
| `tags`    | string[] | No       | -       | Replace tags (max 100, each 1-50 chars) |

**Returns:** `{ updated: true, oldHash, newHash }`.

Notes:

- If `tags` is omitted, existing tags are preserved.
- If `tags` is provided, it replaces all existing tags for the memory.
- Updating to content that already exists in another memory returns an error.

### Memory Fields

All memory-shaped responses include:

- `id`: integer ID
- `content`: original content string
- `summary`: optional summary (currently unset by tools)
- `tags`: string array
- `created_at`: timestamp string
- `accessed_at`: timestamp string
- `hash`: MD5 hash

## Client Configuration

<details>
<summary><b>VS Code</b></summary>

Add to your `settings.json` or `mcpServers` config:

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
<summary><b>Claude Desktop</b></summary>

Add to your `claude_desktop_config.json`:

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

1. Go to **Cursor Settings** > **Features** > **MCP**
2. Click **+ Add New MCP Server**
3. Name: `memdb`
4. Type: `command`
5. Command: `npx -y @j0hanz/memdb@latest`

</details>

## Limits & Constraints

| Constraint              | Value         | Description                                                                   |
| :---------------------- | :------------ | :---------------------------------------------------------------------------- |
| **Max content length**  | 100,000 chars | Maximum characters in memory content                                          |
| **Max query length**    | 1,000 chars   | Maximum characters in search query                                            |
| **Max search terms**    | 50            | Maximum whitespace-separated terms per query                                  |
| **Max search results**  | 100           | Maximum results returned from `search_memories`                               |
| **Min tags per memory** | 1             | At least one tag is required                                                  |
| **Max tags per memory** | 100           | Maximum number of tags when storing a memory                                  |
| **Max tag length**      | 50 chars      | Maximum characters per tag                                                    |
| **Tag format**          | No whitespace | Tags cannot contain spaces or tabs; use hyphens for compound words            |
| **Hash length**         | 32 chars      | MD5 hash length                                                               |
| **Batch store limit**   | 50 items      | Maximum items per `store_memories` call                                       |
| **Batch delete limit**  | 50 hashes     | Maximum hashes per `delete_memories` call                                     |
| **Search mode**         | Tokenized OR  | Whitespace-split terms are quoted and OR'ed; FTS5 operators are not supported |

### Notes

- **Content deduplication**: Memories are deduplicated using MD5 hashes.
- **Search errors**: If FTS5 is unavailable, `search_memories` returns an error indicating the index is missing. Invalid query syntax returns an error with details.
- **Search tokenization**: Queries are split on whitespace (max 50 terms); whitespace-only queries are rejected.
- **Batch operations**: `store_memories` and `delete_memories` support partial success—individual item failures don't affect other items in the batch.
- **Tag requirements**: At least one tag is required. Tags cannot contain whitespace; use hyphens for compound words (e.g., `api-design`).
- **Local storage**: All data is stored locally in `.memdb/memory.db`.

## Development

### Prerequisites

- Node.js >= 22.0.0 (required for `node:sqlite`)

### Scripts

| Command                   | Description                                |
| :------------------------ | :----------------------------------------- |
| `npm run clean`           | Remove `dist/`                             |
| `npm run build`           | Compile TypeScript to `dist/`              |
| `npm run dev`             | Run in development mode with watch         |
| `npm run start`           | Run compiled server (`node dist/index.js`) |
| `npm run test`            | Run tests                                  |
| `npm run test:coverage`   | Run tests with coverage                    |
| `npm run lint`            | Run ESLint                                 |
| `npm run format`          | Format code with Prettier                  |
| `npm run format:check`    | Check code formatting                      |
| `npm run type-check`      | TypeScript type checking                   |
| `npm run type-check:test` | Type-check tests only                      |
| `npm run duplication`     | Run duplication report (jscpd)             |
| `npm run inspector`       | Run MCP inspector                          |

### Project Structure

```text
src/
|-- index.ts                 # Server entry point (stdio transport)
|-- config.ts                # CLI/env configuration
|-- logger.ts                # stderr logger with level filtering
|-- protocol-version-guard.ts # Reject unsupported MCP protocol versions
|-- tools.ts                 # Tool registration + handlers
|-- schemas.ts               # Zod input/output schemas
|-- types.ts                 # Shared TypeScript types
`-- core/                     # SQLite setup + memory CRUD/search
    |-- db.ts                 # DB init + schema + helpers
    |-- memory-read.ts        # Read + delete + stats
    |-- memory-write.ts       # Create + update + tag handling
    `-- search.ts             # FTS + tag search

tests/
`-- *.test.ts         # Node.js test runner tests
```

## Troubleshooting

- **`node:sqlite` / `DatabaseSync` not found**: Ensure Node.js >= 22.0.0.
- **Search errors about FTS5**: FTS5 must be available; the server creates the
  virtual table automatically, but your SQLite build must include FTS5 support.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
