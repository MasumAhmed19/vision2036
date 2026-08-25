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
 * automatically gain the new post/approve/reverse powers just because it's
 * treated as admin-equivalent for viewing. Posting and approving ledger
 * entries requires an explicit promotion to 'co_admin' or 'admin'.
 */
export const CAPABILITIES = {
    'entry.submit.own': ['member', 'moderator', 'co_admin', 'admin'],
    'entry.approve': ['co_admin', 'admin'],
    'entry.post.expense': ['co_admin', 'admin'],
    'entry.post.income': ['co_admin', 'admin'],
    'entry.post.investment': ['co_admin', 'admin'],
    'entry.reverse': ['co_admin', 'admin'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: UserRole, capability: Capability): boolean {
    return (CAPABILITIES[capability] as readonly UserRole[]).includes(role);
}
