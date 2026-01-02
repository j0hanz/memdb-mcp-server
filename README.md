# memdb

A Memory MCP Server for AI Assistants using `node:sqlite`.

## Features

- **Zero External DB Dependencies**: Uses `node:sqlite` built into Node.js 22+.
- **Local-First**: All data stored locally in `data/memory.db`.
- **Full-Text Search**: Uses SQLite FTS5 for fast search.
- **Knowledge Graph**: Supports relationships between memories.

## Prerequisites

- Node.js v22.0.0 or higher.

## Installation

1. Clone the repository.
2. Run `npm install`.
3. Build the project: `npm run build`.

## Usage

### Stdio Transport (Default)

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "memdb": {
      "command": "node",
      "args": ["path/to/memdb/dist/index.js"]
    }
  }
}
```

## Tools

- `store_memory`: Store a new memory.
- `search_memories`: Search memories by content or tags.
- `get_memory`: Retrieve a memory by hash.
- `delete_memory`: Delete a memory by hash.
- `link_memories`: Create a relationship between two memories.
- `get_related`: Get related memories.
- `memory_stats`: Get database statistics.

## Development

- `npm run dev`: Watch mode.
- `npm test`: Run tests.
