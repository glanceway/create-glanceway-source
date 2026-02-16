import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import * as esbuild from "esbuild";
import archiver from "archiver";

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, "dist");

async function compileTypeScript(indexPath: string): Promise<string> {
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

  return result.outputFiles[0].text;
}

async function createZip(
  outputPath: string,
  files: { name: string; content: string | Buffer }[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);

    archive.pipe(output);

    for (const file of files) {
      archive.append(file.content, { name: file.name });
    }

    archive.finalize();
  });
}

async function main() {
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

  // Read manifest for version
  const manifestContent = fs.readFileSync(manifestPath, "utf-8");
  const manifest = parseYaml(manifestContent);
  const version = manifest.version || "1.0.0";

  console.log(`Building source v${version}...\n`);

  // Compile TypeScript
  console.log("Compiling TypeScript...");
  const compiledJs = await compileTypeScript(indexPath);

  // Create dist directory
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Write compiled JS
  const jsPath = path.join(DIST_DIR, "index.js");
  fs.writeFileSync(jsPath, compiledJs);
  console.log("  Created dist/index.js");

  // Copy manifest
  const distManifestPath = path.join(DIST_DIR, "manifest.yaml");
  fs.copyFileSync(manifestPath, distManifestPath);
  console.log("  Created dist/manifest.yaml");

  // Create versioned .gwsrc package
  const versionedPath = path.join(DIST_DIR, `${version}.gwsrc`);
  await createZip(versionedPath, [
    { name: "manifest.yaml", content: manifestContent },
    { name: "index.js", content: compiledJs },
  ]);
  console.log(`  Created dist/${version}.gwsrc`);

  // Create latest.gwsrc
  const latestPath = path.join(DIST_DIR, "latest.gwsrc");
  fs.copyFileSync(versionedPath, latestPath);
  console.log("  Created dist/latest.gwsrc");

  console.log("\nBuild complete!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
