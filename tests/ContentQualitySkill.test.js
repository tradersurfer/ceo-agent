const test = require('node:test');
const assert = require('node:assert/strict');
const Organization = require('../organization/Organization');
const { SkillRegistry } = require('../ceo-core/SkillRegistry');
const { SkillExecutor } = require('../ceo-core/SkillExecutor');
const { registerContentQualitySkill } = require('../ceo-core/skills/contentQualitySkill');

function build() {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registerContentQualitySkill(registry);
  const executor = new SkillExecutor(registry, {
    agentResolver: agentId => organization.findAgent(agentId),
  });
  return { organization, registry, executor };
}

const asCmo = { agentId: 'cmo_agent' };

test('content_quality_analysis registers through SkillRegistry with schema and permission metadata', () => {
  const { registry } = build();
  const skill = registry.get('content_quality_analysis');
  assert.ok(skill);
  assert.equal(skill.capability, 'marketing_content_quality');
  assert.ok(Object.keys(skill.inputSchema).length > 0);
  assert.ok(Object.keys(skill.outputSchema).length > 0);
  assert.equal(skill.permissions.requiresAgentAssignment, true);
});

test('CMO Agent is assigned content_quality_analysis; other department heads are not', () => {
  const { organization } = build();
  assert.equal(organization.findAgent('cmo_agent').skills.includes('content_quality_analysis'), true);
  assert.equal(organization.findAgent('clo_agent').skills.includes('content_quality_analysis'), false);
});

test('flags empty input without crashing', async () => {
  const { executor } = build();
  const result = await executor.run('content_quality_analysis', { text: '   ' }, 5000, asCmo);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.output.flags, ['empty-input']);
  assert.equal(result.output.overallQuality, 0);
  assert.equal(result.output.passesThreshold, false);
});

test('detects filler phrases and scores them into the filler signal', async () => {
  const { executor } = build();
  const text = "It's important to note that, when it comes to SEO, at the end of the day, first and foremost, needless to say, in the realm of content strategy, the bottom line is quality matters.";
  const result = await executor.run('content_quality_analysis', { text }, 5000, asCmo);

  assert.equal(result.status, 'ok');
  assert.ok(result.output.fillerScore > 0);
  assert.ok(result.output.matches.filler.length > 0);
  assert.ok(result.output.matches.filler.includes("it's important to note that"));
});

test('detects AI-pattern phrases from the CC BY-SA wordlist and scores them into the ai-pattern signal', async () => {
  const { executor } = build();
  const text = 'Let us delve into the ever-evolving landscape of navigating the complexities of a rich tapestry of possibilities, as we embark on a journey that is a testament to leveraging the power of cutting-edge, state-of-the-art solutions. In conclusion, this is a game-changer.';
  const result = await executor.run('content_quality_analysis', { text }, 5000, asCmo);

  assert.equal(result.status, 'ok');
  assert.ok(result.output.aiPatternScore > 0);
  assert.ok(result.output.matches.aiPatterns.includes('delve into'));
  assert.ok(result.output.matches.aiPatterns.includes('cutting-edge'));
});

test('flags thin content under 300 tokens', async () => {
  const { executor } = build();
  const result = await executor.run('content_quality_analysis', { text: 'A short paragraph about nothing in particular, just a few words to test the thin-content flag.' }, 5000, asCmo);
  assert.equal(result.status, 'ok');
  assert.ok(result.output.flags.includes('thin-content'));
  assert.ok(result.output.tokens < 300);
});

test('detects bigram repetition and flags it when the threshold is exceeded', async () => {
  const { executor } = build();
  const repeated = 'the quick fox the quick fox the quick fox the quick fox the quick fox the quick fox '.repeat(3);
  const result = await executor.run('content_quality_analysis', { text: repeated }, 5000, asCmo);
  assert.equal(result.status, 'ok');
  assert.ok(result.output.repetitionScore > 0);
  assert.ok(result.output.flags.includes('repetitive'));
});

test('high-density, low-filler, non-repetitive text scores well and passes the default threshold', async () => {
  const { executor } = build();
  const text = 'Amazon reported Q3 2026 revenue of $170 billion, a 12% increase driven by AWS growth of 18% and advertising revenue up 24%. CEO Andy Jassy attributed the results to enterprise cloud migration, citing a 340-basis-point margin expansion in North America retail. The company added 45,000 fulfillment jobs across Texas, Ohio, and Georgia during the quarter, according to filings with the Securities and Exchange Commission dated November 3, 2026.'.repeat(3);
  const result = await executor.run('content_quality_analysis', { text }, 5000, asCmo);
  assert.equal(result.status, 'ok');
  assert.ok(result.output.informationDensity > 0.2, `expected information density > 0.2, got ${result.output.informationDensity}`);
  assert.equal(result.output.passesThreshold, result.output.overallQuality >= 60);
});

test('threshold is configurable and reflected in passesThreshold', async () => {
  const { executor } = build();
  const result = await executor.run('content_quality_analysis', { text: 'Plain unremarkable text without any flagged phrases at all, repeated enough times to clear the thin-content minimum for this specific test case here.', threshold: 0 }, 5000, asCmo);
  assert.equal(result.status, 'ok');
  assert.equal(result.output.passesThreshold, true);
});

test('input validation failure returns failed without running the handler, and is audited', async () => {
  const { executor } = build();
  const result = await executor.run('content_quality_analysis', {}, 5000, asCmo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /text is required/);
  assert.equal(executor.audit.list().at(-1).reason, 'input_validation');
});

test('an agent without the assigned skill is blocked by Permissions and audited', async () => {
  const { executor } = build();
  const result = await executor.run('content_quality_analysis', { text: 'hello world' }, 5000, { agentId: 'cfo_agent' });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /not authorized/);
  assert.equal(executor.audit.list().at(-1).reason, 'permission_denied');
});

test('unregistered skill name returns failed', async () => {
  const { executor } = build();
  const result = await executor.run('does_not_exist', {}, 5000, asCmo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /No skill registered/);
});

test('timeout handling is normalized and audited for a slow handler that honors its signal', async () => {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registry.register('slow_content_quality_skill', {
    capability: 'test',
    inputSchema: {},
    outputSchema: {},
    handler: (input, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  });
  const executor = new SkillExecutor(registry, {
    agentResolver: agentId => organization.findAgent(agentId),
  });
  const result = await executor.run('slow_content_quality_skill', {}, 20, asCmo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /timed out/);
  assert.equal(executor.audit.list().at(-1).reason, 'timeout');
});
