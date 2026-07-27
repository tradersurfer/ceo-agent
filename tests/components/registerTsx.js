/**
 * Minimal require() hook so `node --test` can load .tsx/.jsx component
 * files directly, with no build step. This repo ships no React component
 * test infra today (no jest, no babel, no ts-node) despite .tsx components
 * existing — see the PR description for why this was added and how it's
 * wired into `npm test`.
 *
 * Deliberately NOT esbuild-register's default tsconfig-driven config:
 * tsconfig.json sets `"jsx": "preserve"` (Next.js does its own SWC-based
 * JSX transform at build time), which would leave JSX untransformed here.
 * This hook forces `jsx: 'automatic'` (the React 17+ runtime, what React
 * 18 uses) regardless of tsconfig, transforming only for the test process.
 */

const fs = require('fs');
const Module = require('module');
const esbuild = require('esbuild');

const LOADER_BY_EXT = { '.tsx': 'tsx', '.ts': 'ts', '.jsx': 'jsx' };

for (const [ext, loader] of Object.entries(LOADER_BY_EXT)) {
  Module._extensions[ext] = function loadWithEsbuild(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const { code } = esbuild.transformSync(source, {
      loader,
      format: 'cjs',
      target: 'node18',
      jsx: 'automatic',
      sourcemap: 'inline',
      sourcefile: filename,
    });
    module._compile(code, filename);
  };
}
