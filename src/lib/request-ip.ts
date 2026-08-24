/**
 * Best-effort client IP for rate-limit keys. Prefer Vercel's
 * `x-vercel-forwarded-for`, which reflects what Vercel's edge network itself
 * saw. Fall back to `x-forwarded-for`'s *last* hop — the client can prepend
 * arbitrary fake entries at the front of that comma-separated chain, but the
 * last entry is the one added by the nearest trusted proxy, not the client.
 */
export function getClientIp(headers: Headers): string {
    const forwardedFor = headers.get('x-forwarded-for');
    const lastHop = forwardedFor?.split(',').map((part) => part.trim()).filter(Boolean).pop();

    return headers.get('x-vercel-forwarded-for') || lastHop || headers.get('x-real-ip') || 'unknown';
}
