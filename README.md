# MemDB MCP Server

<img src="assets/logo.svg" alt="MemDB MCP Server Logo" width="225" />

[![npm version](https://img.shields.io/npm/v/@j0hanz/memdb.svg)](https://www.npmjs.com/package/@j0hanz/memdb) [![License](https://img.shields.io/npm/l/@j0hanz/memdb.svg)](https://github.com/j0hanz/memdb-mcp-server/blob/master/package.json)

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memdb&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemdb%40latest%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memdb&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemdb%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=memdb&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovbWVtZGJAbGF0ZXN0Il19)

A specialized Memory MCP Server that provides a local Knowledge Graph and full-text search capabilities for AI assistants, backed by SQLite.

## Overview

MemDB allows AI assistants to persist long-term memories, facts, and relationships in a local SQLite database. Beyond simple storage, it supports **content-deduplicated versioning**, **tag-based organization**, and **graph relationships** (linking memories together). It includes a powerful `recall` tool that traverses these relationships to retrieve connected context, effectively acting as a graph-augmented RAG system for your workspace.

## Key Features

- **Local Storage**: All data persists in a local SQLite database (`.memdb/memory.db`) within your workspace.
- **Knowledge Graph**: Link memories with typed relationships (e.g., `causes`, `depends_on`, `related_to`).
- **Graph Traversal**: `recall` tool traverses the graph (up to 3 hops) to find connected context.
- **Full-Text Search**: Powered by SQLite FTS5 for fast, relevance-ranked searches.
- **Deduplication**: Content is automatically hashed (SHA-256) to prevent duplicate storage.
- **Categorization**: Rich metadata support including tags, importance levels, and memory types.
- **Batch Operations**: dedicated tools for bulk `store` and `delete` actions.

## Tech Stack

- **Runtime**: Node.js >= 22.0.0 (Required for native `node:sqlite`)
- **Database**: SQLite (using `node:sqlite` sync API)
- **Protocol**: Model Context Protocol (MCP) SDK `v1.26.0+`
- **Validation**: Zod schema validation
- **Architecture**: Layered (Core DB <-> Tools <-> Transport)

## Requirements

- **Node.js**: Version **22.0.0** or higher is **strictly required**. This server uses the native `node:sqlite` module available only in recent Node.js versions.

## Quickstart

Run directly with `npx`:

```bash
npx -y @j0hanz/memdb@latest
```

This will start the server on stdio. The database will be created at `.memdb/memory.db` in the current working directory.

## Installation

### NPX (Recommended)

```bash
npx -y @j0hanz/memdb@latest
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

The server is configured via environment variables.

| Environment Variable    | Description                                                             | Default            |
| :---------------------- | :---------------------------------------------------------------------- | :----------------- |
| `MEMDB_PATH`            | Path to the SQLite database file. Use `:memory:` for ephemeral storage. | `.memdb/memory.db` |
| `MEMDB_LOG_LEVEL`       | Logging level (`info`, `warn`, `error`).                                | `info`             |
| `MEMDB_TOOL_TIMEOUT_MS` | Execution timeout for tools in milliseconds.                            | `15000`            |

**Note**: To keep the database out of version control, add `.memdb/` to your `.gitignore`.

## MCP Surface

### Tools

This server exposes 12 tools for managing memories and relationships.

#### Memory Management

| Tool                  | Description                                              | Key Parameters                                        |
| :-------------------- | :------------------------------------------------------- | :---------------------------------------------------- |
| **`store_memory`**    | Store a single memory. Deduplicates by content hash.     | `content`, `tags`, `importance` (0-10), `memory_type` |
| **`store_memories`**  | Batch store multiple memories. Supports partial success. | `items` (array of objects)                            |
| **`get_memory`**      | Retrieve a memory by its SHA-256 hash.                   | `hash`                                                |
| **`update_memory`**   | Update an existing memory (creates new hash).            | `hash`, `content`, `tags` (optional replace)          |
| **`delete_memory`**   | Delete a single memory by hash.                          | `hash`                                                |
| **`delete_memories`** | Batch delete multiple memories.                          | `hashes` (array)                                      |

#### Search & Retrieval

| Tool                  | Description                                                                               | Key Parameters                    |
| :-------------------- | :---------------------------------------------------------------------------------------- | :-------------------------------- |
| **`search_memories`** | FTS5 full-text search across content and tags.                                            | `query`                           |
| **`recall`**          | **Graph Search**. Finds a memory and traverses relationships to return connected context. | `query`, `depth` (0-3, default 1) |
| **`memory_stats`**    | Get total counts, tag counts, and timeline stats.                                         | _(none)_                          |

#### Relationships (Knowledge Graph)

| Tool                      | Description                                     | Key Parameters                                       |
| :------------------------ | :---------------------------------------------- | :--------------------------------------------------- |
| **`create_relationship`** | Create a directional link between two memories. | `from_hash`, `to_hash`, `relation_type`              |
| **`get_relationships`**   | Get linked memories for a given hash.           | `hash`, `direction` ('outgoing', 'incoming', 'both') |
| **`delete_relationship`** | Remove a specific link between memories.        | `from_hash`, `to_hash`, `relation_type`              |

### Resources

| URI                       | Description                                       | Mime Type       |
| :------------------------ | :------------------------------------------------ | :-------------- |
| `internal://instructions` | Usage instructions and guidelines for the server. | `text/markdown` |

## Client Configuration Examples

<details>
<summary><b>VS Code</b></summary>

Add to `settings.json` or `.vscode/mcp.json`:

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

Add to `claude_desktop_config.json`:

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

1. Open **Cursor Settings** > **Features** > **MCP**.
2. Click **+ Add New MCP Server**.
3. **Name**: `memdb`
4. **Type**: `command`
5. **Command**: `npx -y @j0hanz/memdb@latest`

Or use the **Install in Cursor** button at the top of this README.

</details>

## Repository Structure

```text
c:\memdb
├── src
│   ├── core          # Database logic, schema, and search
│   │   ├── db.ts           # SQLite connection & schema
│   │   ├── memory-read.ts  # Get/Delete/Stats operations
│   │   ├── memory-write.ts # Store/Update operations
│   │   ├── relationships.ts# Graph edge operations
│   │   └── search.ts       # FTS5 & Graph traversal
│   ├── index.ts      # Server entrypoint & transport setup
│   ├── schemas.ts    # Zod schemas for tools
│   ├── tools.ts      # Tool definitions & registration
│   └── types.ts      # TypeScript interfaces
├── scripts           # Build and test automation
├── tests/            # Node.js native tests
└── package.json
```

## Development Workflow

1. **Install**: `npm install`
2. **Dev Mode**: `npm run dev` (watches and recompiles)
3. **Run**: `npm start` (runs `dist/index.js`)
4. **Test**: `npm test` (runs native Node.js test runner)
5. **Lint**: `npm run lint`

## Troubleshooting

- **`node:sqlite` not found**: You are likely running a Node.js version older than 22.0.0. Please upgrade Node.js.
- **Database Locked**: This server uses WAL mode (`PRAGMA journal_mode = WAL`). If you access the `.memdb/memory.db` file with another tool while the server is running, you may encounter locking issues.
- **FTS5 Errors**: The bundled `node:sqlite` usually includes FTS5. If you see FTS errors, ensure your Node.js binary was built with standard SQLite extensions.

## License

This project is licensed under the **MIT** License.
