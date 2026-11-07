# pixti file format — version 1

A pixti **set** is one or more PDF files. Together they carry one *payload*, which is the
(optionally compressed, optionally encrypted) original file plus its metadata. Everything
needed to recover the file is inside the pixel data; document metadata, file names and
page captions are never used.

```
original file ─ SHA-256 ─ compress? ─► inner envelope ─ AES-256-GCM? ─► payload
payload ─ split into parts ─► part = 120-byte header + payload slice ─► page pixels ─► PDF
```

## 1. PDF container

Written by `src/core/image/pdfWriter.ts`, read by `pdfReader.ts`.

* PDF 1.4, classic cross-reference table with exact byte offsets, ends `startxref … %%EOF`.
* One page per **part**. Each page has one image XObject:
  `/Subtype /Image /ColorSpace /DeviceRGB /BitsPerComponent 8`, **no `/Filter`**, so the
  pixel bytes are stored verbatim (nothing lossy, nothing to decode).
* Pixels are row-major, top-left first, 3 bytes (R, G, B) per pixel, opaque.
* Layout is near-square: `pixels = ceil(len/3)`, `width = ceil(sqrt(pixels))`,
  `height = ceil(pixels/width)`. Bytes after the data are **zero padding**.
  A valid page has `rawBytes − used < 3 × width`.
* The reader finds images through the xref table (it never scans binary data for markers),
  requires exact `/Length = width × height × 3`, and rejects any other image encoding.
  A PDF re-saved, optimised or "printed to PDF" by another program therefore fails to decode
  (it is detected, never silently misread).
* Document metadata is generic (`/Producer (pixti)`); page captions show only the part number.

## 2. Part header (120 bytes, big-endian)

Starts at byte 0 of the page's pixel data.

| Offset | Size | Field | Notes |
|---:|---:|---|---|
| 0 | 8 | magic | `50 49 58 54 49 00 00 00` ("PIXTI\0\0\0") |
| 8 | 2 | version | `1`. Checked before anything else |
| 10 | 2 | flags | bit 0 = encrypted. Unknown bits are rejected |
| 12 | 4 | header length | must equal `120` |
| 16 | 16 | session id | random, identical in every part of a set |
| 32 | 4 | part index | 1-based |
| 36 | 4 | part count | 1 … 2048 |
| 40 | 4 | part length | payload bytes in this part, 1 … 32 MiB |
| 44 | 4 | total length | payload bytes in the whole set, ≤ 65 MiB |
| 48 | 1 | KDF id | 0 = none, 1 = PBKDF2-HMAC-SHA-256 |
| 49 | 1 | cipher id | 0 = none, 1 = AES-256-GCM |
| 50 | 2 | reserved | must be 0 |
| 52 | 4 | KDF iterations | 100 000 … 2 000 000 if encrypted, else 0 |
| 56 | 16 | salt | random if encrypted, else zeros |
| 72 | 12 | nonce | random 96-bit if encrypted, else zeros |
| 84 | 32 | part SHA-256 | of this part's payload slice |
| 116 | 4 | header CRC-32 | over bytes 0 … 115 (accidental damage only) |

Followed by `part length` payload bytes, then padding.

Validation (all before any allocation or expensive work): magic → version → header length →
CRC → reserved → field ranges → cross-field consistency (index ≤ count, encrypted flag ⇔
KDF/cipher ids ⇔ non-zero salt/nonce, total ≥ part length and ≥ minimum envelope size, …).
The serializer applies the same checks, so the encoder cannot write what the decoder refuses.

## 3. Payload and parts

The payload is split into `ceil(total / maxPartBytes)` parts whose lengths differ by at most
one byte. Parts may be stored in any order and across any number of PDFs.

A set is decodable only if, for one session id: every index `1..count` has an intact copy
(part SHA-256 matches), all shared header fields agree, and copies of the same index are
identical. Missing, damaged, duplicate and conflicting parts are each reported by index;
identical duplicates are ignored, anything else blocks decoding.

## 4. Inner envelope

The plaintext that is encrypted (or stored directly when encryption is off):

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | inner version (`1`) |
| 1 | 1 | compression: 0 = none, 1 = zlib DEFLATE |
| 2 | 2 | file name length (UTF-8 bytes, ≤ 255) |
| 4 | 2 | MIME length (≤ 127) |
| 6 | 4 | original size (≤ 64 MiB) |
| 10 | 4 | stored data length |
| 14 | 32 | SHA-256 of the **original** file |
| 46 | … | file name, MIME type, stored data |

Consequently, for encrypted sets the file name, type, size and checksum are not visible.
Compression is applied only when the result is strictly smaller. Decompression writes into
a buffer of exactly the declared original size and aborts on any excess or shortfall.

## 5. Encryption (flag bit 0)

* Key: PBKDF2-HMAC-SHA-256, password normalised with NFKC then UTF-8, 16-byte random salt,
  iteration count from the header (default 600 000), 256-bit AES key.
* Cipher: AES-256-GCM, fresh random 96-bit nonce, 128-bit tag appended to the ciphertext
  (`total length = envelope length + 16`). The whole envelope is encrypted once, then split.
* **Additional authenticated data** (50 bytes) binds the shared header fields:
  `version u16 | flags u16 | session id | part count u32 | total length u32 | kdf id u8 |
  cipher id u8 | iterations u32 | salt`. Editing any of them makes authentication fail.
* A wrong password and modified data are deliberately indistinguishable.

## 6. Decode order

PDF → pages → part headers validated → set completeness → merge → *(password)* → AES-GCM
authenticate/decrypt → envelope validated → bounded inflate → size check → SHA-256 compared
with the stored digest → file offered. An authenticated payload is **not** treated as a
verified file: both the GCM tag and the final SHA-256 must pass.

## 7. Compatibility and evolution

* Version 1 is fixed-layout with no optional fields. Anything unknown (version, flag bits,
  KDF/cipher/compression ids, non-zero reserved fields) is rejected with an explicit error.
* Changing any byte layout, limit semantics or id meaning requires a new version number,
  updated tests, and an update to this document.
* New KDFs (e.g. Argon2id) add a new KDF id and register a deriver in
  `src/core/encryption/keyDerivation.ts`; old sets stay readable.
* Opaque RGB is the only pixel mode in v1. An RGBA mode would need a new flag bit.
