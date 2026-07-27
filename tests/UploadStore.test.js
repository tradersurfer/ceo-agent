const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  UPLOAD_ROOT,
  MAX_UPLOAD_BYTES,
  saveUpload,
  getUploadMetadata,
  readUpload,
  sanitizeFilename,
} = require('../lib/uploadStore');

function cleanup(fileId) {
  fs.rmSync(path.join(UPLOAD_ROOT, fileId), { recursive: true, force: true });
}

test('saveUpload stores content retrievable by fileId', () => {
  const buffer = Buffer.from('hello world');
  const metadata = saveUpload({ filename: 'notes.txt', buffer, mimeType: 'text/plain' });
  try {
    assert.match(metadata.fileId, /^[0-9a-f-]{36}$/);
    assert.equal(metadata.filename, 'notes.txt');
    assert.equal(metadata.size, buffer.length);
    assert.equal(metadata.mimeType, 'text/plain');

    const stored = readUpload(metadata.fileId);
    assert.deepEqual(stored, buffer);

    const readBackMetadata = getUploadMetadata(metadata.fileId);
    assert.deepEqual(readBackMetadata, metadata);
  } finally {
    cleanup(metadata.fileId);
  }
});

test('upload directory and file are not group/world readable', () => {
  const buffer = Buffer.from('sensitive');
  const metadata = saveUpload({ filename: 'secret.txt', buffer });
  try {
    const dirMode = fs.statSync(path.join(UPLOAD_ROOT, metadata.fileId)).mode & 0o777;
    const fileMode = fs.statSync(path.join(UPLOAD_ROOT, metadata.fileId, metadata.filename)).mode & 0o777;
    assert.equal(dirMode & 0o077, 0, `upload directory is group/world-accessible: ${dirMode.toString(8)}`);
    assert.equal(fileMode & 0o077, 0, `upload file is group/world-readable: ${fileMode.toString(8)}`);
  } finally {
    cleanup(metadata.fileId);
  }
});

test('sanitizeFilename strips directory components and traversal', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('/etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('..\\..\\windows\\system32\\config'), 'config');
  assert.equal(sanitizeFilename('report.docx'), 'report.docx');
  assert.equal(sanitizeFilename('...hidden'), 'hidden');
  assert.equal(sanitizeFilename(''), 'upload');
});

test('saveUpload with a path-traversal filename stays scoped to its own upload directory', () => {
  const buffer = Buffer.from('x');
  const metadata = saveUpload({ filename: '../../../etc/passwd', buffer });
  try {
    assert.equal(metadata.filename, 'passwd');
    const expectedPath = path.join(UPLOAD_ROOT, metadata.fileId, 'passwd');
    assert.ok(fs.existsSync(expectedPath));
    // Confirm nothing was written outside UPLOAD_ROOT.
    assert.ok(!fs.existsSync(path.join(UPLOAD_ROOT, '..', 'passwd')));
  } finally {
    cleanup(metadata.fileId);
  }
});

test('saveUpload rejects empty buffers', () => {
  assert.throws(() => saveUpload({ filename: 'empty.txt', buffer: Buffer.alloc(0) }), RangeError);
});

test('saveUpload rejects buffers over MAX_UPLOAD_BYTES', () => {
  const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
  assert.throws(() => saveUpload({ filename: 'big.bin', buffer: oversized }), RangeError);
});

test('getUploadMetadata returns null for a malformed fileId without touching the filesystem', () => {
  assert.equal(getUploadMetadata('../../../etc/passwd'), null);
  assert.equal(getUploadMetadata('not-a-uuid'), null);
  assert.equal(getUploadMetadata(''), null);
  assert.equal(getUploadMetadata(null), null);
});

test('getUploadMetadata and readUpload return null for an unknown but well-formed fileId', () => {
  const unknownId = '00000000-0000-4000-8000-000000000000';
  assert.equal(getUploadMetadata(unknownId), null);
  assert.equal(readUpload(unknownId), null);
});
