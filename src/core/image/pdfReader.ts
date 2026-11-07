import { PixtiError } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { HEADER_SIZE } from '../format/version.ts';

export interface PdfImage {
  width: number;
  height: number;
  /** Zero-copy view into the PDF bytes: raw RGB, 3 bytes per pixel. */
  pixels: Uint8Array;
}

const MAX_OBJECTS = 6 + 3 * LIMITS.MAX_PART_COUNT;
const MAX_IMAGE_BYTES = LIMITS.MAX_PART_BYTES + HEADER_SIZE + 3 * LIMITS.MAX_IMAGE_DIMENSION;

const malformed = (m: string) =>
  new PixtiError(
    'MALFORMED_PDF',
    `${m} Only PDFs created by pixti and left unmodified can be read (re-saving or "printing to PDF" breaks them).`,
  );

function latin1(b: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(b[i]);
  return s;
}

/**
 * Strict reader for the PDFs written by pdfWriter.ts. Everything it reads is
 * bounds-checked; it never allocates based on a declared size, it only returns
 * views into the buffer it was given.
 */
export function readPixtiPdf(bytes: Uint8Array): PdfImage[] {
  if (bytes.length < 64 || latin1(bytes, 0, 5) !== '%PDF-') {
    throw new PixtiError('NOT_PIXTI_DOCUMENT', 'This file is not a PDF created by pixti.');
  }
  const tail = latin1(bytes, Math.max(0, bytes.length - 1024), bytes.length);
  const si = tail.lastIndexOf('startxref');
  if (si < 0) throw malformed('The PDF has no cross-reference table.');
  const sm = /^startxref\s+(\d{1,12})\s+%%EOF/.exec(tail.slice(si));
  if (!sm) throw malformed('The PDF trailer is damaged.');
  const xrefPos = Number(sm[1]);
  if (xrefPos >= bytes.length) throw malformed('The PDF cross-reference table is out of range.');

  const head = latin1(bytes, xrefPos, Math.min(bytes.length, xrefPos + 48));
  const hm = /^xref\n0 (\d{1,6})\n/.exec(head);
  if (!hm) throw malformed('The PDF was not written by pixti.');
  const n = Number(hm[1]);
  if (n < 2 || n > MAX_OBJECTS) throw malformed('The PDF has an unexpected number of objects.');
  const tableStart = xrefPos + hm[0].length;
  if (tableStart + 20 * n > bytes.length) throw malformed('The PDF cross-reference table is truncated.');
  const table = latin1(bytes, tableStart, tableStart + 20 * n);

  const images: PdfImage[] = [];
  for (let i = 1; i < n; i++) {
    const entry = table.slice(i * 20, i * 20 + 20);
    if (!/^\d{10} \d{5} [nf] \n$/.test(entry)) throw malformed('The PDF cross-reference table is damaged.');
    if (entry[17] !== 'n') continue;
    const off = Number(entry.slice(0, 10));
    if (off >= bytes.length) throw malformed('A PDF object offset is out of range.');
    const img = tryReadImage(bytes, i, off);
    if (img) images.push(img);
  }
  if (images.length === 0) throw new PixtiError('NOT_PIXTI_DOCUMENT', 'This PDF does not contain pixti pages.');
  if (images.length > LIMITS.MAX_PART_COUNT) throw malformed('The PDF contains too many pages.');
  return images;
}

function tryReadImage(bytes: Uint8Array, objNum: number, off: number): PdfImage | null {
  const peek = latin1(bytes, off, Math.min(bytes.length, off + 600));
  const head = `${objNum} 0 obj\n`;
  if (!peek.startsWith(head)) return null;
  const si = peek.indexOf('stream\n');
  const eo = peek.indexOf('endobj');
  if (si < 0 || (eo >= 0 && eo < si)) return null;
  const dict = peek.slice(head.length, si);
  if (!/\/Subtype\s*\/Image/.test(dict)) return null;

  if (/\/Filter/.test(dict) || !/\/ColorSpace\s*\/DeviceRGB/.test(dict) || !/\/BitsPerComponent\s+8(?!\d)/.test(dict)) {
    throw malformed('A page uses an image encoding pixti does not write.');
  }
  const num = (key: string): number => {
    const m = new RegExp(`/${key}\\s+(\\d{1,10})`).exec(dict);
    if (!m) throw malformed(`A page image is missing /${key}.`);
    return Number(m[1]);
  };
  const width = num('Width');
  const height = num('Height');
  const length = num('Length');
  const okDim = (d: number) => d >= 1 && d <= LIMITS.MAX_IMAGE_DIMENSION;
  if (!okDim(width) || !okDim(height)) throw malformed('A page image has invalid dimensions.');
  if (length !== width * height * 3 || length > MAX_IMAGE_BYTES) throw malformed('A page image has an invalid size.');

  const start = off + si + 'stream\n'.length;
  const end = start + length;
  if (end + 10 > bytes.length || latin1(bytes, end, end + 10) !== '\nendstream') {
    throw malformed('A page image is truncated.');
  }
  return { width, height, pixels: bytes.subarray(start, end) };
}
