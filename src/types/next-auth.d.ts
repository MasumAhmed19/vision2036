import NextAuth from 'next-auth';
import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
    // Extend the Session user
    interface Session {
        user: {
            id: string;
            role: string;
            avatar: string | null;
            phoneNumber: string | null;
            isActive: boolean;
        } & DefaultSession['user'];
    }

    // Extend the User returned from authorize
    interface User {
        id: string;
        role: string;
        avatar: string | null;
        phoneNumber: string | null;
        isActive: boolean;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id: string;
        role: string;
        avatar: string | null;
        phoneNumber: string | null;
        isActive: boolean;
    }
}
