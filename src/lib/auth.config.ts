import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  providers: [],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.avatar = user.avatar;
        token.phoneNumber = user.phoneNumber;
        token.isActive = user.isActive;
      }

      if (trigger === 'update' && session) {
        token.name = (session.name as string) ?? token.name;
        token.avatar = (session.avatar as string | null) ?? token.avatar;
        token.phoneNumber = (session.phoneNumber as string | null) ?? token.phoneNumber;
        token.role = (session.role as string) ?? token.role;
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.avatar = token.avatar as string | null;
        session.user.phoneNumber = token.phoneNumber as string | null;
        session.user.isActive = token.isActive as boolean;
      }

      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
};
