const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(process.cwd());
const UPLOAD_ROOT = path.join(ROOT, '.uploads');
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const FILE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Strips any directory component and leading dots so a stored filename can
 * never escape its upload directory (path traversal) or resolve to a hidden
 * dotfile from an attacker-controlled name (e.g. "../../etc/passwd").
 * @param {string} rawName
 * @returns {string}
 */
function sanitizeFilename(rawName) {
  const base = path.basename(String(rawName || '').replace(/\\/g, '/')).trim();
  const stripped = base.replace(/^\.+/, '');
  return stripped || 'upload';
}

function metadataPath(fileId) {
  return path.join(UPLOAD_ROOT, fileId, 'metadata.json');
}

function contentPath(fileId, filename) {
  return path.join(UPLOAD_ROOT, fileId, filename);
}

/**
 * Saves an uploaded file's bytes to a scoped, non-world-readable directory
 * keyed by a fresh random fileId. Never trusts the caller-supplied filename
 * for path construction beyond its sanitized basename.
 * @param {object} input
 * @param {string} input.filename Original filename (display only, sanitized before use on disk).
 * @param {Buffer} input.buffer File contents.
 * @param {string} [input.mimeType] Best-effort content type, stored as metadata only.
 * @returns {{fileId: string, filename: string, size: number, mimeType: string|null, uploadedAt: string}}
 */
function saveUpload({ filename, buffer, mimeType = null }) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('buffer must be a Buffer.');
  if (buffer.length === 0) throw new RangeError('Refusing to store an empty upload.');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new RangeError(`Upload exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`);
  }

  const fileId = crypto.randomUUID();
  const safeName = sanitizeFilename(filename);
  const dir = path.join(UPLOAD_ROOT, fileId);

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(contentPath(fileId, safeName), buffer, { mode: 0o600 });

  const metadata = {
    fileId,
    filename: safeName,
    size: buffer.length,
    mimeType: mimeType || null,
    uploadedAt: new Date().toISOString(),
  };
  fs.writeFileSync(metadataPath(fileId), JSON.stringify(metadata, null, 2), { mode: 0o600 });

  return metadata;
}

/**
 * Returns stored metadata for a fileId, or null if the id is malformed or
 * unknown. The format check runs before any filesystem access so a
 * malicious fileId can never be used to probe or traverse the filesystem.
 * @param {string} fileId
 * @returns {{fileId: string, filename: string, size: number, mimeType: string|null, uploadedAt: string}|null}
 */
function getUploadMetadata(fileId) {
  if (typeof fileId !== 'string' || !FILE_ID_RE.test(fileId)) return null;
  try {
    return JSON.parse(fs.readFileSync(metadataPath(fileId), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Reads a previously saved upload's bytes back, or null if unknown.
 * @param {string} fileId
 * @returns {Buffer|null}
 */
function readUpload(fileId) {
  const metadata = getUploadMetadata(fileId);
  if (!metadata) return null;
  try {
    return fs.readFileSync(contentPath(fileId, metadata.filename));
  } catch {
    return null;
  }
}

module.exports = {
  UPLOAD_ROOT,
  MAX_UPLOAD_BYTES,
  saveUpload,
  getUploadMetadata,
  readUpload,
  sanitizeFilename,
};
