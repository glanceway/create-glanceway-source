#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import prompts from "prompts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORIES = [
  "Developer",
  "News",
  "Social",
  "Finance",
  "Entertainment",
  "Productivity",
  "Other",
];

// ─── Arg Parsing ───────────────────────────────────────────────────────────

interface CliArgs {
  projectDir?: string;
  name?: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  category?: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const result: CliArgs = {};
  const flags: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      }
    } else if (!result.projectDir) {
      result.projectDir = arg;
    }
  }

  result.name = flags["name"];
  result.description = flags["description"];
  result.author = flags["author"];
  result.authorUrl = flags["author-url"];
  result.category = flags["category"];

  return result;
}

function printHelp() {
  console.log(`
Usage: create-glanceway-source [project-directory] [options]

Options:
  --name          Source display name
  --description   Source description
  --author        Author name
  --author-url    Author URL
  --category      Category (${CATEGORIES.join(", ")})
  -h, --help      Show this help message

Examples:
  npm create glanceway-source my-source
  create-glanceway-source my-source --name "My Source" --author myname
`);
}

// ─── Validation ────────────────────────────────────────────────────────────

function validateAuthor(value: string): string | true {
  if (!value) return "Author is required";
  if (!/^[a-zA-Z0-9-]+$/.test(value)) {
    return "Author can only contain letters, numbers, and hyphens";
  }
  return true;
}

// ─── Template Generators ───────────────────────────────────────────────────

function toDisplayName(dirName: string): string {
  return dirName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function validateProjectDir(value: string): string | true {
  if (!value) return "Project directory is required";
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    return "Must be lowercase, start with a letter, and use only letters, numbers, and hyphens";
  }
  return true;
}

function generateManifest(options: {
  name: string;
  description: string;
  author: string;
  authorUrl?: string;
  category: string;
}): string {
  let manifest = `version: 1.0.0
name: ${options.name}
description: ${options.description}
author: ${options.author}
`;

  if (options.authorUrl) {
    manifest += `author_url: ${options.authorUrl}\n`;
  }

  manifest += `category: ${options.category}
tags: []

# Optional: Add configuration fields
# config:
#   - key: API_TOKEN
#     name: API Token
#     type: secret           # string, number, boolean, secret, select, list, or multiselect
#     required: true
#     description: Your API token
#   - key: SORT
#     name: Sort Order
#     type: select           # use select with options for fixed value sets
#     required: false
#     default: hot
#     options:
#       - hot
#       - new
#       - label: Top (All Time)  # options support label/value format
#         value: top
#   - key: CATEGORIES
#     name: Categories
#     type: multiselect      # like select but allows multiple choices
#     options:
#       - label: Technology
#         value: tech
#       - label: Science
#         value: science
#       - sports
`;

  return manifest;
}

