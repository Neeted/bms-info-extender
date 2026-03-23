import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const entryPath = path.resolve(repoRoot, "site/dev/score-viewer/lib/preview-runtime-source.js");
const devOutputPath = path.resolve(repoRoot, "site/dev/score-viewer/lib/generated/preview-runtime.generated.js");
const userscriptFragmentPath = path.resolve(repoRoot, "tampermonkey/generated_preview_runtime.generated.js");
const userscriptPath = path.resolve(repoRoot, "tampermonkey/bms_info_extender.user.js");
const userscriptMarkerStart = "  // <generated-preview-runtime:start>";
const userscriptMarkerEnd = "  // <generated-preview-runtime:end>";

const moduleCache = new Map();
const orderedModules = [];

const entryModuleId = await bundleModule(entryPath);
const entryExports = moduleCache.get(entryModuleId).exports;

await fs.mkdir(path.dirname(devOutputPath), { recursive: true });
await fs.writeFile(devOutputPath, buildDevOutput(entryModuleId, orderedModules, entryExports), "utf8");
await fs.writeFile(userscriptFragmentPath, buildUserscriptFragment(entryModuleId, orderedModules), "utf8");
await patchUserscript(userscriptPath, userscriptFragmentPath);

console.log(`Generated ${path.relative(repoRoot, devOutputPath)}`);
console.log(`Generated ${path.relative(repoRoot, userscriptFragmentPath)}`);
console.log(`Patched ${path.relative(repoRoot, userscriptPath)}`);

async function bundleModule(filePath) {
  const normalizedPath = path.normalize(filePath);
  const moduleId = toModuleId(normalizedPath);
  if (moduleCache.has(moduleId)) {
    return moduleId;
  }

  let source = await fs.readFile(normalizedPath, "utf8");
  const importStatements = [...source.matchAll(/^\s*import\s*\{([\s\S]*?)\}\s*from\s*"(.+?)";\s*$/gm)];
  const imports = [];
  for (const statement of importStatements) {
    const importSpecifiers = parseImportSpecifiers(statement[1]);
    const importPath = statement[2];
    if (!importPath.startsWith(".")) {
      throw new Error(`Only local imports are supported: ${importPath} in ${moduleId}`);
    }
    const resolvedPath = path.resolve(path.dirname(normalizedPath), importPath);
    const dependencyId = await bundleModule(resolvedPath);
    imports.push({ dependencyId, specifiers: importSpecifiers });
  }
  source = source.replace(/^\s*import\s*\{[\s\S]*?\}\s*from\s*".+?";\s*$/gm, "");

  const exports = [];
  source = source.replace(/export\s+(async\s+function|function|const|class)\s+([A-Za-z0-9_$]+)/g, (_match, keyword, name) => {
    exports.push(name);
    return `${keyword} ${name}`;
  });

  source = source.replace(/export\s*\{\s*([^}]+)\s*\};?/g, (_match, clause) => {
    for (const specifier of parseImportSpecifiers(clause)) {
      exports.push(specifier.exported);
    }
    return "";
  });

  const moduleRecord = {
    id: moduleId,
    imports,
    exports: [...new Set(exports)],
    body: source.trim(),
  };
  moduleCache.set(moduleId, moduleRecord);
  orderedModules.push(moduleRecord);
  return moduleId;
}

function parseImportSpecifiers(rawClause) {
  return rawClause
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const aliasMatch = part.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      if (aliasMatch) {
        return {
          imported: aliasMatch[1],
          local: aliasMatch[2],
          exported: aliasMatch[2],
        };
      }
      return {
        imported: part,
        local: part,
        exported: part,
      };
    });
}

function buildDevOutput(entryId, modules, exportedNames) {
  return `${buildBundlePreamble(entryId, modules)}
${exportedNames.map((name) => `export const ${name} = __previewRuntimeEntry.${name};`).join("\n")}
`;
}

function buildUserscriptFragment(entryId, modules) {
  return `${userscriptMarkerStart}
  // このブロックは script/build_preview_runtime.mjs により生成されます。手編集しないでください。
${indent(buildBundlePreamble(entryId, modules), 2)}
  const PreviewRuntime = __previewRuntimeEntry;
${userscriptMarkerEnd}
`;
}

function buildBundlePreamble(entryId, modules) {
  const moduleBlocks = modules.map((moduleRecord) => {
    const importLines = moduleRecord.imports
      .map(({ dependencyId, specifiers }) => {
        const bindings = specifiers
          .map(({ imported, local }) => imported === local ? imported : `${imported}: ${local}`)
          .join(", ");
        return `  const { ${bindings} } = __previewRuntimeModules[${JSON.stringify(dependencyId)}];`;
      })
      .join("\n");
    const exportLines = moduleRecord.exports
      .map((name) => `  exports.${name} = ${name};`)
      .join("\n");
    return `(() => {
  const exports = {};
${importLines}
${indent(moduleRecord.body, 2)}
${exportLines}
  __previewRuntimeModules[${JSON.stringify(moduleRecord.id)}] = exports;
})();`;
  }).join("\n\n");

  return `const __previewRuntimeModules = Object.create(null);

${moduleBlocks}

const __previewRuntimeEntry = __previewRuntimeModules[${JSON.stringify(entryId)}];`;
}

async function patchUserscript(mainUserscriptPath, fragmentPath) {
  const [userscriptSource, fragmentSource] = await Promise.all([
    fs.readFile(mainUserscriptPath, "utf8"),
    fs.readFile(fragmentPath, "utf8"),
  ]);

  const startIndex = userscriptSource.indexOf(userscriptMarkerStart);
  const endIndex = userscriptSource.indexOf(userscriptMarkerEnd);
  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
    throw new Error("Generated preview runtime markers were not found in the userscript.");
  }

  const patched = `${userscriptSource.slice(0, startIndex)}${fragmentSource}${userscriptSource.slice(endIndex + userscriptMarkerEnd.length)}`;
  await fs.writeFile(mainUserscriptPath, patched, "utf8");
}

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => line.length > 0 ? `${pad}${line}` : line)
    .join("\n");
}

function toModuleId(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}
