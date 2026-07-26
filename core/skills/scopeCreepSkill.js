/**
 * Scope-creep detector: classifies a unified diff against a stated intent
 * into in-scope changes and likely scope creep (new dependencies, public API
 * renames, config/CI/build edits, oversized hunks, formatting-only files).
 *
 * Ported to JavaScript from the "scope-creep-detector" Claude Code skill in
 * Shubhamsaboo/awesome-llm-apps (agent_skills/scope-creep-detector), authored
 * by Matt Van Horn.
 * Source: https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/agent_skills/scope-creep-detector
 *
 * Copyright the original authors and contributors, licensed under the
 * Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0).
 *
 * Per Apache-2.0 section 4(b): this file is a derivative work. The original
 * is a standalone Python 3.11 CLI (`scope_creep.py`) that can either shell
 * out to `git` against a `--repo` path or classify diff text supplied
 * directly via `--diff -`. This port reimplements the diff-text
 * classification algorithm (path/subsystem detection, intent tokenization,
 * new-dependency detection for requirements.txt/package.json/pyproject.toml,
 * public API rename pairing, oversized-hunk and formatting-only-file
 * detection) in JavaScript, restricted to the diff-text mode only — it takes
 * `diffText` directly and never shells out to git or touches the filesystem,
 * so it carries none of the original CLI's `--repo`/`--staged`/`--base`
 * surface. It is wired into CEO Agent's existing SkillRegistry/SkillExecutor
 * instead of being a standalone CLI.
 */

const DEFAULT_HUNK_THRESHOLD = 80;

const STOP_WORDS = new Set([
  'add', 'branch', 'bug', 'change', 'changes', 'chore', 'develop',
  'development', 'feat', 'feature', 'fix', 'fixed', 'main', 'master',
  'the', 'this', 'to', 'update', 'with',
]);

const CONFIG_EXTENSIONS = new Set(['.toml', '.yaml', '.yml']);
const BUILD_FILES = new Set([
  'cmakelists.txt', 'docker-compose.yaml', 'docker-compose.yml',
  'dockerfile', 'makefile', 'meson.build', 'procfile',
]);

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
const REQUIREMENTS_RE = /^\s*([A-Za-z0-9][A-Za-z0-9_.-]*)/;
const JSON_PROPERTY_RE = /^\s*"([A-Za-z0-9@/_.-]+)"\s*:\s*(.+?),?\s*$/;
const PYPROJECT_STRING_RE = /^\s*["']([A-Za-z0-9][A-Za-z0-9_.-]*)[^"']*["']\s*,?\s*$/;
const PYPROJECT_ASSIGN_RE = /^\s*([A-Za-z0-9][A-Za-z0-9_.-]*)\s*=\s*(.+)$/;
// Extends the original's Python-only def/class detection to also match
// JS/TS function and class declarations, since this port runs against a
// JS/TS-first codebase rather than the original's Python-only test corpus.
const SYMBOL_RE = /^\s*(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:async\s+)?def\s+([A-Za-z_]\w*)|(?:export\s+)?class\s+([A-Za-z_$][\w$]*))/;

function cleanPath(raw) {
  let value = raw.trim();
  const tabIndex = value.indexOf('\t');
  if (tabIndex !== -1) value = value.slice(0, tabIndex).trimEnd();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value);
    } catch {
      value = value.slice(1, -1);
    }
  }
  if (value === '/dev/null' || value === 'dev/null') return null;
  if (value.startsWith('a/') || value.startsWith('b/')) value = value.slice(2);
  return value;
}

function newFileEntry(oldPath = null, newPath = null) {
  return { oldPath, newPath, path: newPath || oldPath || 'unknown', hunks: [] };
}

