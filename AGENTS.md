# AGENTS.md

## Project Overview

**memdb** is a SQLite-backed MCP (Model Context Protocol) memory server that provides persistent memory storage for AI agents and applications. It supports full-text search, graph-based memory relationships, and local-first data storage.

- **Primary stack**: TypeScript, Node.js (≥22.0.0), MCP SDK, Zod, SQLite (node:sqlite)
- **Package**: `@j0hanz/memdb` on npm
- **Repository**: [github.com/j0hanz/memdb-mcp-server](https://github.com/j0hanz/memdb-mcp-server)

## Repo Map / Structure

```text
src/
├── index.ts              # Server entry point (stdio transport)
├── core/                 # SQLite setup + memory CRUD/search/relations
│   ├── database.ts       # DB init + schema sync
│   ├── database-schema.ts
│   ├── memory-create.ts
│   ├── memory-read.ts
│   ├── memory-search.ts
│   ├── memory-relations.ts
│   ├── memory-updates.ts
│   ├── memory-stats.ts
│   ├── search.ts
│   └── tags.ts
├── tools/                # MCP tool registration + handlers
│   ├── index.ts
│   ├── tool-handlers.ts
│   ├── tool-types.ts
│   └── definitions/      # Tool metadata + handlers
├── schemas/              # Zod input/output schemas
│   ├── inputs.ts
│   └── outputs.ts
├── lib/                  # Error/response helpers
│   └── errors.ts
├── types/                # TypeScript types
│   └── index.ts
└── utils/                # Config + logger
    ├── config.ts
    └── logger.ts

tests/                    # Node.js test runner tests (*.test.ts)
dist/                     # Build output (generated, gitignored)
```

## Setup & Environment

### Prerequisites

- **Node.js ≥22.0.0** (required for `node:sqlite` built-in module)

### Install Dependencies

```bash
npm install
```

### Environment Variables

| Variable                 | Default                  | Description                              |
| ------------------------ | ------------------------ | ---------------------------------------- |
| `MEMDB_PATH`             | `<cwd>/.memdb/memory.db` | Database path (`:memory:` for in-memory) |
| `MEMDB_DB_WORKER`        | `false`                  | Run DB operations in a worker thread     |
| `MEMDB_LOG_LEVEL`        | `info`                   | `info`, `warn`, or `error`               |
| `MEMDB_SHUTDOWN_TIMEOUT` | `5000`                   | Shutdown timeout in ms (1000-60000)      |

### CLI Flags

- `--db <path>`: Override database path
- `--memory`: Use in-memory database (`:memory:`)
- `--db-worker`: Run DB operations in a worker thread
- `--log-level <level>`: Log level
- `--shutdown-timeout <ms>`: Shutdown timeout

**Precedence**: CLI flags > environment variables > defaults

## Development Workflow

| Command         | Description                                |
| --------------- | ------------------------------------------ |
| `npm run dev`   | Run in development mode with watch (tsx)   |
| `npm run build` | Compile TypeScript to `dist/`              |
| `npm run start` | Run compiled server (`node dist/index.js`) |
| `npm run clean` | Remove `dist/` directory                   |

## Testing

| Command                 | Description             |
| ----------------------- | ----------------------- |
| `npm run test`          | Run all tests           |
| `npm run test:coverage` | Run tests with coverage |

- **Test location**: `tests/*.test.ts`
- **Test runner**: Node.js built-in test runner with tsx
- **Pattern**: Files must end with `.test.ts`

## Code Style & Conventions

### Language & Type Safety

- **TypeScript** with strict mode enabled
- Target: ES2022, Module: NodeNext
- Explicit return types required on functions

### Linting & Formatting

| Command                   | Description               |
| ------------------------- | ------------------------- |
| `npm run lint`            | Run ESLint                |
| `npm run format`          | Format code with Prettier |
| `npm run format:check`    | Check code formatting     |
| `npm run type-check`      | TypeScript type checking  |
| `npm run type-check:test` | Type-check tests only     |

### ESLint Rules (Strict)

- `complexity: max 5`
- `max-depth: 2`
- `max-lines: 300` (skip blanks/comments)
- `max-lines-per-function: 40`
- `max-params: 3`
- `sonarjs/cognitive-complexity: 10`
- No unused imports, no explicit `any`
- Consistent type imports/exports (inline)

### Prettier Config

- Single quotes, trailing commas (es5)
- 2-space indent, 80 char width
- Sorted imports via `@trivago/prettier-plugin-sort-imports`

### Import Order

1. `node:*` built-ins
2. Node.js core modules
3. `@modelcontextprotocol/*`
4. External packages (`zod`, etc.)
5. Relative imports (`./`, `../`)

### Naming Conventions

- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

## Build / Release

### Build Output

- Output directory: `dist/`
- Generates `.js`, `.d.ts`, `.js.map`, `.d.ts.map`
- Entry point: `dist/index.js`

### Release Process

1. Create a GitHub release with tag `v<version>` (e.g., `v1.0.7`)
2. CI workflow runs: lint → type-check → test → coverage → build → publish
3. Package published to npm with provenance

### Pre-publish Checks

The `prepublishOnly` script runs automatically:

```bash
npm run lint && npm run type-check && npm run build
```

## Security & Safety

- **Local-first**: All data stored locally in SQLite (`.memdb/memory.db`)
- **No network calls**: Server operates via stdio transport only
- **Content deduplication**: Memories are deduplicated by MD5 hash
- **No secrets in code**: Use environment variables for configuration

## Pull Request / Commit Guidelines

### Required Checks Before Commit

```bash
npm run lint && npm run type-check
```

### CI Pipeline (on release)

1. `npm run lint`
2. `npm run type-check`
3. `npm run test`
4. `npm run test:coverage`
5. `npm run build`

### Commit Best Practices

- Run lint + type-check before committing
- Ensure tests pass locally
- Keep functions small (<40 lines)
- Maintain complexity limits

## Troubleshooting

### Common Issues

| Issue                          | Cause                     | Fix                                                 |
| ------------------------------ | ------------------------- | --------------------------------------------------- |
| `node:sqlite` not found        | Node.js version < 22      | Upgrade to Node.js ≥22.0.0                          |
| ESLint complexity error        | Function too complex (>5) | Refactor into smaller functions                     |
| `max-lines-per-function` error | Function >40 lines        | Extract helper functions                            |
| FTS5 search errors             | Invalid query syntax      | Queries are tokenized; FTS5 operators not supported |
| Import order lint error        | Wrong import grouping     | Run `npm run format` to auto-fix                    |

### Debugging

- Use `MEMDB_LOG_LEVEL=info` for verbose logging
- Run MCP inspector: `npm run inspector`
- Check duplication: `npm run duplication`

## Agent Operating Rules

1. **Search before edit**: Use file search to understand existing patterns before making changes
2. **Run checks**: Always run `npm run lint && npm run type-check` before committing
3. **Respect complexity limits**: Keep functions under 40 lines, complexity under 5
4. **Use existing patterns**: Follow import order, naming conventions, and file structure
5. **Test changes**: Run `npm run test` to verify functionality
6. **No destructive commands**: Avoid running commands that delete data without confirmation
