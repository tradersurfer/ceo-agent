// core/frameworks/FrameworkReader.js
const path = require('path');
const fs = require('fs').promises;
const { getFrameworkById, frameworks } = require('./catalog');

/**
 * Searches the lightweight in-memory catalog without reading disk.
 */
function searchCatalogIndex(query) {
  const q = String(query || '').toLowerCase().trim();
  return frameworks.filter(fw => 
    fw.id.toLowerCase().includes(q) ||
    fw.name.toLowerCase().includes(q) ||
    fw.domain.toLowerCase().includes(q) ||
    fw.summary.toLowerCase().includes(q)
  );
}

/**
 * Reads the full Markdown framework file from the folder structure.
 */
async function loadFrameworkContent(frameworkId) {
  const metadata = getFrameworkById(frameworkId);
  if (!metadata) {
    throw new Error(`Framework with ID "${frameworkId}" not found in catalog.`);
  }

  const fullPath = path.join(__dirname, metadata.filePath);
  
  try {
    const markdownContent = await fs.readFile(fullPath, 'utf8');
    return {
      ...metadata,
      instructions: markdownContent,
    };
  } catch (error) {
    throw new Error(`Failed to load framework file at ${fullPath}: ${error.message}`);
  }
}

module.exports = {
  searchCatalogIndex,
  loadFrameworkContent,
};