import { NextResponse } from 'next/server';
import { checkRateLimit } from '../dispatch/handler';
const { saveUpload, getUploadMetadata, readUpload, MAX_UPLOAD_BYTES } = require('../../../lib/uploadStore');

/**
 * POST /api/uploads
 *
 * Accepts multipart/form-data with a single `file` field and stores it via
 * lib/uploadStore.js — the same backend module the CLI's /attach command
 * calls directly in-process. Returns a fileId that later chat requests can
 * reference via `attachmentIds`.
 */
export async function POST(request: Request) {
  const clientKey = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimit = await checkRateLimit(clientKey);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data body.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'A "file" field is required.' }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File exceeds the ${MAX_UPLOAD_BYTES}-byte limit.` }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = saveUpload({ filename: file.name, buffer, mimeType: file.type || null });
    return NextResponse.json({ status: 'ok', ...metadata });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Upload failed', detail: message }, { status: 400 });
  }
}

/**
 * GET /api/uploads?fileId=<id>
 * GET /api/uploads?fileId=<id>&download=1
 *
 * Without `download`, looks up metadata for a previously uploaded (or
 * skill-generated) file, so the web dashboard can confirm an attachment
 * resolved before sending it along with a chat message. With `download=1`,
 * streams the actual bytes back with a Content-Disposition attachment
 * header, so a file — uploaded or produced by a document-creation skill —
 * can actually be downloaded or attached to a chat message, not just
 * referenced by id.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fileId = url.searchParams.get('fileId');
  const metadata = fileId ? getUploadMetadata(fileId) : null;
  if (!metadata) {
    return NextResponse.json({ error: 'Unknown fileId.' }, { status: 404 });
  }

  if (url.searchParams.get('download') !== '1') {
    return NextResponse.json({ status: 'ok', ...metadata });
  }

  const buffer = readUpload(fileId as string);
  if (!buffer) {
    return NextResponse.json({ error: 'File content is missing.' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': metadata.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${metadata.filename.replace(/"/g, '')}"`,
      'Content-Length': String(metadata.size),
    },
  });
}
