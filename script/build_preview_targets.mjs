import esbuild from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const userscriptHeaderPath = path.resolve(repoRoot, "tampermonkey/src/userscript-header.txt");

const requestedArgs = process.argv.slice(2);
const checkMode = requestedArgs.includes("--check");
const requestedTargets = requestedArgs.filter((arg) => arg !== "--check");

const buildTargets = {
  dev: {
    name: "dev score viewer",
    entryPoint: path.resolve(repoRoot, "site/dev/score-viewer/src/app.js"),
    outputPath: path.resolve(repoRoot, "site/dev/score-viewer/app.js"),
    format: "esm",
    banner: "// このファイルは script/build_preview_targets.mjs により生成されます。手編集しないでください。",
  },
  userscript: {
    name: "userscript",
    entryPoint: path.resolve(repoRoot, "tampermonkey/src/main.js"),
    outputPath: path.resolve(repoRoot, "tampermonkey/bms_info_extender.user.js"),
    format: "iife",
    banner: `${(await fs.readFile(userscriptHeaderPath, "utf8")).trimEnd()}\n// このファイルは script/build_preview_targets.mjs により生成されます。手編集しないでください。`,
  },
};

const targetsToBuild = requestedTargets.length > 0 ? requestedTargets : Object.keys(buildTargets);
for (const targetName of targetsToBuild) {
  if (!Object.hasOwn(buildTargets, targetName)) {
    throw new Error(`Unknown build target: ${targetName}`);
  }
}

let hasOutdatedOutput = false;
for (const targetName of targetsToBuild) {
  const target = buildTargets[targetName];
  const generatedText = await buildTarget(target);
  if (checkMode) {
    const isCurrent = await checkGeneratedOutput(target.outputPath, generatedText);
    console.log(`${isCurrent ? "OK" : "NG"} ${path.relative(repoRoot, target.outputPath)}`);
    hasOutdatedOutput ||= !isCurrent;
    continue;
  }

  await fs.mkdir(path.dirname(target.outputPath), { recursive: true });
  await fs.writeFile(target.outputPath, generatedText, "utf8");
  console.log(`Built ${path.relative(repoRoot, target.outputPath)}`);
}

if (checkMode && hasOutdatedOutput) {
  process.exitCode = 1;
}

async function buildTarget(target) {
  const result = await esbuild.build({
    entryPoints: [target.entryPoint],
    bundle: true,
    charset: "utf8",
    format: target.format,
    legalComments: "none",
    minify: false,
    platform: "browser",
    sourcemap: false,
    target: "es2020",
    treeShaking: true,
    write: false,
  });

  const bundledText = getSingleOutputText(result).trimEnd();
  const banner = target.banner ? `${target.banner}\n\n` : "";
  return `${banner}${bundledText}\n`;
}

function getSingleOutputText(result) {
  if (!Array.isArray(result.outputFiles) || result.outputFiles.length !== 1) {
    throw new Error("Expected exactly one output file from esbuild.");
  }
  return result.outputFiles[0].text;
}

async function checkGeneratedOutput(outputPath, expectedText) {
  try {
    const actualText = await fs.readFile(outputPath, "utf8");
    return actualText === expectedText;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
