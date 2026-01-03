# AGENTS.md

## Project Overview

- **Name**: `@j0hanz/memdb` — A memory-based MCP server using SQLite in-memory database
- **Purpose**: Provides AI assistants with persistent memory storage, full-text search (FTS5), and graph-based memory relationships
- **Primary Stack**: TypeScript (ES2022), Node.js ≥ 22.0.0, `@modelcontextprotocol/sdk`, Zod
- **Package Type**: ESM (`"type": "module"`)
- **Entry Point**: `dist/index.js` (compiled) / `src/index.ts` (source)

## Repo Map / Structure

```text
src/
├── index.ts          # Server entry point, stdio transport, shutdown handling
├── core/             # Database initialization and memory service logic
│   ├── database.ts   # SQLite setup, FTS5 tables, migrations
│   └── memory-service.ts  # CRUD + search + relationships
├── tools/            # MCP tool implementations (store, search, get, delete, link, stats)
├── schemas/          # Zod input/output schemas for tool validation
│   ├── inputs.ts     # Input schemas with constraints
│   └── outputs.ts    # Output schemas for structured responses
├── lib/              # Utilities
│   ├── errors.ts     # Standardized error responses
│   └── tool_response.ts  # Tool response helpers
├── types/            # TypeScript type definitions
└── utils/            # Config parsing and logger
    ├── config.ts     # CLI flags + env vars parsing
    └── logger.ts     # Logging utility

tests/
└── memory-service.test.ts  # Node.js native test runner tests

dist/                 # Build output (gitignored)
```

## Setup & Environment

### Prerequisites

- Node.js **≥ 22.0.0** (required for `node:sqlite`)

### Install Dependencies

```bash
npm install
```

### Environment Variables

| Variable          | Default            | Description                        |
| ----------------- | ------------------ | ---------------------------------- |
| `MEMDB_PATH`      | `.memdb/memory.db` | Database path (`:memory:` for RAM) |
| `MEMDB_LOG_LEVEL` | `info`             | Log level: `info`, `warn`, `error` |

### CLI Flags (override env vars)

- `--db <path>`: Override database path
- `--memory`: Use in-memory database (`:memory:`)
- `--log-level <level>`: Override log level

**Precedence**: CLI flags > environment variables > defaults

## Development Workflow

| Command             | Description                                |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Run with `tsx watch` (hot reload)          |
| `npm run build`     | Compile TypeScript to `dist/`              |
| `npm run start`     | Run compiled server (`node dist/index.js`) |
| `npm run inspector` | Launch MCP Inspector for debugging         |

### Typical dev flow

```bash
npm install
npm run dev         # Develop with watch mode
npm run lint        # Check linting
npm run type-check  # Check types
npm run test        # Run tests
npm run build       # Compile before commit
```

## Testing

| Command                 | Description             |
| ----------------------- | ----------------------- |
| `npm run test`          | Run all tests           |
| `npm run test:coverage` | Run tests with coverage |

- **Test Runner**: Node.js native test runner (`node --test`)
- **Test Location**: `tests/*.test.ts`
- **Pattern**: `describe`/`it` blocks with `node:assert/strict`
- **Database**: Tests use `:memory:` database via `MEMDB_PATH` env var

## Code Style & Conventions

### Language & Compilation

- **TypeScript**: `ES2022` target, `NodeNext` module resolution
- **Strict Mode**: Enabled with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **ESM Only**: All imports use `.js` extension for compiled output

### Linting & Formatting

| Command                | Description                        |
| ---------------------- | ---------------------------------- |
| `npm run lint`         | Run ESLint                         |
| `npm run format`       | Format with Prettier               |
| `npm run format:check` | Check formatting without writing   |
| `npm run type-check`   | TypeScript type checking (no emit) |

### ESLint Rules (Key)

- `unused-imports/no-unused-imports`: Error
- `@typescript-eslint/consistent-type-imports`: Inline type imports
- `@typescript-eslint/explicit-function-return-type`: Required
- `@typescript-eslint/no-explicit-any`: Error
- `@typescript-eslint/no-floating-promises`: Error
- `@typescript-eslint/only-throw-error`: Error

### Conventions

- Use `type` imports for type-only imports: `import { type Foo } from '...'`
- Explicit return types on all functions
- Prefer `const` over `let`; no `var`
- No floating promises (always `await` or `void`)

## Build / Release

### Build Output

- **Directory**: `dist/`
- **Artifacts**: `.js`, `.d.ts`, `.d.ts.map`, `.js.map`
- **Clean**: `npm run clean` removes `dist/`

### Release Process

1. Code is versioned in `package.json`
2. Create a GitHub Release with tag `vX.Y.Z`
3. CI (`.github/workflows/publish.yml`) triggers on release:
   - Runs lint, type-check, tests, coverage
   - Builds package
   - Publishes to npm with trusted publishing (OIDC)

### Pre-publish Checks

```bash
npm run prepublishOnly  # lint → type-check → build
```

## Security & Safety

- **Local-only storage**: All data in `.memdb/memory.db` (or `:memory:`), no network requests
- **No secrets in code**: Database path and log level are the only config; no API keys
- **Graceful shutdown**: SIGTERM/SIGINT/SIGBREAK handlers close DB and transport
- **Input validation**: Zod schemas validate all tool inputs with strict constraints
- **Content limits**: Max 100,000 chars per memory, max 1,000 char queries

## Pull Request / Commit Guidelines

### Required Checks Before Commit

```bash
npm run lint && npm run type-check && npm run test
```

Or use the combined task:

```bash
npm run lint && npm run type-check
```

### Commit Format

- Use conventional commits when possible (e.g., `feat:`, `fix:`, `docs:`, `chore:`)
- Keep commits atomic and focused

### CI Checks (on release)

- `npm run lint`
- `npm run type-check`
- `npm run test`
- `npm run test:coverage`
- `npm run build`

## Troubleshooting

| Issue                              | Solution                                                |
| ---------------------------------- | ------------------------------------------------------- |
| `Cannot find module 'node:sqlite'` | Upgrade to Node.js ≥ 22.0.0                             |
| Type errors after pulling changes  | Run `npm install` then `npm run type-check`             |
| Tests fail with DB errors          | Ensure `MEMDB_PATH=:memory:` is set for test isolation  |
| ESLint errors on type imports      | Use inline type imports: `import { type X } from '...'` |
| Server won't start                 | Check `MEMDB_PATH` is writable or use `--memory` flag   |

## Agent Operating Rules

1. **Search before edit**: Use `search_memories` before creating duplicates
2. **Read schemas first**: Check `src/schemas/inputs.ts` for validation constraints
3. **Test locally**: Run `npm run dev` and use MCP Inspector for debugging
4. **Respect limits**: See README for content/query/result constraints
5. **Type-safe changes**: Run `npm run type-check` after any TypeScript changes
