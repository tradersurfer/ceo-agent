const test = require('node:test');
const assert = require('node:assert/strict');
const Organization = require('../organization/Organization');
const { SkillRegistry } = require('../core/SkillRegistry');
const { SkillExecutor } = require('../core/SkillExecutor');
const { registerSchemaMarkupSkills } = require('../core/skills/schemaMarkupSkills');

function build() {
  const organization = Organization.createDefault();
  const registry = new SkillRegistry();
  registerSchemaMarkupSkills(registry);
  const executor = new SkillExecutor(registry, {
    agentResolver: agentId => organization.findAgent(agentId),
  });
  return { organization, registry, executor };
}

const asCmo = { agentId: 'cmo_agent' };

test('all four schema-markup skills register through SkillRegistry with schemas and permission metadata', () => {
  const { registry } = build();
  for (const name of ['schema_reservation_markup', 'schema_order_markup', 'schema_discussion_markup', 'schema_profile_markup']) {
    const skill = registry.get(name);
    assert.ok(skill, `${name} should be registered`);
    assert.equal(skill.capability, 'marketing_schema_markup');
    assert.ok(Object.keys(skill.inputSchema).length > 0);
    assert.equal(skill.permissions.requiresAgentAssignment, true);
  }
});

test('CMO Agent is assigned all four schema-markup skills; other department heads are not', () => {
  const { organization } = build();
  const cmoSkills = organization.findAgent('cmo_agent').skills;
  for (const name of ['schema_reservation_markup', 'schema_order_markup', 'schema_discussion_markup', 'schema_profile_markup']) {
    assert.equal(cmoSkills.includes(name), true, `cmo_agent should have ${name}`);
  }
  assert.equal(organization.findAgent('cto_agent').skills.includes('schema_reservation_markup'), false);
});

test('schema_reservation_markup builds a FoodEstablishmentReservation JSON-LD block', async () => {
  const { executor } = build();
  const result = await executor.run('schema_reservation_markup', {
    provider: 'Marea NYC',
    start: '2026-06-04T19:30:00-04:00',
    partySize: 4,
    reservationId: 'RX-12345',
  }, 5000, asCmo);

  assert.equal(result.status, 'ok');
  const { jsonLd } = result.output;
  assert.equal(jsonLd['@context'], 'https://schema.org');
  assert.equal(jsonLd['@type'], 'FoodEstablishmentReservation');
  assert.equal(jsonLd.reservationStatus, 'https://schema.org/ReservationConfirmed');
  assert.equal(jsonLd.provider.name, 'Marea NYC');
  assert.equal(jsonLd.reservationFor.name, 'Marea NYC');
  assert.equal(jsonLd.reservationFor['@type'], 'FoodEstablishment');
  assert.equal(jsonLd.partySize, 4);
  assert.equal(jsonLd.reservationId, 'RX-12345');
  assert.equal(jsonLd.endTime, undefined, 'unset optional fields should be stripped, not emitted as null');
});

test('schema_reservation_markup rejects an unsupported reservation kind', async () => {
  const { executor } = build();
  const result = await executor.run('schema_reservation_markup', {
    provider: 'Acme', start: '2026-01-01T00:00:00Z', kind: 'NotARealKind',
  }, 5000, asCmo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Unsupported reservation kind/);
});

test('schema_order_markup builds an OrderAction with default delivery methods', async () => {
  const { executor } = build();
  const result = await executor.run('schema_order_markup', {
    merchant: 'Acme Pizza', orderUrl: 'https://acme.example/order',
  }, 5000, asCmo);

  assert.equal(result.status, 'ok');
  const { jsonLd } = result.output;
  assert.equal(jsonLd['@type'], 'OrderAction');
  assert.equal(jsonLd.name, 'Order online');
  assert.equal(jsonLd.target.urlTemplate, 'https://acme.example/order');
  assert.deepEqual(jsonLd.deliveryMethod, ['https://schema.org/OnSitePickup', 'https://schema.org/ParcelService']);
  assert.equal(jsonLd.merchant.name, 'Acme Pizza');
});

test('schema_order_markup includes acceptedPaymentMethod when supplied', async () => {
  const { executor } = build();
  const result = await executor.run('schema_order_markup', {
    merchant: 'Acme', orderUrl: 'https://acme.example/order', acceptedPaymentMethod: ['Cash', 'CreditCard'],
  }, 5000, asCmo);
  assert.equal(result.status, 'ok');
  assert.deepEqual(
    result.output.jsonLd.acceptedPaymentMethod,
    [{ '@type': 'PaymentMethod', name: 'Cash' }, { '@type': 'PaymentMethod', name: 'CreditCard' }],
  );
});

test('schema_discussion_markup builds a DiscussionForumPosting with interactionStatistic when likes are given', async () => {
  const { executor } = build();
  const result = await executor.run('schema_discussion_markup', {
    headline: 'How do you score INP correctly?',
    author: 'Sara Park',
    url: 'https://forum.example.com/t/123',
    datePublished: '2026-05-12T14:00:00Z',
    likes: 42,
  }, 5000, asCmo);

  assert.equal(result.status, 'ok');
  const { jsonLd } = result.output;
  assert.equal(jsonLd['@type'], 'DiscussionForumPosting');
  assert.equal(jsonLd.author.name, 'Sara Park');
  assert.equal(jsonLd.mainEntityOfPage['@id'], 'https://forum.example.com/t/123');
  assert.deepEqual(jsonLd.interactionStatistic, [{
    '@type': 'InteractionCounter',
    interactionType: 'https://schema.org/LikeAction',
    userInteractionCount: 42,
  }]);
});

test('schema_profile_markup builds a ProfilePage with sameAs and knowsAbout', async () => {
  const { executor } = build();
  const result = await executor.run('schema_profile_markup', {
    name: 'Daniel Agrici',
    url: 'https://agricidaniel.com/about',
    sameAs: ['https://github.com/AgriciDaniel', 'https://twitter.com/agricidaniel'],
    knowsAbout: ['SEO', 'Schema markup', 'Core Web Vitals'],
  }, 5000, asCmo);

  assert.equal(result.status, 'ok');
  const { jsonLd } = result.output;
  assert.equal(jsonLd['@type'], 'ProfilePage');
  assert.equal(jsonLd.mainEntity.name, 'Daniel Agrici');
  assert.deepEqual(jsonLd.mainEntity.sameAs, ['https://github.com/AgriciDaniel', 'https://twitter.com/agricidaniel']);
  assert.deepEqual(jsonLd.mainEntity.knowsAbout, ['SEO', 'Schema markup', 'Core Web Vitals']);
});

test('input validation failure returns failed without running the handler, and is audited', async () => {
  const { executor } = build();
  const result = await executor.run('schema_reservation_markup', { start: '2026-01-01T00:00:00Z' }, 5000, asCmo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /provider is required/);
  assert.equal(executor.audit.list().at(-1).reason, 'input_validation');
});

test('an agent without the assigned skill is blocked by Permissions and audited', async () => {
  const { executor } = build();
  const result = await executor.run('schema_reservation_markup', {
    provider: 'Acme', start: '2026-01-01T00:00:00Z',
  }, 5000, { agentId: 'cfo_agent' });
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
  registry.register('slow_schema_skill', {
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
  const result = await executor.run('slow_schema_skill', {}, 20, asCmo);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /timed out/);
  assert.equal(executor.audit.list().at(-1).reason, 'timeout');
});
