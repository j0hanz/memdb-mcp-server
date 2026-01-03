# AGENTS.md

## Project Overview

- **Purpose**: Memory MCP Server for AI Assistants using `node:sqlite`
- **Stack**: TypeScript, Node.js 22+, MCP SDK (`@modelcontextprotocol/sdk`), Zod
- **Transport**: Stdio (default)
- **Data storage**: Local SQLite with FTS5 full-text search (`.memdb/memory.db`)

## Repo Map / Structure

- `src/`: Source code (TypeScript)
  - `index.ts`: Server entry point (stdio transport, graceful shutdown)
  - `core/`: Database and memory service (`database.ts`, `memory-service.ts`)
  - `lib/`: Errors and tool response helpers
  - `schemas/`: Zod input/output schemas
  - `tools/`: MCP tool implementations (store, search, get, delete, link, stats)
  - `types/`: Shared TypeScript types
  - `utils/`: Config and logger utilities
- `dist/`: Build output (generated, do not edit)
- `tests/`: Tests using Node.js built-in test runner
- `.memdb/`: Runtime database directory (`memory.db`)

## Setup & Environment

- **Prerequisites**: Node.js >= 22.0.0
- **Install deps**: `npm install`
- **Env config**: None required; database auto-created at `.memdb/memory.db`

## Development Workflow

- **Dev mode (watch)**: `npm run dev` (uses tsx)
- **Build**: `npm run build` (TypeScript → dist/)
- **Start**: `npm start` (runs `dist/index.js`)
- **Clean build**: `npm run clean`
- **Inspect MCP**: `npm run inspector`

## Testing

- **Run all tests**: `npm test`
- **With coverage**: `npm run test:coverage`
- **Test location**: `tests/*.test.ts`
- **Test framework**: Node.js built-in test runner (`node:test`)
- **Test DB**: Uses in-memory SQLite (`:memory:`) to avoid affecting real data

## Code Style & Conventions

### Language & Config

- **TypeScript**: ES2022 target, NodeNext module resolution, strict mode
- **Lint**: `npm run lint` (ESLint 9 flat config)
- **Format**: `npm run format` (Prettier)
- **Check format**: `npm run format:check`
- **Type check**: `npm run type-check`

### Key Rules

- **Imports**: Use type imports (`import type { ... }`)
- **Import order**: Sorted by `@trivago/prettier-plugin-sort-imports`
  1. `node:` built-ins
  2. Core Node.js modules
  3. `@modelcontextprotocol/` packages
  4. External deps (zod, etc.)
  5. Relative imports
- **Return types**: Explicit function return types required
- **No `any`**: `@typescript-eslint/no-explicit-any: error`
- **Promise handling**: No floating or misused promises
- **Unused imports**: Auto-removed via `eslint-plugin-unused-imports`

### File Patterns

- Source files: `src/**/*.ts`
- Tests: `tests/*.test.ts`
- Config files ignored by ESLint: `*.config.mjs`, `*.config.js`

## Build / Release

- **Build output**: `dist/`
- **Prepublish hook**: `npm run lint && npm run type-check && npm run build`
- **Package name**: `@j0hanz/memdb`
- **Binary**: `memdb` (via `dist/index.js`)
- **Published files**: `dist/`, `README.md`

## Security & Safety

- Database stored locally (`.memdb/memory.db`)
- No network requests by default (stdio transport only)
- Graceful shutdown with 5-second timeout
- Uncaught exceptions and unhandled rejections logged and exit with code 1

## Pull Request / Commit Guidelines

- **Required checks before commit**:

  ```bash
  npm run lint && npm run type-check && npm run build && npm test
  ```

- **Commit format**: Conventional commits recommended (not enforced)

## Troubleshooting

### Common Issues

- **"Cannot find module 'node:sqlite'"**: Ensure Node.js >= 22.0.0
- **Build fails**: Run `npm run clean` then `npm run build`
- **Tests fail on FTS5**: FTS5 triggers require matching database schema

### Useful Commands

- Verify lint + types: `npm run lint && npm run type-check`
- Full validation: `npm run format; npm run lint; npm run type-check; npm run build`

## MCP Tools Available

| Tool              | Description                            |
| ----------------- | -------------------------------------- |
| `store_memory`    | Store a new memory                     |
| `search_memories` | Search memories by content or tags     |
| `get_memory`      | Retrieve a memory by hash              |
| `delete_memory`   | Delete a memory by hash                |
| `link_memories`   | Create a relationship between memories |
| `get_related`     | Get related memories                   |
| `memory_stats`    | Get database statistics                |
