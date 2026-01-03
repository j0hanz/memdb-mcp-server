# memdb

A memory-based MCP server using SQLite in-memory database.

[![npm version](https://img.shields.io/npm/v/@j0hanz/memdb.svg)](https://www.npmjs.com/package/@j0hanz/memdb)

## One-Click Install

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memdb&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemdb%40latest%22%5D%7D)[![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=memdb&inputs=%5B%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40j0hanz%2Fmemdb%40latest%22%5D%7D&quality=insiders)

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=memdb&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqMGhhbnovbWVtZGJAbGF0ZXN0Il19)

## ✨ Features

| Feature                  | Description                                               |
| :----------------------- | :-------------------------------------------------------- |
| 🧠 **Memory Storage**    | Store text-based memories with tags and importance scores |
| 🔍 **Full-Text Search**  | Search memories using FTS5 with relevance ranking         |
| 🕸️ **Graph Connections** | Link memories together to create knowledge graphs         |
| 📊 **Analytics**         | Track memory statistics and database health               |
| 🔒 **Local Privacy**     | All data stored locally in SQLite (`data/memory.db`)      |

## 🚀 Quick Start

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

## 📦 Installation

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

## ⚙️ Configuration

The server uses a local SQLite database located at `data/memory.db` relative to the working directory.

### Environment Variables

- `MEMDB_PATH`: Override the database path (`:memory:` for in-memory).
- `MEMDB_LOG_LEVEL`: `info`, `warn`, or `error` (default: `info`).

### CLI Flags

- `--db <path>`: Override the database path.
- `--memory`: Use in-memory database (`:memory:`).
- `--log-level <level>`: `info`, `warn`, or `error`.

Precedence: CLI flags > environment variables > defaults.

## 🔧 Tools

### `store_memory`

Store a new memory with optional tags and metadata.

| Parameter    | Type     | Required | Default | Description                                     |
| :----------- | :------- | :------- | :------ | :---------------------------------------------- |
| `content`    | string   | ✅       | -       | The content of the memory                       |
| `tags`       | string[] | ❌       | -       | Tags to categorize the memory                   |
| `importance` | number   | ❌       | -       | Importance score (0-10)                         |
| `memoryType` | string   | ❌       | -       | Type of memory (e.g., conversation, fact, rule) |

**Returns:** The created memory object with its hash.

### `search_memories`

Full-text search with filters.

| Parameter      | Type     | Required | Default | Description               |
| :------------- | :------- | :------- | :------ | :------------------------ |
| `query`        | string   | ✅       | -       | Search query              |
| `limit`        | number   | ❌       | -       | Maximum number of results |
| `tags`         | string[] | ❌       | -       | Filter by tags            |
| `minRelevance` | number   | ❌       | -       | Minimum relevance score   |

**Returns:** Array of matching memories.

### `get_memory`

Retrieve a specific memory by its hash.

| Parameter | Type   | Required | Default | Description            |
| :-------- | :----- | :------- | :------ | :--------------------- |
| `hash`    | string | ✅       | -       | MD5 hash of the memory |

**Returns:** The memory object.

### `delete_memory`

Delete a memory by its hash.

| Parameter | Type   | Required | Default | Description            |
| :-------- | :----- | :------- | :------ | :--------------------- |
| `hash`    | string | ✅       | -       | MD5 hash of the memory |

**Returns:** Confirmation of deletion.

### `link_memories`

Create a relationship between two memories.

| Parameter      | Type   | Required | Default | Description               |
| :------------- | :----- | :------- | :------ | :------------------------ |
| `fromHash`     | string | ✅       | -       | Hash of the source memory |
| `toHash`       | string | ✅       | -       | Hash of the target memory |
| `relationType` | string | ✅       | -       | Type of relationship      |

**Returns:** Confirmation of link creation.

### `get_related`

Get memories related to a given memory.

| Parameter      | Type   | Required | Default | Description                 |
| :------------- | :----- | :------- | :------ | :-------------------------- |
| `hash`         | string | ✅       | -       | Hash of the memory          |
| `relationType` | string | ❌       | -       | Filter by relationship type |
| `depth`        | number | ❌       | -       | Traversal depth (1-3)       |

**Returns:** Array of related memories.

### `memory_stats`

Get database statistics and health information.

_No parameters required._

**Returns:** Database statistics (count, size, etc.).

## 🔌 Client Configuration

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

## 📋 Limits & Constraints

| Constraint                    | Value         | Description                                              |
| :---------------------------- | :------------ | :------------------------------------------------------- |
| **Max content length**        | 100,000 chars | Maximum characters in memory content                     |
| **Max query length**          | 1,000 chars   | Maximum characters in search query                       |
| **Max search results**        | 100           | Maximum results returned from `search_memories`          |
| **Max tags per memory**       | 100           | Maximum number of tags when storing a memory             |
| **Max tag length**            | 50 chars      | Maximum characters per tag                               |
| **Max tags in search filter** | 50            | Maximum tags when filtering search results               |
| **Max related memories**      | 1,000         | Maximum results from `get_related` queries               |
| **Max traversal depth**       | 3             | Maximum depth for relationship traversal                 |
| **Search mode**               | Phrase        | Search uses phrase matching (FTS5 operators are escaped) |

### Notes

- **Content deduplication**: Memories are deduplicated using MD5 hashes. Storing the same content twice returns the existing memory.
- **Query timeouts**: The server uses SQLite's synchronous API with a 5-second busy timeout. Individual queries are bounded by result limits rather than execution time.
- **Local storage**: All data is stored locally in `data/memory.db`. No network requests are made.

## 🛠️ Development

### Prerequisites

- Node.js >= 22.0.0

### Scripts

| Command                  | Description                        |
| :----------------------- | :--------------------------------- |
| `npm run build`          | Compile TypeScript to `dist/`      |
| `npm run dev`            | Run in development mode with watch |
| `npm run test`           | Run tests                          |
| `npm run test:coverage`  | Run tests with coverage            |
| `npm run lint`           | Run ESLint                         |
| `npm run format`         | Format code with Prettier          |
| `npm run format:check`   | Check code formatting              |
| `npm run type-check`     | TypeScript type checking           |
| `npm run inspector`      | Run MCP inspector                  |

### Project Structure

```text
src/
├── index.ts          # Entry point
├── core/             # Database and memory service
├── tools/            # Tool implementations
├── schemas/          # Zod input/output schemas
├── lib/              # Utility functions
└── utils/            # Config and logger
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
