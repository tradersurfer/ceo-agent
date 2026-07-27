# Proposed File Trees — Notes

Architecture questions worth a real look eventually, captured here rather
than acted on. Not implementation, not an issue by itself.

## Frameworks-as-individual-files (legitimate future question)

**This is a separate, legitimate architecture question — do not conflate
it with the rejected skills/providers structure below.**

`core/frameworks/catalog.js` is currently one 528-line JS file: a single
frozen array of framework objects (`id`, `name`, `domain`, `definition`,
`whenToUse`, `expectedOutput`) covering all nine domains (`strategy`,
`finance`, `accounting`, `operations`, `marketing`, `technology`,
`organization`, `people`, `legal`), loaded with a plain `require()` — see
`core/runtimeFactory.js`'s `runtime.frameworkCatalog = frameworkCatalog`.

The proposal: split that array into individual files per domain, e.g.:

```
core/frameworks/
  strategic/okr-alignment.md
  marketing/aarrr-funnel.md
  operations/value-stream-mapping.md
  people/galbraith-star-model.md
  people/adkar-change-management.md
  ...
```

(`.md` or `.json` — not decided; `.md` reads better for a framework
definition, `.json` matches the existing registry-loading pattern used
elsewhere in this codebase.)

**What this would actually require:** `catalog.js`'s three lookup
functions (`getAllFrameworks`, `getFrameworksByDomain`, `getFrameworkById`)
currently operate on one in-memory array built at module-require time —
free at runtime, no I/O. Splitting into per-file storage means something
has to walk `core/frameworks/{domain}/*` at load time and parse each file
into the same shape those three functions currently return, i.e. a real
loader (structurally similar to `core/RegistryLoader.js`'s
`readRegistry()`, which already does this for the four JSON registries) —
not a drop-in swap. Worth doing if the framework catalog keeps growing and
a single 500+-line file becomes the actual bottleneck for
editing/reviewing individual frameworks, but real but non-urgent: nothing
about the current single-file shape is broken today, and no consumer
needs per-file granularity yet.

## Rejected structure — do not build (for contrast, not a live proposal)

`core/skills/registry.json` as a **second** skill catalog, with
`core/skills/{marketing,data,integrations}/*.js` implementation files, plus
`/lib` provider SDK wrapper files (`lib/ai-providers/*.js`) instantiating
`OpenAI`/`Anthropic`/`GoogleGenAI` clients directly as a parallel
model-resolution path competing with `core/ModelResolver.js`.

This is architecturally identical to what PR #42 was closed for: a second,
competing skill-registration catalog alongside `registry/skill-registry.json`,
and a second, competing model-resolution path alongside `ModelResolver.js`.
This project maintains one canonical runtime-construction path and one
canonical model-resolution path by explicit prior decision (see PR #42's
closing comment). Listed here only so the frameworks-as-files proposal
above doesn't get conflated with it — the two are not the same kind of
change. Frameworks-as-files keeps one canonical catalog, just splits its
storage across files instead of one array; the rejected structure adds a
second catalog and a second resolution path outright.
