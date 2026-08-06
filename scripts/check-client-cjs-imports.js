#!/usr/bin/env node
/**
 * Guards against the exact bug that has shipped twice: a 'use client'
 * component importing a plain CommonJS .js file (module.exports, no ES
 * export syntax) by relative path. Next.js's Fast Refresh loader
 * instruments every module reachable from the client bundle assuming ESM
 * output; a CommonJS .js file breaks it with "Cannot use 'import.meta'
 * outside a module" -- invisible to `npm test` and `next build` alike,
 * only surfacing when a browser actually renders the page (see
 * CONTRIBUTING.md's ConnectionsView.tsx/lib/providers.js and
 * ChatView.tsx/lib/citations.js incidents).
 *
 * A plain CI grep/scan rather than an ESLint rule: this project has no
 * ESLint setup at all (CONTRIBUTING.md: "no new linter, just match what's
 * there"), so a small standalone script matches convention better than
 * introducing a new toolchain for one check.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];
const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function isUseClientFile(content) {
  // The directive must be the first real statement (string literal, before
  // any other code), per React's own rule -- checking just the first
  // handful of non-blank lines mirrors that instead of scanning the whole
  // file for the substring anywhere.
  const firstLines = content.split('\n').slice(0, 5).join('\n');
  return /^\s*['"]use client['"]\s*;?/m.test(firstLines);
}

function findRelativeImports(content) {
  const specifiers = [];
  const importRe = /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
  const requireRe = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let match;
  while ((match = importRe.exec(content))) specifiers.push(match[1]);
  while ((match = requireRe.exec(content))) specifiers.push(match[1]);
  return specifiers;
}

function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...RESOLVABLE_EXTENSIONS.map(ext => base + ext),
    ...RESOLVABLE_EXTENSIONS.map(ext => path.join(base, 'index' + ext)),
  ];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function isCommonJsJs(resolvedFile) {
  if (path.extname(resolvedFile) !== '.js') return false;
  const content = fs.readFileSync(resolvedFile, 'utf8');
  const hasEsExport = /(^|\n)\s*export\s+(default|const|function|class|\{)/.test(content);
  const hasModuleExports = /module\.exports\s*=/.test(content);
  return hasModuleExports && !hasEsExport;
}

function main() {
  const violations = [];
  for (const file of walk(APP_DIR)) {
    const content = fs.readFileSync(file, 'utf8');
    if (!isUseClientFile(content)) continue;

    for (const specifier of findRelativeImports(content)) {
      const resolved = resolveImport(file, specifier);
      if (resolved && isCommonJsJs(resolved)) {
        violations.push({ file: path.relative(ROOT, file), specifier, resolved: path.relative(ROOT, resolved) });
      }
    }
  }

  if (violations.length === 0) {
    console.log('OK: no \'use client\' component imports a CommonJS .js file directly.');
    return;
  }

  console.error(`Found ${violations.length} 'use client' import(s) of a plain CommonJS .js file:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}\n    imports '${v.specifier}' -> ${v.resolved}`);
  }
  console.error(
    '\nThis breaks Next.js Fast Refresh with "Cannot use \'import.meta\' outside a module" ' +
    '(invisible to `npm test` and `next build`, only surfaces in a real browser -- see ' +
    'CONTRIBUTING.md). Convert the imported file to .ts/.tsx with ES `export` syntax instead ' +
    'of `module.exports`.'
  );
  process.exit(1);
}

main();
