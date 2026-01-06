# memdb

A SQLite-backed MCP memory server (on-disk by default, in-memory optional).

[![npm version](https://img.shields.io/npm/v/@j0hanz/memdb.svg)](https://www.npmjs.com/package/@j0hanz/memdb)

## One-Click Install

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memdb&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemdb%40latest%22%5D%7D)[![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memdb&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemdb%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=memdb&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovbWVtZGJAbGF0ZXN0Il19)

## Features

| Feature           | Description                                                       |
| :---------------- | :---------------------------------------------------------------- |
| Memory Storage    | Store text memories with tags, importance, and type               |
| Full-Text Search  | FTS5-backed tokenized search with relevance ranking               |
| Graph Connections | Link memories and traverse relationships                          |
| Stats             | Memory, tag, and relationship counts + activity range             |
| Local Privacy     | All data stored locally in SQLite (`.memdb/memory.db` by default) |

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

## Configuration

The server uses a local SQLite database at `<cwd>/.memdb/memory.db` by default.
The path is resolved to an absolute path unless you use `:memory:`.

### Environment Variables

- `MEMDB_PATH`: Override the database path (`:memory:` for in-memory).
- `MEMDB_LOG_LEVEL`: `info`, `warn`, or `error` (default: `info`).
- `MEMDB_SHUTDOWN_TIMEOUT`: Shutdown timeout in ms (1000-60000, default: `5000`).

### CLI Flags

- `--db <path>`: Override the database path.
- `--memory`: Use in-memory database (`:memory:`).
- `--log-level <level>`: `info`, `warn`, or `error`.
- `--shutdown-timeout <ms>`: Shutdown timeout in ms (1000-60000).

Precedence: CLI flags > environment variables > defaults.

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

Example `content[0].text`:

```text
{"ok":true,"result":{...}}
```

## Tools

### `store_memory`

Store a new memory with optional tags and metadata.

| Parameter    | Type     | Required | Default   | Description                                |
| :----------- | :------- | :------- | :-------- | :----------------------------------------- |
| `content`    | string   | Yes      | -         | The content of the memory (1-100000 chars) |
| `tags`       | string[] | No       | -         | Tags (max 100, each 1-50 chars)            |
| `importance` | number   | No       | `0`       | Importance score (0-10)                    |
| `memoryType` | string   | No       | `general` | Type of memory (1-50 chars)                |

**Returns:** `{ id, hash, isNew }`

Notes:

- Content is deduplicated by MD5 hash. Storing the same content again returns the same hash with `isNew: false`.

### `search_memories`

Full-text search with filters.

| Parameter      | Type     | Required | Default | Description                       |
| :------------- | :------- | :------- | :------ | :-------------------------------- |
| `query`        | string   | Yes      | -       | Search query (1-1000 chars)       |
| `limit`        | number   | No       | `10`    | Maximum number of results (1-100) |
| `offset`       | number   | No       | `0`     | Pagination offset (0-1000)        |
| `tags`         | string[] | No       | -       | Filter by tags (max 50)           |
| `minRelevance` | number   | No       | -       | Minimum relevance score (0-1)     |

**Returns:** Array of search results (`Memory` + `relevance`).

### `get_memory`

Retrieve a specific memory by its hash.

| Parameter | Type   | Required | Default | Description         |
| :-------- | :----- | :------- | :------ | :------------------ |
| `hash`    | string | Yes      | -       | MD5 hash (32 chars) |

**Returns:** `Memory`.

### `delete_memory`

Delete a memory by its hash.

| Parameter | Type   | Required | Default | Description         |
| :-------- | :----- | :------- | :------ | :------------------ |
| `hash`    | string | Yes      | -       | MD5 hash (32 chars) |

**Returns:** `{ deleted: true }`.

### `link_memories`

Create a relationship between two memories.

| Parameter      | Type   | Required | Default | Description                          |
| :------------- | :----- | :------- | :------ | :----------------------------------- |
| `fromHash`     | string | Yes      | -       | Hash of the source memory (32 chars) |
| `toHash`       | string | Yes      | -       | Hash of the target memory (32 chars) |
| `relationType` | string | Yes      | -       | Type of relationship (1-50 chars)    |

**Returns:** `{ linked: true }`.

### `get_related`

Get memories related to a given memory.

| Parameter      | Type   | Required | Default    | Description                    |
| :------------- | :----- | :------- | :--------- | :----------------------------- |
| `hash`         | string | Yes      | -          | Hash of the memory (32 chars)  |
| `relationType` | string | No       | -          | Filter by relationship type    |
| `depth`        | number | No       | `1`        | Traversal depth (1-3)          |
| `direction`    | string | No       | `outgoing` | `outgoing`, `incoming`, `both` |

**Returns:** Array of related memories (`Memory` + `relation_type`, `depth`).

### `memory_stats`

Get database statistics and memory type breakdown.

_No parameters required._

**Returns:** `{ memoryCount, relationshipCount, tagCount, memoryTypes, oldestMemory, newestMemory }`.

### `update_memory`

Update memory metadata (content cannot be changed).

| Parameter    | Type     | Required | Default | Description                                 |
| :----------- | :------- | :------- | :------ | :------------------------------------------ |
| `hash`       | string   | Yes      | -       | MD5 hash (32 chars)                         |
| `importance` | number   | No       | -       | New importance score (0-10)                 |
| `memoryType` | string   | No       | -       | New memory type (1-50 chars)                |
| `tags`       | string[] | No       | -       | Replace all tags (max 100, each 1-50 chars) |
| `addTags`    | string[] | No       | -       | Tags to add (max 100, each 1-50 chars)      |
| `removeTags` | string[] | No       | -       | Tags to remove (max 100, each 1-50 chars)   |

**Returns:** `{ updated: true, hash }`.

### Memory Fields

All memory-shaped responses include:

- `id`: integer ID
- `content`: original content string
- `summary`: optional summary (currently unset by tools)
- `importance`: integer 0-10
- `memory_type`: string
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

| Constraint                    | Value         | Description                                               |
| :---------------------------- | :------------ | :-------------------------------------------------------- |
| **Max content length**        | 100,000 chars | Maximum characters in memory content                      |
| **Max query length**          | 1,000 chars   | Maximum characters in search query                        |
| **Max search results**        | 100           | Maximum results returned from `search_memories`           |
| **Default search limit**      | 10            | Default `limit` for `search_memories`                     |
| **Max search offset**         | 1,000         | Maximum `offset` for `search_memories`                    |
| **Max tags per memory**       | 100           | Maximum number of tags when storing a memory              |
| **Max tag length**            | 50 chars      | Maximum characters per tag                                |
| **Max tags in search filter** | 50            | Maximum tags when filtering search results                |
| **Max related memories**      | 1,000         | Maximum results from `get_related` queries                |
| **Max traversal depth**       | 3             | Maximum depth for relationship traversal                  |
| **Importance range**          | 0-10          | Allowed range for `importance`                            |
| **Min relevance range**       | 0-1           | Allowed range for `minRelevance`                          |
| **Hash length**               | 32 chars      | MD5 hash length                                           |
| **Search mode**               | Tokenized OR  | Each term is quoted and OR'ed; FTS5 operators are escaped |

### Notes

- **Content deduplication**: Memories are deduplicated using MD5 hashes.
- **Search errors**: If FTS5 is unavailable, `search_memories` returns an error indicating the index is missing. Invalid query syntax returns an error with details.
- **Tag behavior**: Tags are de-duplicated per memory; exceeding tag limits throws an error.
- **Bidirectional depth**: `get_related` with `direction: "both"` caps traversal depth at 2.
- **Local storage**: All data is stored locally in `.memdb/memory.db` unless `:memory:` is used.

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
|-- index.ts          # Entry point
|-- core/             # Database and memory service
|-- tools/            # Tool implementations
|-- schemas/          # Zod input/output schemas
|-- lib/              # Error helpers
`-- utils/            # Config and logger
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
