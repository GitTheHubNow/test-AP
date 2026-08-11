/**
 * lib/file-validation.ts
 *
 * Magic-byte (file signature) verification for uploaded files.
 *
 * WHY THIS EXISTS: the `file.type` a browser sends on a multipart upload
 * is just the client-supplied Content-Type header — it is not verified
 * against the actual file content in any way. A malicious actor can
 * rename an HTML/JS payload to "photo.jpg" and set Content-Type:
 * image/jpeg, and a server that trusts file.type alone will accept it.
 *
 * This matters more than usual here because uploaded files are written
 * directly into public/uploads/** and served as static files by Next.js —
 * i.e. whatever lands there is directly, publicly reachable by URL. A
 * mislabeled HTML/SVG-with-script payload served from your own origin
 * is a stored XSS vector against anyone who opens that link.
 *
 * This does real signature (magic byte) checking for images, video, and
 * PDF — the formats where a wrong file.type is most dangerous (all of
 * them can otherwise be spoofed to look like a harmless static asset).
 *
 * DOCX/DOC LIMITATION: .docx (and modern Office formats generally) are
 * ZIP containers, and legacy .doc is an OLE2/CFB container. Magic bytes
 * can confirm "this is a valid ZIP" or "this is a valid OLE2 file", which
 * at minimum rules out someone uploading raw HTML/JS/PHP with a .docx
 * extension — but cannot by itself distinguish a genuine Word document
 * from a different ZIP-based format (e.g. .xlsx, .pptx, or an arbitrary
 * zip) without opening the archive and inspecting its internal structure
 * (e.g. checking for word/document.xml). That deeper check is out of
 * scope here; the container-level check is still a meaningful narrowing
 * versus trusting file.type alone.
 *
 * No external dependency — hand-rolled for the fixed, known set of types
 * this app actually accepts (see ALLOWED in the collect route), rather
 * than pulling in a package (e.g. file-type@22, which is ESM-only and
 * could need extra build config depending on this project's module
 * settings) for a small, stable list.
 */

export type DetectedFileKind =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/x-msvideo'
  | 'video/webm'
  | 'application/pdf'
  | 'application/zip-container'   // .docx and other modern Office formats
  | 'application/ole2-container'  // legacy .doc and other CFB-based formats
  | null; // signature not recognised

/**
 * Inspect the first bytes of a buffer and return a best-guess kind based
 * on known file signatures. Returns null if nothing matches.
 */
export function detectFileKind(buffer: Buffer): DetectedFileKind {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // RIFF-based containers: WebP, AVI. Bytes 0-3 'RIFF', bytes 8-11 identify the type.
  if (buffer.toString('ascii', 0, 4) === 'RIFF') {
    const riffType = buffer.toString('ascii', 8, 12);
    if (riffType === 'WEBP') return 'image/webp';
    if (riffType.startsWith('AVI')) return 'video/x-msvideo';
    return null; // some other RIFF-based format we don't accept
  }

  // ISOBMFF-based containers: HEIC/HEIF, MP4, MOV. Bytes 4-7 are 'ftyp',
  // followed by a 4-byte brand at offset 8.
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    const heicBrands = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
    if (heicBrands.includes(brand)) return 'image/heic';
    if (brand === 'qt  ') return 'video/quicktime';
    // Broad set of MP4-family brands. isom/iso2/mp41/mp42 are the common
    // ones; M4V and 3gp variants also use this container.
    if (/^(isom|iso2|mp41|mp42|M4V |M4A |3gp[4-9]|avc1)$/.test(brand)) return 'video/mp4';
    return null; // unrecognised ISOBMFF brand
  }

  // WebM / Matroska (EBML header): 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'video/webm';
  }

  // PDF: 25 50 44 46 2D ("%PDF-")
  if (buffer.toString('ascii', 0, 5) === '%PDF-') {
    return 'application/pdf';
  }

  // ZIP-based (docx, xlsx, pptx, or a generic zip): 50 4B 03 04
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'application/zip-container';
  }

  // OLE2/CFB (legacy .doc, .xls): D0 CF 11 E0 A1 B1 1A E1
  if (
    buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1
  ) {
    return 'application/ole2-container';
  }

  return null;
}

/**
 * Check whether a detected file kind is an acceptable match for a
 * declared MIME type. Handles the container-format cases (docx/doc)
 * where the detected kind is necessarily broader than the specific
 * declared type — see the module-level comment on the docx limitation.
 */
export function fileKindMatchesDeclaredType(detected: DetectedFileKind, declaredMimeType: string): boolean {
  if (!detected) return false;

  if (detected === declaredMimeType) return true;

  // 'image/jpg' is a common non-standard alias some clients send for JPEG.
  if (detected === 'image/jpeg' && declaredMimeType === 'image/jpg') return true;

  // HEIC and HEIF share the same ISOBMFF signature family — detectFileKind
  // only ever reports 'image/heic' regardless of which of the two brands
  // it saw, so a genuine .heif file declaring image/heif must be accepted
  // here too, or every real HEIF upload gets wrongly rejected.
  if (detected === 'image/heic' && declaredMimeType === 'image/heif') return true;

  // .docx and other modern Office formats are ZIP containers — see
  // module-level comment on why this can't be narrowed further here.
  if (
    detected === 'application/zip-container' &&
    declaredMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return true;
  }

  // Legacy .doc is an OLE2/CFB container.
  if (detected === 'application/ole2-container' && declaredMimeType === 'application/msword') {
    return true;
  }

  return false;
}

/**
 * Convenience wrapper: verify a buffer's actual content matches its
 * declared MIME type. Returns a discriminated result so callers can
 * produce a clear error message without duplicating the detection logic.
 */
export function verifyFileContent(
  buffer: Buffer,
  declaredMimeType: string,
): { valid: true } | { valid: false; reason: string } {
  const detected = detectFileKind(buffer);

  if (!detected) {
    return {
      valid: false,
      reason: 'File content does not match a recognised file format',
    };
  }

  if (!fileKindMatchesDeclaredType(detected, declaredMimeType)) {
    return {
      valid: false,
      reason: `File content does not match declared type (declared ${declaredMimeType}, detected ${detected})`,
    };
  }

  return { valid: true };
}
