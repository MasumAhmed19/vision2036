export const MAX_IMAGE_UPLOAD_SIZE = 5 * 1024 * 1024;

export const sanitizeSegment = (value: string) => value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export type ImageValidationResult =
    | { ok: true; file: File }
    | { ok: false; message: string };

/**
 * `formData.get('file') as File | null` is only a compile-time assertion —
 * a malformed or probing request can put a plain string in that field, and
 * accessing `.type`/`.size` on it throws at runtime instead of failing this
 * validation cleanly. Checking `instanceof File` first turns that into an
 * ordinary 400 everywhere this is used.
 */
export function validateImageUpload(file: unknown): ImageValidationResult {
    if (!(file instanceof File)) {
        return { ok: false, message: 'A file is required' };
    }
    if (!file.type.startsWith('image/')) {
        return { ok: false, message: 'File must be an image' };
    }
    if (file.size > MAX_IMAGE_UPLOAD_SIZE) {
        return { ok: false, message: 'File must be smaller than 5MB' };
    }
    return { ok: true, file };
}
