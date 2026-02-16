import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import * as esbuild from "esbuild";

// ─── ANSI Colors ───────────────────────────────────────────────────────────

const color = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// ─── Types ─────────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();

interface ManifestConfig {
  key: string;
  name: string;
  type: string;
  required?: boolean;
  default?: unknown;
  description?: string;
}

interface EmittedItem {
  id?: unknown;
  title?: unknown;
  subtitle?: unknown;
  url?: unknown;
  timestamp?: unknown;
  [key: string]: unknown;
}

// ─── Arg Parsing ───────────────────────────────────────────────────────────

function parseArgs(): { config: Record<string, string> } {
  const args = process.argv.slice(2);
  const config: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      const val = args[++i];
      const eqIdx = val.indexOf("=");
      if (eqIdx > 0) {
        config[val.slice(0, eqIdx)] = val.slice(eqIdx + 1);
      }
    }
  }

  return { config };
}

// ─── Config Resolution ─────────────────────────────────────────────────────

function resolveConfig(
  configEntries: ManifestConfig[] | undefined,
  overrides: Record<string, string>,
): { resolved: Record<string, unknown>; warnings: string[] } | null {
  const resolved: Record<string, unknown> = {};
  const warnings: string[] = [];

  if (!configEntries || configEntries.length === 0) {
    return { resolved, warnings };
  }

  for (const entry of configEntries) {
    const override = overrides[entry.key];

    if (override !== undefined) {
      if (entry.type === "list") {
        resolved[entry.key] = override.split(",").map((s) => s.trim());
      } else if (entry.type === "boolean") {
        resolved[entry.key] = override === "true" || override === "1";
      } else if (entry.type === "number") {
        resolved[entry.key] = Number(override);
      } else {
        resolved[entry.key] = override;
      }
    } else if (entry.default !== undefined) {
      resolved[entry.key] = entry.default;
    } else if (entry.required) {
      warnings.push(
        `Required config "${entry.key}" has no default. Use --config ${entry.key}=VALUE to provide a value.`,
      );
      return null;
    }
  }

  return { resolved, warnings };
}

// ─── Item Validation ───────────────────────────────────────────────────────

const MAX_MESSAGES = 5;

function validateItems(
  items: EmittedItem[],
  phase: string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (items.length > 500) {
    errors.push(`${phase}: emitted ${items.length} items (max 500)`);
  }

  if (items.length === 0) {
    warnings.push(`${phase}: zero items emitted`);
    return { errors, warnings };
  }

  const seenIds = new Set<string>();
  let errorCount = 0;
  let warningCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = `${phase} item[${i}]`;

    if (!item.id || typeof item.id !== "string" || item.id.trim() === "") {
      if (errorCount < MAX_MESSAGES) {
        errors.push(`${prefix}: "id" is missing or empty`);
      }
      errorCount++;
      continue;
    }

    const hasTitle =
      item.title && typeof item.title === "string" && item.title.trim() !== "";
    const hasSubtitle =
      item.subtitle &&
      typeof item.subtitle === "string" &&
      item.subtitle.trim() !== "";
    if (!hasTitle && !hasSubtitle) {
      if (errorCount < MAX_MESSAGES) {
        errors.push(
          `${prefix}: must have at least one of "title" or "subtitle"`,
        );
      }
      errorCount++;
      continue;
    }

    if (seenIds.has(item.id)) {
      if (warningCount < MAX_MESSAGES) {
        warnings.push(`${prefix}: duplicate id "${item.id}"`);
      }
      warningCount++;
    }
    seenIds.add(item.id);

    if (item.subtitle !== undefined && typeof item.subtitle !== "string") {
      if (warningCount < MAX_MESSAGES) {
        warnings.push(`${prefix}: "subtitle" should be a string`);
      }
      warningCount++;
    }

    if (item.url !== undefined) {
      if (typeof item.url !== "string") {
        if (warningCount < MAX_MESSAGES) {
          warnings.push(`${prefix}: "url" should be a string`);
        }
        warningCount++;
      } else if (
        !item.url.startsWith("http://") &&
        !item.url.startsWith("https://")
      ) {
        if (warningCount < MAX_MESSAGES) {
          warnings.push(
            `${prefix}: "url" does not start with http(s)://`,
          );
        }
        warningCount++;
      }
    }
  }

  if (errorCount > MAX_MESSAGES) {
    errors.push(`... and ${errorCount - MAX_MESSAGES} more errors`);
  }
  if (warningCount > MAX_MESSAGES) {
    warnings.push(`... and ${warningCount - MAX_MESSAGES} more warnings`);
  }

  return { errors, warnings };
}

// ─── Mock API ──────────────────────────────────────────────────────────────