function parseDiff(text) {
  const files = [];
  let current = null;
  let hunk = null;
  let oldRemaining = 0;
  let newRemaining = 0;

  for (const raw of String(text).split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const parts = raw.split(/\s+/);
      const oldPath = parts.length > 2 ? cleanPath(parts[2]) : null;
      const newPath = parts.length > 3 ? cleanPath(parts[3]) : null;
      current = newFileEntry(oldPath, newPath);
      files.push(current);
      hunk = null;
      continue;
    }

    if (current === null) {
      if (!raw.startsWith('--- ')) continue;
      current = newFileEntry();
      files.push(current);
    }

    const hunkMatch = HUNK_RE.exec(raw);
    if (hunkMatch) {
      oldRemaining = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
      newRemaining = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;
      hunk = { header: raw, lines: [] };
      current.hunks.push(hunk);
      continue;
    }

    if (hunk !== null) {
      if (!raw) continue;
      const marker = raw[0];
      if (marker !== ' ' && marker !== '+' && marker !== '-') continue;
      const entry = { marker, text: raw.slice(1), index: hunk.lines.length };
      hunk.lines.push(entry);
      if (marker !== '+') oldRemaining -= 1;
      if (marker !== '-') newRemaining -= 1;
      if (oldRemaining <= 0 && newRemaining <= 0) hunk = null;
      continue;
    }

    if (raw.startsWith('--- ') && current.hunks.length) {
      current = newFileEntry();
      files.push(current);
    }
    if (raw.startsWith('rename from ')) {
      current.oldPath = cleanPath(raw.slice('rename from '.length));
      current.path = current.newPath || current.oldPath;
      continue;
    }
    if (raw.startsWith('rename to ')) {
      current.newPath = cleanPath(raw.slice('rename to '.length));
      current.path = current.newPath || current.oldPath;
      continue;
    }
    if (raw.startsWith('--- ')) {
      current.oldPath = cleanPath(raw.slice(4));
      current.path = current.newPath || current.oldPath || 'unknown';
      continue;
    }
    if (raw.startsWith('+++ ')) {
      current.newPath = cleanPath(raw.slice(4));
      current.path = current.newPath || current.oldPath || 'unknown';
      continue;
    }
  }

  return files;
}

function changedLines(fileChange, marker) {
  const result = [];
  for (const hunk of fileChange.hunks) {
    for (const entry of hunk.lines) {
      if (entry.marker === marker) result.push(entry.text);
    }
  }
  return result;
}

