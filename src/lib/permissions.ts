import type { UserRole } from '@/models/User';

/**
 * One capability map, one place roles are interpreted for the ledger/entries
 * system — see newDesign.md §6.5. Deliberately does NOT retrofit onto the
 * ~25 existing routes (which have their own already-hardened inline role
 * checks) — this governs only the new /api/entries family.
 *
 * 'moderator' intentionally has none of the entry.* capabilities below: it
 * keeps exactly the access it had before this phase (view dashboards,
 * verify transfers/costs via the existing routes), and does not
 * automatically gain the new post/reverse powers just because it's treated
 * as admin-equivalent for viewing. Posting ledger entries requires an
 * explicit promotion to 'co_admin' or 'admin'.
 *
 * No two-person approval anywhere in this map — every entry posts
 * immediately on a single action (see entries/route.ts). 'entry.post.investment'
 * is admin-only (invest capital / investment principal back move the
 * largest, least-reversible sums the fund handles); every other entry type
 * can be posted by co_admin or admin alike.
 */
export const CAPABILITIES = {
    'entry.submit.own': ['member', 'moderator', 'co_admin', 'admin'],
    'entry.post.expense': ['co_admin', 'admin'],
    'entry.post.income': ['co_admin', 'admin'],
    'entry.post.investment': ['admin'],
    'entry.reverse': ['co_admin', 'admin'],
    'investment.propose': ['member', 'moderator', 'co_admin', 'admin'],
    'investment.value': ['co_admin', 'admin'],
    'period.close': ['co_admin', 'admin'],
    'period.reopen': ['admin'],
    'notification.send': ['co_admin', 'admin'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: UserRole, capability: Capability): boolean {
    return (CAPABILITIES[capability] as readonly UserRole[]).includes(role);
}
