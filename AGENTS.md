# AGENTS.md

## Project Overview

- This repository implements an MCP (Model Context Protocol) server named "memdb".
- Tech stack: Node.js (ESM), TypeScript, @modelcontextprotocol/sdk, Zod, SQLite via node:sqlite.
- Primary entrypoint for the MCP server is src/index.ts (stdio transport).

## Repo Map / Structure

- src/: MCP server implementation
  - src/index.ts: CLI entrypoint (stdio MCP server)
  - src/config.ts: CLI/env configuration (DB path, log level, worker toggle)
  - src/tools.ts: MCP tool registration and tool handler wrappers
  - src/schemas.ts: Zod input/output schemas used by tools
  - src/core/: SQLite schema and core operations
  - src/worker/: optional worker-thread DB execution
- tests/: Node.js test runner tests (TypeScript)
- dist/: build output (compiled JS + types)
- scripts/: helper scripts (not required for normal dev)
  - scripts/Quality-Gates.ps1: measure/compare/safe-refactor automation
- metrics/: generated reports (repo-maintenance artifacts)
- .github/workflows/: CI automation

## Setup & Environment

- Required Node.js version (per package.json engines): Node >= 22.0.0
- Install dependencies:
  - npm install
  - CI-style install: npm ci (requires package-lock.json)

Runtime configuration (from README.md and src/config.ts):

- Environment variables:
  - MEMDB_PATH: override database path (use :memory: for in-memory)
  - MEMDB_DB_WORKER: enable worker thread DB operations ("true"/"false" or "1"/"0")
  - MEMDB_LOG_LEVEL: info | warn | error
  - MEMDB_SHUTDOWN_TIMEOUT: integer milliseconds (1000-60000)
- CLI flags:
  - --db PATH
  - --memory
  - --db-worker
  - --log-level LEVEL
  - --shutdown-timeout MS
- Precedence: CLI flags > environment variables > defaults

Default DB location:

- CWD/.memdb/memory.db (created automatically when needed)

## Development Workflow

- Dev/watch mode:
  - npm run dev
  - Runs: tsx watch src/index.ts
- Build:
  - npm run build
  - Produces dist/ and makes dist/index.js executable
- Run built server:
  - npm run start

Useful utilities:

- MCP inspector (for local debugging):
  - npm run inspector

## Testing

- All tests:
  - npm run test
  - Uses Node’s built-in test runner with tsx/esm and tests/\*.test.ts
- Coverage:
  - npm run test:coverage
  - Uses Node experimental test coverage
- Type-check tests only:
  - npm run type-check:test

## Code Style & Conventions

- TypeScript configuration:
  - ESM (module: NodeNext / moduleResolution: NodeNext)
  - Strict mode enabled (see tsconfig.json)
- Lint:
  - npm run lint
  - Flat ESLint config in eslint.config.mjs with type-aware rules for src/\*\*/\*.ts
- Format:
  - npm run format
  - npm run format:check
  - Prettier config in .prettierrc with import sorting via @trivago/prettier-plugin-sort-imports

Repo-local MCP implementation guidance:

- See .github/instructions/typescript-mcp-server.instructions.md for conventions such as:
  - Returning structuredContent plus a JSON string in content for compatibility
  - Avoid writing non-MCP output to stdout for stdio servers (log to stderr)

## Build / Release

- Build output directory: dist/
- Prepublish checks:
  - npm run prepublishOnly
  - Runs: npm run lint && npm run type-check && npm run build
- GitHub release publishing:
  - .github/workflows/publish.yml triggers on GitHub Release “published”
  - Pipeline runs: npm ci, lint, type-check, test, test:coverage, duplication, build, then npm publish

## Security & Safety

- Local data storage:
  - The server stores data in a local SQLite database under CWD/.memdb/ by default.
  - Treat the database as sensitive local data; do not commit it.
- StdIO MCP safety:
  - Avoid writing non-protocol output to stdout. This repo’s logger writes to stderr.
- Input validation:
  - Tool inputs are validated with Zod schemas in src/schemas.ts.

## Pull Request / Commit Guidelines

- Before opening a PR, run the same checks CI expects:
  - npm run lint
  - npm run type-check
  - npm run test
- Optional but useful:
  - npm run test:coverage
  - npm run duplication
  - npm run format:check

If you’re doing larger refactors, scripts/Quality-Gates.ps1 can automate “measure/compare/safe-refactor” flows.

## Troubleshooting

- Error: Cannot find module 'node:sqlite' / DatabaseSync not available
  - Ensure you are on Node >= 22 (matches package.json engines and README prerequisites).
- DB path issues:
  - Use MEMDB_PATH or --db to point to a writable location.
  - Use --memory or MEMDB_PATH=:memory: to run in-memory.
- “Tool failed” responses:
  - Tool handlers wrap errors into { ok: false, error: { code, message } } responses.

## Open Questions / TODO

- CI publish workflow uses node-version: 20 in .github/workflows/publish.yml, but package.json requires Node >= 22.0.0.
- CI publish workflow runs npm run maintainability, but no maintainability script is present in package.json.
- .github/instructions/typescript-mcp-server.instructions.md mentions “repo currently uses Zod v3”, but package.json depends on zod ^4.3.5.
