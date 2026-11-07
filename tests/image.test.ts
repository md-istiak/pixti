import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/core/limits.ts';
import { containerToPixels, computeLayout } from '../src/core/image/pixelEncoder.ts';
import { pixelsToContainer } from '../src/core/image/pixelDecoder.ts';
import { buildPdf } from '../src/core/image/pdfWriter.ts';
import { readPixtiPdf } from '../src/core/image/pdfReader.ts';
import { makeThumbnail } from '../src/core/image/thumbnail.ts';
import { bytesEqual, isAllZero } from '../src/core/bytes.ts';
import { findAscii, randomData } from './helpers.ts';

describe('pixel layout (3 bytes/pixel, row-major)', () => {
  it('covers every byte, with canonical padding, for sizes 1..3000', () => {
    for (let n = 1; n <= 3000; n++) {
      const l = computeLayout(n);
      expect(l.rawBytes).toBeGreaterThanOrEqual(n);
      expect(l.rawBytes - n).toBeLessThan(3 * l.width);
      expect(l.rawBytes).toBe(l.width * l.height * 3);
      expect(l.width).toBeGreaterThanOrEqual(l.height);
    }
  });

  it('stays near-square and bounded for large sizes', () => {
    for (const n of [1_000_003, 8 * 1024 * 1024, LIMITS.MAX_PART_BYTES + 120]) {
      const l = computeLayout(n);
      expect(l.width - l.height).toBeLessThanOrEqual(1);
      expect(l.width).toBeLessThanOrEqual(LIMITS.MAX_IMAGE_DIMENSION);
    }
  });

  it('rejects sizes that would exceed the image dimension limit', () => {
    expect(() => computeLayout(3 * LIMITS.MAX_IMAGE_DIMENSION ** 2 + 10)).toThrow(/too large/);
    expect(() => computeLayout(0)).toThrow();
  });

  it('maps bytes to pixels and back exactly, padding with zeros', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, 1001, 65536]) {
      const data = randomData(n);
      const { layout, pixels } = containerToPixels(data);
      const back = pixelsToContainer(pixels, layout.width, layout.height);
      expect(bytesEqual(back.subarray(0, n), data)).toBe(true);
      expect(isAllZero(back, n)).toBe(true);
    }
  });

  it('rejects pixel buffers whose size does not match the dimensions', () => {
    expect(() => pixelsToContainer(new Uint8Array(10), 2, 2)).toThrow();
    expect(() => pixelsToContainer(new Uint8Array(0), 0, 0)).toThrow();
  });
});

function samplePdf(pageSizes: number[]) {
  const datas = pageSizes.map((n) => randomData(n));
  const pdf = buildPdf(
    datas.map((d, i) => {
      const layout = computeLayout(d.length);
      return { layout, segments: [d.subarray(0, 5), d.subarray(5)], label: `Part ${i + 1} of ${datas.length}` };
    }),
  );
  return { pdf, datas };
}

describe('PDF container', () => {
  it('starts like a PDF, marks itself binary, and ends with %%EOF', () => {
    const { pdf } = samplePdf([1000]);
    expect(new TextDecoder().decode(pdf.subarray(0, 8))).toBe('%PDF-1.4');
    expect(pdf[10]).toBeGreaterThan(127);
    expect(new TextDecoder().decode(pdf.subarray(pdf.length - 6))).toBe('%%EOF\n');
  });

  it('round-trips every page byte-for-byte (1, 2 and 7 pages, odd sizes)', () => {
    for (const sizes of [[1000], [1, 4097], [10, 11, 12, 99999, 3, 300, 7]]) {
      const { pdf, datas } = samplePdf(sizes);
      const images = readPixtiPdf(pdf);
      expect(images.length).toBe(sizes.length);
      images.forEach((img, i) => {
        expect(bytesEqual(img.pixels.subarray(0, datas[i].length), datas[i])).toBe(true);
        expect(isAllZero(img.pixels, datas[i].length)).toBe(true);
        expect(img.pixels.length).toBe(img.width * img.height * 3);
      });
    }
  });

  it('stores pixels without any image filter (nothing lossy, nothing to decode)', () => {
    const { pdf } = samplePdf([500]);
    expect(findAscii(pdf, '/Filter')).toBe(-1);
    expect(findAscii(pdf, '/DeviceRGB')).toBeGreaterThan(0);
  });

  it('keeps document metadata generic', () => {
    const { pdf } = samplePdf([500]);
    expect(findAscii(pdf, '/Title (pixti encoded document)')).toBeGreaterThan(0);
  });

  it('refuses page data that does not fit its layout', () => {
    expect(() => buildPdf([{ layout: computeLayout(100), segments: [new Uint8Array(99)], label: 'x' }])).toThrow();
  });

  describe('reader rejects bad input safely', () => {
    it('non-PDF data', () => {
      expect(() => readPixtiPdf(new Uint8Array(500))).toThrow(/not a PDF/);
      expect(() => readPixtiPdf(new TextEncoder().encode('hello'))).toThrow();
    });
    it('truncated file (no trailer)', () => {
      const { pdf } = samplePdf([5000]);
      expect(() => readPixtiPdf(pdf.subarray(0, pdf.length - 200))).toThrow();
    });
    it('damaged startxref offset', () => {
      const { pdf } = samplePdf([5000]);
      const i = findAscii(pdf, 'startxref') + 10;
      pdf[i] = 0x39; // '9' -> wildly different offset
      expect(() => readPixtiPdf(pdf)).toThrow();
    });
    it('other encodings of the image (e.g. a re-saved PDF)', () => {
      const { pdf } = samplePdf([5000]);
      const i = findAscii(pdf, '/BitsPerComponent 8');
      pdf[i + '/BitsPerComponent '.length] = 0x37; // 8 -> 7
      expect(() => readPixtiPdf(pdf)).toThrow(/image encoding/);
    });
    it('declared dimensions that disagree with /Length', () => {
      const { pdf } = samplePdf([5000]);
      const i = findAscii(pdf, '/Width ') + '/Width '.length;
      pdf[i] = 0x39; // first digit of width -> 9
      expect(() => readPixtiPdf(pdf)).toThrow();
    });
    it('a PDF with no pixti images', () => {
      const tiny = new TextEncoder().encode(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 >>\nstartxref\n38\n%%EOF\n',
      );
      expect(() => readPixtiPdf(tiny)).toThrow();
    });
  });
});

describe('thumbnails', () => {
  it('downsamples to the requested bound and is fully opaque', () => {
    const px = randomData(400 * 300 * 3);
    const t = makeThumbnail(px, 400, 300, 100);
    expect(t.width).toBe(100);
    expect(t.height).toBe(75);
    expect(t.rgba.length).toBe(100 * 75 * 4);
    for (let i = 3; i < t.rgba.length; i += 4) expect(t.rgba[i]).toBe(255);
  });
  it('never upsizes', () => {
    const t = makeThumbnail(randomData(4 * 3 * 3), 4, 3, 100);
    expect([t.width, t.height]).toEqual([4, 3]);
  });
});
