# CLAUDE.md

## Project Overview

CLI tool (`create-glanceway-source`) that scaffolds standalone Glanceway source projects. Run via `npm create glanceway-source`.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Build the CLI (TypeScript → dist/)
```

## Project Structure

- `src/index.ts` — CLI entry point (prompts, file generation)
- `templates/` — Static files copied into scaffolded projects
  - `src/types.ts` — GlancewayAPI type definitions
  - `scripts/build.ts` — esbuild compile + gwsrc
  - `scripts/test.ts` — Mock API execution + validation
  - `tsconfig.json`, `gitignore` — Project config files

## Testing

No test framework. Build the CLI and scaffold a test project to verify:

```bash
npm run build
node dist/index.js test-source
cd test-source && npm install && npm run build && npm run test
```

## Architecture

The CLI:

1. Parses CLI args (project name as positional arg)
2. Runs interactive prompts (source name, description, author, category)
3. Generates dynamic files (manifest.yaml, package.json, src/index.ts, CLAUDE.md) with user input interpolated
4. Copies static template files (types.ts, build.ts, test.ts, tsconfig.json, .gitignore)
