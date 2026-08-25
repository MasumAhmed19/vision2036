import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import type { UserRole } from '@/models/User';
import { can, type Capability } from '@/lib/permissions';

export interface AuthedMember {
    id: string;
    name: string;
    email: string;
    role: UserRole;
}

type RouteHandler<Ctx> = (args: {
    member: AuthedMember;
    request: NextRequest;
    context: Ctx;
}) => Promise<Response>;

/**
 * Wraps a route handler with session + capability checks — used only by the
 * new /api/entries family. Not retrofitted onto the ~25 pre-existing routes,
 * which already have their own hardened inline checks from Phase 0; this
 * avoids re-touching and re-risking that code.
 */
export function withAuth<Ctx = unknown>(
    options: { capability?: Capability },
    handler: RouteHandler<Ctx>
) {
    return async (request: NextRequest, context: Ctx): Promise<Response> => {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const member: AuthedMember = {
            id: session.user.id,
            name: session.user.name || 'Unknown',
            email: session.user.email || '',
            role: session.user.role as UserRole,
        };

        if (options.capability && !can(member.role, options.capability)) {
            return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
        }

        return handler({ member, request, context });
    };
}
