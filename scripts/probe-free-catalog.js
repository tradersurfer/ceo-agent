// Throwaway: verify FreeModelCatalog against BOTH live catalogs.
const OpenRouterClient = require('../sdk/OpenRouterClient');
const OpenCodeZenClient = require('../sdk/OpenCodeZenClient');
const { resolveFreeModels, pickBestFree } = require('../ceo-core/FreeModelCatalog');

(async () => {
  const [or, zen] = await Promise.all([
    new OpenRouterClient().listModels(),
    new OpenCodeZenClient().listModels(),
  ]);
  console.log('raw openrouter models:', or.length, '| raw zen models:', zen.length);

  const { models } = resolveFreeModels({ openRouterModels: or, zenModels: zen });
  console.log('\nresolved free chat models:', models.length);
  for (const m of models) {
    console.log(
      '  ', m.source.padEnd(11),
      m.apiModelId.padEnd(46),
      'ctx=' + String(m.contextLength).padEnd(9)
    );
  }
  const best = pickBestFree(models);
  console.log('\npickBestFree ->', best ? best.apiModelId : 'NULL', '| source:', best && best.source);
})().catch(e => {
  console.error('ERR', e.message);
  process.exitCode = 1;
});
