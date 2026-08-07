/** @type {import('next').NextConfig} */
const nextConfig = {
  // docx (added for issue #44's document-creation skills, core/skills/
  // documentCreationSkills.js) contains a require() pattern webpack can't
  // statically analyze ("Cannot statically analyse 'require(…, …)'"),
  // which breaks every API route that transitively imports it through
  // core/RegistryLoader.js — i.e. nearly the whole web dashboard, since
  // almost every route goes through core/runtimeFactory.js. These packages
  // only ever run server-side (Node.js API routes, not the browser), so
  // excluding them from the webpack bundle and letting Node's native
  // require() resolve them at runtime is correct, not a workaround.
  serverExternalPackages: ['docx', 'pdf-lib', 'exceljs'],
};
module.exports = nextConfig;