function generatePackageJson(projectDir: string): string {
  return (
    JSON.stringify(
      {
        name: projectDir,
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: {
          build: "npx tsx scripts/build.ts",
          test: "npx tsx scripts/test.ts",
        },
        devDependencies: {
          "@types/archiver": "^7.0.0",
          "@types/node": "^22.0.0",
          archiver: "^7.0.1",
          esbuild: "^0.27.2",
          tsx: "^4.7.0",
          typescript: "^5.3.3",
          yaml: "^2.3.4",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function generateIndexTs(): string {
  return `import type { GlancewayAPI, SourceMethods } from "./types";

export default async (api: GlancewayAPI): Promise<SourceMethods> => {
  async function fetchData() {
    // Example: Fetch data from an API
    const response = await api.fetch("https://api.example.com/items");

    if (response.ok && response.json) {
      const items = (response.json as any[]).map((item: any) => ({
        id: item.id,
        title: item.title,
        url: item.url,
      }));
      api.emit(items);
    }
  }

  // Start phase: initial fetch
  await fetchData();

  return {
    refresh: fetchData,
  };
};
`;
}

function generateClaudeMd(options: {
  projectDir: string;
  name: string;
  author: string;
}): string {
  return `# CLAUDE.md

## Project Overview

Glanceway source: "${options.name}" by ${options.author}. This is a standalone JavaScript source for [Glanceway](https://glanceway.app), a macOS menu bar app that displays information items.

## Commands

\`\`\`bash
npm install          # Install dependencies
npm run build        # Build source into dist/ (compile + package)
npm run test         # Test source (mock API execution + validation)
\`\`\`

Provide config values for testing:
\`\`\`bash
npm run test -- --config API_TOKEN=xxx --config USERNAME=yyy
\`\`\`

There is no test framework. Build the source to verify it compiles. There is no linter or formatter configured.

## Project Structure

- \`src/index.ts\` — Source implementation (main logic)
- \`src/types.ts\` — GlancewayAPI type definitions (do not modify)
- \`manifest.yaml\` — Source metadata and config schema
- \`scripts/build.ts\` — Build script (esbuild compile + package)
- \`scripts/test.ts\` — Test script (mock API + validation)

## Source Development Constraints

**NO external imports.** Sources cannot use \`import\` or \`require\` for external packages. The only allowed import is the type import:

\`\`\`typescript
import type { GlancewayAPI, SourceMethods } from "./types";
\`\`\`

All functionality is provided through the \`api\` parameter. Use \`export default\` for the default export. Use \`GlancewayAPI<Config>\` generic when config fields are defined:

\`\`\`typescript
export default async (api: GlancewayAPI<Config>): Promise<SourceMethods> => {
  async function fetchData() {
    /* fetch, transform, emit */
  }

  // Start phase: initial fetch
  await fetchData();

  return {
    refresh: fetchData,
    stop() {
      /* optional cleanup */
    },
  };
};
\`\`\`

## API Reference

All methods are available on the \`api: GlancewayAPI\` parameter.

### api.emit(items: InfoItem[])

Send items to Glanceway for display.

\`\`\`typescript
interface InfoItem {
  id: string;        // Unique identifier
  title: string;     // Main display text
  subtitle?: string; // Secondary text below title
  url?: string;      // Link opened on click
  timestamp?: Date | string | number; // ISO string, Unix timestamp, or Date
}
\`\`\`

### api.fetch<T>(url: string, options?: FetchOptions): Promise<FetchResponse<T>>

Make HTTP requests. Supports generics for typed JSON responses.

\`\`\`typescript
interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"; // default: GET
  headers?: Record<string, string>;
  body?: string;
  timeout?: number; // milliseconds, default: 30000
}

interface FetchResponse<T> {
  ok: boolean;       // true if status 200-299
  status: number;
  headers: Record<string, string>;
  text: string;      // raw response body
  json?: T;          // parsed JSON (if valid)
}
\`\`\`

Example:

\`\`\`typescript
const response = await api.fetch<{
  items: Array<{ id: string; name: string }>;
}>("https://api.example.com/data", {
  headers: { Authorization: \\\`Bearer \\\${token}\\\` },
});
if (response.ok && response.json) {
  // response.json is typed
}
\`\`\`

### api.config.get(key: string): unknown

Get a user-configured value by key (defined in \`manifest.yaml\` config section). Returns \`string\` for most types, \`string[]\` for \`list\` and \`multiselect\` types.

### api.config.getAll(): Record<string, unknown>

Get all user-configured values as a key-value map.

### api.storage.get(key: string): string | undefined

Get a persisted value. Data survives between refreshes and app restarts.

### api.storage.set(key: string, value: string): void

Store a value persistently.

### api.log(level, message)

Log messages for debugging. Levels: \`"info"\`, \`"error"\`, \`"warn"\`, \`"debug"\`.

### api.appVersion

Current Glanceway app version string (e.g., \`"1.2.0"\`).

### api.websocket.connect(url, callbacks): Promise<WebSocketConnection>

Create a WebSocket connection for real-time data.

\`\`\`typescript
interface WebSocketCallbacks {
  onConnect?: (ws: WebSocketConnection) => void;
  onMessage?: (data: string) => void;
  onError?: (error: string) => void;
  onClose?: (code: number) => void;
}

interface WebSocketConnection {
  send(message: string): Promise<void>;
  close(): void;
}
\`\`\`

## manifest.yaml Full Schema

\`\`\`yaml
version: 1.0.0             # Required: semantic version
name: Display Name          # Required: shown in Glanceway
description: Brief desc     # Required
author: authorname          # Required
author_url: https://...     # Optional
category: Developer         # Required: Developer | News | Social | Finance | Entertainment | Productivity | Other
tags:                       # Optional
  - tag1
min_app_version: 1.2.0     # Optional: minimum Glanceway app version required
config:                     # Optional: user-configurable values
  - key: API_TOKEN
    name: API Token
    type: secret            # string, number, boolean, secret, select, list, or multiselect
    required: true
    description: Description shown to user
  - key: TAGS
    name: Tags
    type: list              # list for string arrays (multiple values)
    required: false
    description: Tags to filter by
  - key: SORT
    name: Sort Order
    type: select            # select requires options list
    required: false
    default: hot
    options:
      - hot
      - new
      - label: Top (All Time)  # options support label/value format
        value: top
  - key: CATEGORIES
    name: Categories
    type: multiselect       # like select but allows multiple choices (value type: string[])
    options:
      - label: Technology
        value: tech
      - label: Science
        value: science
      - sports
\`\`\`

\`select\` and \`multiselect\` options can be plain strings or label/value objects:

\`\`\`yaml
options:
  - plain_value            # value = "plain_value", displayed as "plain_value"
  - label: Display Name    # value = "actual_value", displayed as "Display Name"
    value: actual_value
\`\`\`

### Config Field Types

| Type          | Description                                          | Value type  |
|---------------|------------------------------------------------------|-------------|
| \`string\`      | Free-form text input                                 | \`string\`    |
| \`number\`      | Numeric input                                        | \`number\`    |
| \`boolean\`     | Toggle switch                                        | \`boolean\`   |
| \`secret\`      | Stored in macOS Keychain                             | \`string\`    |
| \`select\`      | Dropdown (requires \`options\` list)                   | \`string\`    |
| \`list\`        | Multiple string values                               | \`string[]\`  |
| \`multiselect\` | Multiple choice from options (like select but multi) | \`string[]\`  |

## Source Lifecycle

JavaScript sources have two distinct phases:

1. **Start phase**: When the source is first loaded, the default export function (outer closure) runs. The app does **NOT** call \`refresh()\` at this point. Sources should perform their initial data fetch here by \`await\`ing their fetch function before returning.
2. **Refresh phase**: On each scheduled refresh interval, the app calls \`refresh()\`. This is the only time \`refresh()\` is invoked.

### Standard Pattern

Extract the fetch logic into a named async function, call it in the outer closure for the start phase, and assign it as the \`refresh\` method:

\`\`\`typescript
export default async (api: GlancewayAPI<Config>): Promise<SourceMethods> => {
  const token = api.config.get("API_TOKEN");

  async function fetchData() {
    const res = await api.fetch<Item[]>(url);
    if (!res.ok || !res.json) {
      throw new Error(\\\`Failed to fetch (HTTP \\\${res.status})\\\`);
    }
    api.emit(toItems(res.json));
  }

  // Start phase: initial fetch
  await fetchData();

  return {
    refresh: fetchData,
  };
};
\`\`\`

## Source Design Guidelines

- Always make full use of the \`subtitle\` field. If the API response contains summary, description, brief, or any descriptive text, map it to \`subtitle\` so users get maximum information at a glance.
- **Maximize items per fetch.** The app does not paginate, so each fetch should retrieve as many items as the API allows without hurting performance. The hard upper limit is **500 items** — never exceed this.

## Source Code Conventions

### File Structure Order

\`\`\`typescript
// 1. Type import (always first)
import type { GlancewayAPI, SourceMethods } from "./types";

// 2. Type definitions (config, response types, data models)
type Config = {
  API_TOKEN: string;
  TAGS: string[];
  SORT: string;           // select → string
  CATEGORIES: string[];   // multiselect → string[]
};

// 3. Helper functions (pure utilities, no api dependency)
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

// 4. Default export (async, with Config generic)
export default async (api: GlancewayAPI<Config>): Promise<SourceMethods> => {
  // 5. Config reading (in outer closure; script reloads on config change)
  const token = api.config.get("API_TOKEN");

  // 6. Fetch function (fetch, transform, emit)
  async function fetchData() {
    // ...
  }

  // 7. Start phase: initial fetch (awaited before returning)
  await fetchData();

  return {
    refresh: fetchData,
  };
};
\`\`\`

### Config Typing

Use \`GlancewayAPI<Config>\` generic to define config field types. This gives \`api.config.get()\` type-safe keys and return values.

### Config Reading

Read config **in the outer closure** (before \`return\`), not inside the fetch function. When config changes, Glanceway reloads the entire script, so the outer closure always has fresh values.

### Response Type Annotations

Use \`api.fetch<T>()\` generics to type responses. For simple/one-off types, inline them at the call site. For complex or reused types, define named types at the top of the file.

### Error Handling

Check \`res.ok && res.json\` before using response data. For the main/only request, throw on failure. For parallel sub-requests, skip failures silently.

### Parallel Requests

Always use \`Promise.allSettled\` (never \`Promise.all\`) for parallel requests. Skip failed results instead of throwing.

### Helper Functions

Define reusable mapping functions (e.g., \`toItems\`) **inside the fetch function** when they use closure variables. Define pure utility functions (e.g., \`stripHtml\`) **at the module top** before the export.

## Importing into Glanceway

After building (\`npm run build\`), import into Glanceway:
1. Open Glanceway
2. Go to Sources
3. Click "Import from file"
4. Select \`dist/latest.gwsrc\`

## Submitting to glanceway-sources

To share your source with the community, [open an issue](https://github.com/glanceway/glanceway-sources/issues) on glanceway-sources with a link to your project repository.
`;
}

// ─── File Operations ───────────────────────────────────────────────────────

function copyTemplateFile(templateName: string, destPath: string) {
  // Templates are relative to the CLI dist directory
  const templateDir = path.join(__dirname, "..", "templates");
  const srcPath = path.join(templateDir, templateName);
  fs.copyFileSync(srcPath, destPath);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  console.log("\nCreate a new Glanceway source\n");

  // 1. Project directory
  let projectDir = args.projectDir;
  if (!projectDir) {
    const response = await prompts({
      type: "text",
      name: "projectDir",
      message: "Project directory:",
      validate: (value) => validateProjectDir(value),
    });
    if (!response.projectDir) {
      console.log("\nCancelled");
      process.exit(1);
    }
    projectDir = response.projectDir;
  } else {
    const validation = validateProjectDir(projectDir);
    if (validation !== true) {
      console.error(`Error: ${validation}`);
      process.exit(1);
    }
  }

  const targetDir = path.resolve(process.cwd(), projectDir!);

  if (fs.existsSync(targetDir)) {
    console.error(`Error: Directory "${projectDir}" already exists.`);
    process.exit(1);
  }

  // 2. Source metadata
  const hasAllFlags =
    args.name && args.description && args.author && args.category;

  let name: string;
  let description: string;
  let author: string;
  let authorUrl: string | undefined;
  let category: string;

  if (hasAllFlags) {
    name = args.name!;
    description = args.description!;
    author = args.author!;
    authorUrl = args.authorUrl;
    category = args.category!;

    const authorCheck = validateAuthor(author);
    if (authorCheck !== true) {
      console.error(`Error: ${authorCheck}`);
      process.exit(1);
    }

    if (!CATEGORIES.includes(category)) {
      console.error(`Error: Category must be one of: ${CATEGORIES.join(", ")}`);
      process.exit(1);
    }
  } else {
    const response = await prompts([
      {
        type: "text",
        name: "name",
        message: "Display name:",
        initial: args.name || toDisplayName(projectDir!),
      },
      {
        type: "text",
        name: "description",
        message: "Description:",
        initial: args.description,
        validate: (value) => (value ? true : "Description is required"),
      },
      {
        type: "text",
        name: "author",
        message: "Author:",
        initial: args.author,
        validate: (value) => validateAuthor(value),
      },
      {
        type: "text",
        name: "authorUrl",
        message: "Author URL (optional):",
        initial: args.authorUrl,
      },
      {
        type: "select",
        name: "category",
        message: "Category:",
        choices: CATEGORIES.map((c) => ({ title: c, value: c })),
        initial: args.category ? CATEGORIES.indexOf(args.category) : 0,
      },
    ]);

    if (!response.name || !response.description || !response.author) {
      console.log("\nCancelled");
      process.exit(1);
    }

    name = response.name;
    description = response.description;
    author = response.author;
    authorUrl = response.authorUrl || undefined;
    category = response.category;
  }

  // 3. Generate project
  console.log(`\nScaffolding project in ${projectDir}/...\n`);

  // Create directories
  fs.mkdirSync(path.join(targetDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(targetDir, "scripts"), { recursive: true });

  // Copy static template files
  copyTemplateFile("src/types.ts", path.join(targetDir, "src", "types.ts"));
  copyTemplateFile(
    "scripts/build.ts",
    path.join(targetDir, "scripts", "build.ts"),
  );
  copyTemplateFile(
    "scripts/test.ts",
    path.join(targetDir, "scripts", "test.ts"),
  );
  copyTemplateFile("tsconfig.json", path.join(targetDir, "tsconfig.json"));
  copyTemplateFile("gitignore", path.join(targetDir, ".gitignore"));

  // Generate dynamic files
  fs.writeFileSync(
    path.join(targetDir, "manifest.yaml"),
    generateManifest({ name, description, author, authorUrl, category }),
  );
  fs.writeFileSync(
    path.join(targetDir, "package.json"),
    generatePackageJson(projectDir!),
  );
  fs.writeFileSync(path.join(targetDir, "src", "index.ts"), generateIndexTs());
  fs.writeFileSync(
    path.join(targetDir, "CLAUDE.md"),
    generateClaudeMd({ projectDir: projectDir!, name, author }),
  );

  // 4. Print next steps
  console.log(`Done! Created ${projectDir}/\n`);
  console.log("Next steps:\n");
  console.log(`  cd ${projectDir}`);
  console.log("  npm install");
  console.log("  # Edit src/index.ts to implement your source");
  console.log("  npm run build");
  console.log("  npm run test");
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
