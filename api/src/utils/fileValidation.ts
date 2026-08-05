import path from 'node:path';
import { config } from '../config';

/**
 * Returns true if an uploaded file is allowed.
 *
 * Matches EITHER the reported MIME type against the allow-list OR the file
 * extension. The extension fallback exists because browsers on some operating
 * systems report an empty or generic MIME type (e.g. `application/octet-stream`)
 * for container formats such as `.mkv`, which would otherwise be wrongly rejected.
 */
export function isAllowedUpload(mimetype: string, originalName: string): boolean {
  if (mimetype && config.upload.allowedTypes.includes(mimetype)) {
    return true;
  }

  const ext = path.extname(originalName || '').toLowerCase();
  return ext !== '' && config.upload.allowedExtensions.includes(ext);
}
