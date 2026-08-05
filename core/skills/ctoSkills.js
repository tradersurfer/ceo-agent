/** CTO skills — deterministic generators/auditors; no shell, Docker daemon, or cloud API calls. */
function registerCtoSkills(registry) {
  const PERMISSION = Object.freeze({ requiresAgentAssignment: true });

  registry.register('react_tailwind_ui_generation', {
    capability: 'full_stack_architecture',
    description: 'Scaffolds a React + Tailwind component from componentType (hero, card, pricing, form, or generic), with optional title and brand color tokens.',
    disableModelInvocation: true,
    inputSchema: { componentType: { type: 'string', required: true }, designSpec: { type: 'object', required: false }, brandColors: { type: 'array', required: false } },
    outputSchema: { code: { type: 'string', required: true }, files: { type: 'array', required: true } },
    permissions: PERMISSION,
    handler: async ({ componentType, designSpec = {}, brandColors = [] }) => {
      const type = String(componentType).toLowerCase().replace(/[\s_]+/g, '-');
      const name = type.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('') || 'Component';
      const primary = brandColors[0] || designSpec.primaryColor || 'indigo-600';
      const title = designSpec.title || name;
      const subtitle = designSpec.subtitle || '';
      let body;
      if (type.includes('pricing')) {
        body = '<div className="mt-8 grid gap-4 sm:grid-cols-3">'
          + [1, 2, 3].map(i => '<div className="rounded-xl border border-slate-200 p-6"><p className="text-sm font-medium text-slate-500">Plan '
            + i + '</p><p className="mt-2 text-3xl font-semibold">$' + (i * 19)
            + '</p><button className="mt-4 w-full rounded-lg bg-' + primary + ' px-3 py-2 text-sm text-white">Choose</button></div>').join('')
          + '</div>';
      } else if (type.includes('form')) {
        body = '<form className="mt-6 space-y-4"><label className="block text-sm">Email<input type="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>'
          + '<button type="submit" className="rounded-lg bg-' + primary + ' px-4 py-2 text-sm text-white">Submit</button></form>';
      } else if (type.includes('card')) {
        body = '<div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6"><p className="text-slate-600">'
          + (subtitle || 'Card body') + '</p></div>';
      } else {
        body = '<p className="mt-3 text-slate-600">' + (subtitle || 'Generated hero section') + '</p>'
          + '<div className="mt-8 flex flex-wrap gap-3">'
          + '<button className="rounded-lg bg-' + primary + ' px-4 py-2 text-sm font-medium text-white">Primary action</button>'
          + '<button className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">Secondary</button></div>';
      }
      const code = 'export default function ' + name + '() {\n  return (\n    <section className="mx-auto max-w-5xl px-4 py-12">\n      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">\n        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">'
        + title + '</h1>\n        ' + body + '\n      </div>\n    </section>\n  );\n}\n';
      return { code, files: [{ path: 'components/' + name + '.jsx', language: 'javascript', content: code }] };
    },
  });

  registry.register('node_flask_backend_integration', {
    capability: 'full_stack_architecture',
    description: 'Structures server-side logic and API handling using versatile JavaScript or Python environments.',
    disableModelInvocation: true,
    inputSchema: { stack: { type: 'string', required: true }, endpoints: { type: 'array', required: true }, database: { type: 'string', required: false } },
    outputSchema: { architecture: { type: 'object', required: true }, apiSpec: { type: 'object', required: true } },
    permissions: PERMISSION,
    handler: async ({ stack, endpoints = [], database = 'postgres' }) => {
      const normalized = String(stack).toLowerCase();
      const runtime = normalized.includes('flask') || normalized.includes('python') ? 'flask' : 'node';
      const paths = endpoints.map((ep, i) => {
        if (typeof ep === 'string') {
          const parts = ep.includes(' ') ? ep.split(/\s+/, 2) : ['GET', ep];
          return { id: 'ep_' + (i + 1), method: parts[0].toUpperCase(), path: parts[1] };
        }
        return { id: 'ep_' + (i + 1), method: String(ep.method || 'GET').toUpperCase(), path: String(ep.path || ep.url || ('/resource_' + (i + 1))), auth: Boolean(ep.auth) };
      });
      return {
        architecture: {
          runtime, database: String(database), layers: ['http_router', 'validation', 'service', 'repository'],
          recommendations: [
            runtime === 'node' ? 'Use Express or Fastify with schema validation (Zod/AJV).' : 'Use Flask blueprints + marshmallow/pydantic validation.',
            'Persist via ' + database + '; keep credentials in env only.',
            'Add request IDs and structured logging at the edge.',
          ],
        },
        apiSpec: {
          openapi: '3.0.3', info: { title: runtime + '-service', version: '0.1.0' },
          paths: Object.fromEntries(paths.map(p => [p.path, { [p.method.toLowerCase()]: { operationId: p.id, responses: { '200': { description: 'OK' } } } }])),
        },
      };
    },
  });

  registry.register('firebase_vercel_deployment_config', {
    capability: 'cloud_deployment_orchestration',
    description: 'Audits provided env vars for Firebase/Vercel hygiene and uses projectRoot to recommend config file paths and path-derived project labels. Does not mutate the filesystem.',
    disableModelInvocation: true,
    inputSchema: { projectRoot: { type: 'string', required: true }, platform: { type: 'string', required: false }, envVars: { type: 'object', required: false } },
    outputSchema: { configReport: { type: 'object', required: true }, fixes: { type: 'array', required: true } },
    permissions: PERMISSION,
    handler: async ({ projectRoot, platform = 'both', envVars = {} }) => {
      const keys = Object.keys(envVars || {});
      const lower = keys.map(k => k.toLowerCase());
      const fixes = [];
      const missing = [];
      const root = String(projectRoot).replace(/\/+$/, '') || '.';
      const base = root.split(/[\\/]/).filter(Boolean).pop() || 'app';
      const needs = { vercel: ['VERCEL_ENV', 'NEXT_PUBLIC_SITE_URL'], firebase: ['FIREBASE_PROJECT_ID', 'FIREBASE_API_KEY'], common: ['NODE_ENV'] };
      const platforms = String(platform).toLowerCase() === 'firebase' ? ['firebase', 'common'] : String(platform).toLowerCase() === 'vercel' ? ['vercel', 'common'] : ['vercel', 'firebase', 'common'];
      for (const group of platforms) {
        for (const key of needs[group]) {
          if (!keys.some(k => k.toUpperCase() === key) && !lower.includes(key.toLowerCase())) {
            missing.push(key);
            fixes.push({ type: 'add_env', key, reason: 'Expected for ' + group + ' deployment hygiene', example: key.includes('URL') ? 'https://example.com' : 'set-in-hosting-dashboard' });
          }
        }
      }
      for (const key of keys) {
        const val = String(envVars[key] ?? '');
        if (/secret|password|private_key/i.test(key) && val && !val.startsWith('***')) fixes.push({ type: 'redact_in_logs', key, reason: 'Secret-looking value present in provided env map; ensure it is never committed or echoed.' });
        if (key.startsWith('NEXT_PUBLIC_') && /secret|key|token/i.test(key) && !/PUBLISHABLE|SITE/i.test(key)) fixes.push({ type: 'review_public_prefix', key, reason: 'Secret-like name under NEXT_PUBLIC_ may leak to the browser bundle.' });
      }
      if (platforms.includes('vercel')) {
        fixes.push({ type: 'config_path', path: root + '/vercel.json', reason: 'Recommended Vercel config location under projectRoot' });
        fixes.push({ type: 'config_path', path: root + '/.env.local', reason: 'Recommended local env file under projectRoot (do not commit secrets)' });
      }
      if (platforms.includes('firebase')) {
        fixes.push({ type: 'config_path', path: root + '/firebase.json', reason: 'Recommended Firebase config location under projectRoot' });
        fixes.push({ type: 'config_path', path: root + '/.firebaserc', reason: 'Recommended Firebase project alias file under projectRoot' });
      }
      return {
        configReport: {
          projectRoot: root,
          projectLabel: base,
          platform: String(platform),
          envKeyCount: keys.length,
          missing,
          recommendedConfigFiles: fixes.filter(f => f.type === 'config_path').map(f => f.path),
          note: 'Filesystem was not modified; projectRoot is used for path recommendations and labeling only.',
        },
        fixes,
      };
    },
  });

  registry.register('docker_environment_blueprinting', {
    capability: 'ai_agent_containerization',
    description: 'Emits an isolation blueprint and a Dockerfile tailored to frameworkName and isolationLevel. Does not build or run containers (ADR-001a).',
    disableModelInvocation: true,
    inputSchema: { frameworkName: { type: 'string', required: true }, isolationLevel: { type: 'string', required: false }, riskRules: { type: 'array', required: false } },
    outputSchema: { blueprint: { type: 'object', required: true }, dockerfile: { type: 'string', required: true } },
    permissions: PERMISSION,
    handler: async ({ frameworkName, isolationLevel = 'standard', riskRules = [] }) => {
      const name = String(frameworkName).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      const isolation = String(isolationLevel).toLowerCase();
      const rules = riskRules.length ? riskRules.map(String) : ['No host network mode', 'Read-only root filesystem where possible', 'Drop all capabilities except explicit allowlist', 'No privileged mode', 'Secrets via runtime env, never baked into image'];
      const strict = isolation === 'strict';
      const dockerfile = [
        '# Blueprint only — not executed by CEO Agent (ADR-001a)',
        '# framework: ' + name + ' isolation: ' + isolation,
        'FROM node:20-bookworm-slim',
        'WORKDIR /app/' + name,
        'ENV NODE_ENV=production',
        'ENV FRAMEWORK_NAME=' + name,
        strict ? 'ENV READ_ONLY_ROOT=1' : 'ENV READ_ONLY_ROOT=0',
        'COPY package*.json ./',
        'RUN npm ci --omit=dev',
        'COPY . .',
        strict ? 'USER nobody' : 'USER node',
        strict ? 'CMD ["node", "--no-warnings", "index.js"]' : 'CMD ["node", "index.js"]',
        '',
      ].join('\n');
      return {
        blueprint: {
          frameworkName: name, isolationLevel: isolation,
          network: strict ? 'none' : 'egress-allowlist',
          filesystem: strict ? 'read-only-root' : 'limited-write-/tmp',
          riskRules: rules,
          notes: ['CEO Agent does not spawn containers; this skill only emits a blueprint.', 'Execution belongs to Hermes gateway sandbox backends per ADR-001a.'],
        },
        dockerfile,
      };
    },
  });

  registry.register('open_source_dependency_audit', {
    capability: 'open_source_risk_assessment',
    description: 'Heuristic risk scoring over a provided dependency list (name/version/deprecated flags). Does not parse lockfiles, terminal logs, or shell scripts, and does not call npm audit.',
    disableModelInvocation: true,
    inputSchema: { dependencies: { type: 'array', required: true }, packageLockPath: { type: 'string', required: false } },
    outputSchema: { vulnerabilities: { type: 'array', required: true }, riskScore: { type: 'number', required: true } },
    permissions: PERMISSION,
    handler: async ({ dependencies = [], packageLockPath }) => {
      const vulnerabilities = [];
      let score = 0;
      const riskyName = /(eval|crypto-miner|postinstall|node-ipc|event-stream)/i;
      for (const dep of dependencies) {
        const name = typeof dep === 'string' ? dep : String(dep.name || '');
        const version = typeof dep === 'object' ? String(dep.version || '*') : '*';
        if (!name) continue;
        if (riskyName.test(name)) { vulnerabilities.push({ package: name, version, severity: 'high', reason: 'Name matches historically risky package patterns.' }); score += 25; }
        if (/^0\./.test(version) || version === '*') { vulnerabilities.push({ package: name, version, severity: 'medium', reason: 'Pre-1.0 or wildcard version increases supply-chain uncertainty.' }); score += 8; }
        if (typeof dep === 'object' && dep.deprecated) { vulnerabilities.push({ package: name, version, severity: 'medium', reason: 'Marked deprecated by caller.' }); score += 10; }
      }
      if (packageLockPath) {
        vulnerabilities.push({ package: '(lockfile)', version: null, severity: 'info', reason: 'packageLockPath provided but not read; filesystem inspection is out of scope. Run npm audit in CI separately.' });
      }
      return { vulnerabilities, riskScore: Math.max(0, Math.min(100, score)) };
    },
  });
}
module.exports = { registerCtoSkills };
