import { PixtiError } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import type { Layout } from './pixelEncoder.ts';

/**
 * Writes a plain PDF 1.4 file in which every page shows one raw RGB image.
 *
 * Why PDF: messaging apps and e-mail treat PDFs as documents and never recompress
 * them, whereas PNG/JPEG "photos" are routinely re-encoded. The image stream has NO
 * /Filter, so the pixel bytes are stored verbatim.
 *
 * The file has a classic xref table with exact offsets, which is what lets
 * pdfReader.ts find the image streams without scanning binary data.
 */
export interface PdfPage {
  layout: Layout;
  /** Written back to back at the start of the image; the remainder stays zero. */
  segments: Uint8Array[];
  /** Short ASCII caption, e.g. "Part 2 of 5" */
  label: string;
}

const PAGE_W = 595;
const PAGE_H = 842;

type Piece = { bytes: Uint8Array } | { length: number; segments: Uint8Array[] };

// Fixed object numbers
const OBJ_CATALOG = 1;
const OBJ_PAGES = 2;
const OBJ_FONT = 3;
const OBJ_FONT_BOLD = 4;
const OBJ_INFO = 5;
const FIRST_PAGE_OBJ = 6; // then page, contents, image for each page

function pageContent(pg: PdfPage): string {
  const { width: w, height: h } = pg.layout;
  const M = 36;
  const TOP = 72;
  const BOTTOM = 52;
  const s = Math.min((PAGE_W - 2 * M) / w, (PAGE_H - TOP - BOTTOM) / h);
  const dw = w * s;
  const dh = h * s;
  const x = (PAGE_W - dw) / 2;
  const y = PAGE_H - TOP - dh;
  const n = (v: number) => v.toFixed(3);
  const label = pg.label.replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, '');
  return [
    '0.961 0.608 0.220 rg',
    `${M} ${PAGE_H - 40} 22 4 re f`,
    '0.071 0.420 0.263 rg',
    `BT /F2 18 Tf ${M} ${PAGE_H - 62} Td (pixti) Tj ET`,
    '0.369 0.447 0.420 rg',
    `BT /F1 10 Tf ${M + 58} ${PAGE_H - 61} Td (${label}) Tj ET`,
    `BT /F1 8 Tf ${M} 30 Td (Encoded data. Open this document with pixti to recover the file. Do not edit, print or re-save it.) Tj ET`,
    `q ${n(dw)} 0 0 ${n(dh)} ${n(x)} ${n(y)} cm /Im0 Do Q`,
  ].join('\n');
}

export function buildPdf(pages: PdfPage[]): Uint8Array {
  if (pages.length < 1 || pages.length > LIMITS.MAX_PART_COUNT) {
    throw new PixtiError('INTERNAL', 'Invalid page count.');
  }
  const enc = new TextEncoder();
  const pieces: Piece[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (bytes: Uint8Array) => {
    pieces.push({ bytes });
    pos += bytes.length;
  };
  const text = (s: string) => push(enc.encode(s));
  const obj = (n: number, body: string) => {
    offsets[n] = pos;
    text(`${n} 0 obj\n${body}\nendobj\n`);
  };

  // "%PDF-1.4\n%<4 high-bit bytes>\n": the second line marks the file as binary.
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const kids = pages.map((_, k) => `${FIRST_PAGE_OBJ + 3 * k} 0 R`).join(' ');
  obj(OBJ_CATALOG, `<< /Type /Catalog /Pages ${OBJ_PAGES} 0 R >>`);
  obj(OBJ_PAGES, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(OBJ_FONT, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(OBJ_FONT_BOLD, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  // Deliberately generic: nothing about the encoded file may leak through document metadata.
  obj(OBJ_INFO, '<< /Producer (pixti) /Title (pixti encoded document) >>');

  pages.forEach((pg, k) => {
    const pageNo = FIRST_PAGE_OBJ + 3 * k;
    const contNo = pageNo + 1;
    const imgNo = pageNo + 2;
    const content = pageContent(pg);
    obj(
      pageNo,
      `<< /Type /Page /Parent ${OBJ_PAGES} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${OBJ_FONT} 0 R /F2 ${OBJ_FONT_BOLD} 0 R >> /XObject << /Im0 ${imgNo} 0 R >> >> /Contents ${contNo} 0 R >>`,
    );
    obj(contNo, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

    const { width, height, rawBytes } = pg.layout;
    let segTotal = 0;
    for (const s of pg.segments) segTotal += s.length;
    if (segTotal > rawBytes || segTotal !== pg.layout.usedBytes) throw new PixtiError('INTERNAL', 'Page data does not fit its layout.');
    offsets[imgNo] = pos;
    text(
      `${imgNo} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${rawBytes} >>\nstream\n`,
    );
    pieces.push({ length: rawBytes, segments: pg.segments });
    pos += rawBytes;
    text('\nendstream\nendobj\n');
  });

  const objectCount = FIRST_PAGE_OBJ + 3 * pages.length; // includes object 0
  const xrefPos = pos;
  let x = `xref\n0 ${objectCount}\n0000000000 65535 f \n`;
  for (let n = 1; n < objectCount; n++) x += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  x += `trailer\n<< /Size ${objectCount} /Root ${OBJ_CATALOG} 0 R /Info ${OBJ_INFO} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  text(x);

  if (pos > LIMITS.MAX_DOCUMENT_BYTES) {
    throw new PixtiError('LIMIT_EXCEEDED', 'This document would be too large. Lower the "per file" size in advanced settings.');
  }
  const out = new Uint8Array(pos); // zero-filled: padding is therefore deterministic
  let at = 0;
  for (const p of pieces) {
    if ('bytes' in p) {
      out.set(p.bytes, at);
      at += p.bytes.length;
    } else {
      let o = at;
      for (const s of p.segments) {
        out.set(s, o);
        o += s.length;
      }
      at += p.length;
    }
  }
  return out;
}