function tokenize(value) {
  let normalized = String(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  normalized = normalized.replace(/[^A-Za-z0-9]+/g, ' ').toLowerCase();
  const tokens = new Set();
  for (const token of normalized.split(' ')) {
    if (token.length >= 3 && !STOP_WORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

function subsystem(filePath) {
  const parts = filePath.split('/');
  return parts.length > 1 ? parts[0] : '(root)';
}

function configKind(filePath) {
  const normalized = filePath.toLowerCase();
  const name = normalized.split('/').pop();
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot) : '';
  if (normalized.startsWith('.github/')) return 'ci';
  if (BUILD_FILES.has(name) || name.startsWith('dockerfile.')) return 'build';
  if (CONFIG_EXTENSIONS.has(extension)) return 'config';
  return null;
}

function requirementDependency(line) {
  const stripped = line.trim();
  if (!stripped || /^[#\-.]/.test(stripped)) return null;
  const match = REQUIREMENTS_RE.exec(stripped);
  if (!match) return null;
  return [match[1].toLowerCase().replace(/_/g, '-'), stripped];
}

function packageJsonDependencies(fileChange, marker) {
  const dependencyKeys = new Set(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']);
  const dependencies = [];
  for (const hunk of fileChange.hunks) {
    let inDependencies = false;
    for (const entry of hunk.lines) {
      const line = entry.text;
      const topKey = /^\s{0,2}"([^"]+)"\s*:/.exec(line);
      if (topKey) {
        inDependencies = dependencyKeys.has(topKey[1]);
        continue;
      }
      if (entry.marker !== marker || !inDependencies) continue;
      const match = JSON_PROPERTY_RE.exec(line);
      if (match) dependencies.push([match[1].toLowerCase(), line.trim()]);
    }
  }
  return dependencies;
}

function pyprojectDependencies(fileChange, marker) {
  const dependencies = [];
  let section = null;
  let inProjectList = false;
  for (const hunk of fileChange.hunks) {
    for (const entry of hunk.lines) {
      const line = entry.text;
      const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (sectionMatch) {
        section = sectionMatch[1].toLowerCase();
        inProjectList = false;
        continue;
      }
      if (section === 'project' && /^\s*dependencies\s*=\s*\[/.test(line)) {
        inProjectList = true;
        continue;
      }
      if (inProjectList && line.includes(']')) inProjectList = false;
      if (entry.marker !== marker) continue;
      if (inProjectList) {
        const match = PYPROJECT_STRING_RE.exec(line);
        if (match) dependencies.push([match[1].toLowerCase().replace(/_/g, '-'), line.trim()]);
      } else if (section === 'tool.poetry.dependencies' || section === 'tool.poetry.group.dev.dependencies') {
        const match = PYPROJECT_ASSIGN_RE.exec(line);
        if (match && match[1].toLowerCase() !== 'python') {
          dependencies.push([match[1].toLowerCase().replace(/_/g, '-'), line.trim()]);
        }
      }
    }
  }
  return dependencies;
}

function dependencyLines(fileChange, marker) {
  const path = fileChange.path.toLowerCase();
  const name = path.split('/').pop();
  if (name.startsWith('requirements') && name.endsWith('.txt')) {
    const found = [];
    for (const line of changedLines(fileChange, marker)) {
      const parsed = requirementDependency(line);
      if (parsed) found.push(parsed);
    }
    return found;
  }
  if (name === 'package.json') return packageJsonDependencies(fileChange, marker);
  if (name === 'pyproject.toml') return pyprojectDependencies(fileChange, marker);
  return [];
}

function findNewDependencies(files) {
  const found = [];
  for (const fileChange of files) {
    const removed = new Set(dependencyLines(fileChange, '-').map(([name]) => name));
    for (const [name, line] of dependencyLines(fileChange, '+')) {
      if (!removed.has(name)) found.push({ path: fileChange.path, name, line });
    }
  }
  const unique = new Map();
  for (const item of found) unique.set(`${item.path} ${item.name}`, item);
  return [...unique.keys()].sort().map(key => unique.get(key));
}

function declaration(entry) {
  const match = SYMBOL_RE.exec(entry.text);
  if (!match) return null;
  const name = match[1] || match[2] || match[3];
  if (name.startsWith('_')) return null;
  const kind = (match[1] || match[2]) ? 'function' : 'class';
  return { kind, name, entry };
}

function findApiRenames(files) {
  const renames = [];
  for (const fileChange of files) {
    for (const hunk of fileChange.hunks) {
      const removed = hunk.lines.filter(entry => entry.marker === '-').map(declaration).filter(Boolean);
      const added = hunk.lines.filter(entry => entry.marker === '+').map(declaration).filter(Boolean);
      const used = new Set();
      for (const oldDecl of removed) {
        let best = null;
        for (let index = 0; index < added.length; index += 1) {
          if (used.has(index)) continue;
          const newDecl = added[index];
          if (newDecl.kind !== oldDecl.kind || newDecl.name === oldDecl.name) continue;
          const distance = Math.abs(oldDecl.entry.index - newDecl.entry.index);
          if (!best || distance < best.distance) best = { distance, index, newDecl };
        }
        if (!best || best.distance > 12) continue;
        used.add(best.index);
        renames.push({
          path: fileChange.path,
          kind: oldDecl.kind,
          from: oldDecl.name,
          to: best.newDecl.name,
          hunk: hunk.header,
        });
      }
    }
  }
  return renames.sort((a, b) => (a.path + a.from + a.to).localeCompare(b.path + b.from + b.to));
}

function linesAreFormattingOnly(removed, added) {
  if (!removed.length || removed.length !== added.length) return false;
  const normalize = line => line.replace(/\s+/g, '');
  for (let index = 0; index < removed.length; index += 1) {
    if (normalize(removed[index]) !== normalize(added[index])) return false;
  }
  return true;
}

function classify(files, intent, hunkThreshold) {
  const intentWords = tokenize(intent);
  const newDependencies = findNewDependencies(files);
  const apiRenames = findApiRenames(files);
  const depPaths = new Set(newDependencies.map(item => item.path));
  const renamePaths = new Set(apiRenames.map(item => item.path));

  const configEdits = [];
  const oversized = [];
  const formattingOnly = [];
  const subsystems = new Map();
  let additions = 0;
  let deletions = 0;
  const fileMetrics = new Map();

  for (const fileChange of files) {
    const path = fileChange.path;
    const key = subsystem(path);
    subsystems.set(key, (subsystems.get(key) || 0) + 1);
    const addedLines = changedLines(fileChange, '+');
    const removedLines = changedLines(fileChange, '-');
    fileMetrics.set(fileChange, [addedLines.length, removedLines.length]);
    additions += addedLines.length;
    deletions += removedLines.length;
    const kind = configKind(path);
    if (kind) configEdits.push({ path, kind, churn: addedLines.length + removedLines.length });
    if (linesAreFormattingOnly(removedLines, addedLines)) formattingOnly.push(path);
    for (const hunk of fileChange.hunks) {
      const churn = hunk.lines.filter(entry => entry.marker === '+' || entry.marker === '-').length;
      if (churn > hunkThreshold) oversized.push({ path, hunk: hunk.header, churn });
    }
  }

  const configPaths = new Set(configEdits.map(item => item.path));
  const oversizedPaths = new Set(oversized.map(item => item.path));
  const formattingPaths = new Set(formattingOnly);
  const inScope = [];
  const likelyCreep = [];

  for (const fileChange of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const path = fileChange.path;
    const pathWords = tokenize(path);
    const overlap = [...intentWords].filter(word => pathWords.has(word)).sort();
    const relatedness = Math.round((overlap.length / Math.max(1, intentWords.size)) * 1000) / 1000;
    const signals = [];
    if (depPaths.has(path)) signals.push('new_dependency');
    if (renamePaths.has(path)) signals.push('public_api_rename');
    if (configPaths.has(path)) signals.push('config_edit');
    if (oversizedPaths.has(path)) signals.push('oversized_hunk');
    if (formattingPaths.has(path)) signals.push('formatting_only');

    const [fileAdditions, fileDeletions] = fileMetrics.get(fileChange);
    const reasons = [];
    if (overlap.length) reasons.push(`intent/path overlap: ${overlap.join(', ')}`);
    else if (intentWords.size) reasons.push('no intent/path keyword overlap');
    else reasons.push('intent has no usable keywords');
    for (const signal of signals) reasons.push(signal.replace(/_/g, ' '));

    const item = {
      path,
      subsystem: subsystem(path),
      relatedness,
      overlap,
      signals,
      reasons,
      additions: fileAdditions,
      deletions: fileDeletions,
    };
    (overlap.length ? inScope : likelyCreep).push(item);
  }

  return {
    intent,
    inScope,
    likelyCreep,
    newDependencies,
    apiRenames,
    configEdits: [...configEdits].sort((a, b) => a.path.localeCompare(b.path)),
    stats: {
      filesTouched: files.length,
      additions,
      deletions,
      subsystems: Object.fromEntries([...subsystems.entries()].sort()),
      oversizedHunks: oversized,
      formattingOnlyFiles: [...formattingOnly].sort(),
      hunkThreshold,
    },
  };
}

const SCOPE_CREEP_PERMISSION = Object.freeze({ requiresAgentAssignment: true });

/**
 * Registers the scope_creep_detection skill onto a SkillRegistry.
 * @param {import('../SkillRegistry').SkillRegistry} registry
 */
function registerScopeCreepSkill(registry) {
  registry.register('scope_creep_detection', {
    capability: 'code_review_scope_analysis',
    inputSchema: {
      diffText: { type: 'string', required: true },
      intent: { type: 'string', required: true },
      hunkThreshold: { type: 'number', required: false },
    },
    outputSchema: {
      intent: { type: 'string', required: true },
      inScope: { type: 'array', required: true },
      likelyCreep: { type: 'array', required: true },
      newDependencies: { type: 'array', required: true },
      apiRenames: { type: 'array', required: true },
      configEdits: { type: 'array', required: true },
      stats: { type: 'object', required: true },
    },
    permissions: SCOPE_CREEP_PERMISSION,
    handler: async ({ diffText, intent, hunkThreshold = DEFAULT_HUNK_THRESHOLD }) => {
      const threshold = Number(hunkThreshold);
      if (!Number.isFinite(threshold) || threshold < 1) {
        throw new Error('hunkThreshold must be a number of at least 1.');
      }
      return classify(parseDiff(diffText), intent, threshold);
    },
  });
  return registry;
}

module.exports = {
  registerScopeCreepSkill,
  SCOPE_CREEP_PERMISSION,
  parseDiff,
  classify,
};