function createMockApi(
  config: Record<string, unknown>,
): {
  api: any;
  getEmitted: () => EmittedItem[][];
} {
  const emitted: EmittedItem[][] = [];
  const storage = new Map<string, string>();

  const api = {
    emit(items: EmittedItem[]) {
      emitted.push(items);
    },

    async fetch(url: string, options?: any) {
      const timeout = options?.timeout ?? 30000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const resp = await globalThis.fetch(url, {
          method: options?.method ?? "GET",
          headers: options?.headers,
          body: options?.body,
          signal: controller.signal,
        });
        clearTimeout(timer);

        const text = await resp.text();
        const headers: Record<string, string> = {};
        resp.headers.forEach((v, k) => {
          headers[k] = v;
        });

        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          // not JSON
        }

        return {
          ok: resp.ok,
          status: resp.status,
          headers,
          text,
          json,
        };
      } catch (err: any) {
        clearTimeout(timer);
        return {
          ok: false,
          status: 0,
          headers: {},
          text: "",
          error: err?.message ?? String(err),
        };
      }
    },

    log(level: string, message: string) {
      console.log(color.dim(`  [source] ${level}: ${message}`));
    },

    storage: {
      get(key: string) {
        return storage.get(key);
      },
      set(key: string, value: string) {
        storage.set(key, value);
      },
    },

    config: {
      get(key: string) {
        return config[key];
      },
      getAll() {
        return { ...config };
      },
    },

    websocket: {
      connect() {
        throw new Error("WebSocket is not supported in test mode");
      },
    },

    appVersion: "99.0.0",
  };

  return { api, getEmitted: () => emitted };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  const manifestPath = path.join(ROOT_DIR, "manifest.yaml");
  const indexPath = path.join(ROOT_DIR, "src", "index.ts");

  if (!fs.existsSync(manifestPath)) {
    console.error("Error: manifest.yaml not found");
    process.exit(1);
  }

  if (!fs.existsSync(indexPath)) {
    console.error("Error: src/index.ts not found");
    process.exit(1);
  }

  // Read manifest and resolve config
  const manifestContent = fs.readFileSync(manifestPath, "utf-8");
  const manifest = parseYaml(manifestContent);
  const configResult = resolveConfig(manifest.config, args.config);

  if (!configResult) {
    const warningMessages: string[] = [];
    if (manifest.config) {
      for (const entry of manifest.config as ManifestConfig[]) {
        if (
          args.config[entry.key] === undefined &&
          entry.default === undefined &&
          entry.required
        ) {
          warningMessages.push(
            `Required config "${entry.key}" has no default. Use --config ${entry.key}=VALUE to provide a value.`,
          );
        }
      }
    }
    console.log(color.yellow("SKIP") + " Missing required config:");
    for (const w of warningMessages) {
      console.log(`  ${color.yellow("warning")}: ${w}`);
    }
    process.exit(0);
  }

  const { resolved: config, warnings } = configResult;

  console.log(`Testing source...\n`);

  // Compile TypeScript
  let compiledJs: string;
  try {
    const result = await esbuild.build({
      entryPoints: [indexPath],
      bundle: true,
      platform: "neutral",
      format: "iife",
      globalName: "_source",
      write: false,
      external: ["node:*"],
      footer: { js: "module.exports = _source.default;" },
    });
    compiledJs = result.outputFiles[0].text;
    console.log("  Compiled TypeScript successfully");
  } catch (err: any) {
    console.log(`  ${color.red("FAIL")} Compilation failed: ${err.message ?? err}`);
    process.exit(1);
  }

  // Execute compiled code
  const { api, getEmitted } = createMockApi(config);
  const start = Date.now();

  let sourceMethods: any;
  try {
    const moduleObj = { exports: {} as any };
    const fn = new Function("module", "exports", compiledJs);
    fn(moduleObj, moduleObj.exports);

    const factory = moduleObj.exports;
    if (typeof factory !== "function") {
      console.log(`  ${color.red("FAIL")} Default export is not a function`);
      process.exit(1);
    }

    sourceMethods = await Promise.race([
      factory(api),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Start phase timed out (30s)")), 30000),
      ),
    ]);
  } catch (err: any) {
    console.log(`  ${color.red("FAIL")} Start phase error: ${err.message ?? err}`);
    process.exit(1);
  }

  // Validate start phase items
  const startEmitted = getEmitted();
  const startItems =
    startEmitted.length > 0 ? startEmitted[startEmitted.length - 1] : [];
  const startValidation = validateItems(startItems, "start phase");
  const errors = [...startValidation.errors];
  warnings.push(...startValidation.warnings);

  // Refresh phase
  let refreshItemCount: number | undefined;
  if (sourceMethods?.refresh) {
    try {
      const emittedBefore = getEmitted().length;

      await Promise.race([
        sourceMethods.refresh(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Refresh phase timed out (30s)")),
            30000,
          ),
        ),
      ]);

      const allEmitted = getEmitted();
      const refreshEmissions = allEmitted.slice(emittedBefore);
      const refreshItems =
        refreshEmissions.length > 0
          ? refreshEmissions[refreshEmissions.length - 1]
          : [];
      refreshItemCount = refreshItems.length;

      const refreshValidation = validateItems(refreshItems, "refresh phase");
      errors.push(...refreshValidation.errors);
      warnings.push(...refreshValidation.warnings);
    } catch (err: any) {
      errors.push(`Refresh phase error: ${err.message ?? err}`);
    }
  }

  // Stop phase
  if (sourceMethods?.stop) {
    try {
      await sourceMethods.stop();
    } catch {
      // ignore stop errors
    }
  }

  const durationMs = Date.now() - start;

  // ─── Output Results ──────────────────────────────────────────────────

  const line = "\u2500".repeat(60);
  const status = errors.length > 0 ? "fail" : "pass";

  console.log(`\n${color.bold("Test Results")}`);
  console.log(line);

  const duration = color.dim(`(${durationMs}ms)`);

  if (status === "pass") {
    const counts =
      refreshItemCount !== undefined
        ? `${startItems.length} items, refresh: ${refreshItemCount}`
        : `${startItems.length} items`;
    console.log(`  ${color.green("PASS")} ${counts} ${duration}`);
    for (const w of warnings) {
      console.log(`    ${color.yellow("warning")}: ${w}`);
    }
  } else {
    console.log(`  ${color.red("FAIL")} ${duration}`);
    for (const e of errors) {
      console.log(`    ${color.red("error")}: ${e}`);
    }
    for (const w of warnings) {
      console.log(`    ${color.yellow("warning")}: ${w}`);
    }
  }

  console.log(line);

  esbuild.stop();
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
