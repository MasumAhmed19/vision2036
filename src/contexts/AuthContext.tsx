'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';

export type UserRole = 'member' | 'moderator' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  joinedAt?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated' && !!session?.user;

  // Map NextAuth session user to our User shape
  const user: User | null = session?.user
    ? {
      id: session.user.id,
      name: session.user.name || '',
      email: session.user.email || '',
      role: (session.user.role as UserRole) || 'member',
      avatar: session.user.avatar ?? null,
      phoneNumber: session.user.phoneNumber ?? null,
      isActive: session.user.isActive ?? true,
    }
    : null;

  const login = useCallback(async (email: string, password: string) => {
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      // NextAuth v5 beta always returns error='CredentialsSignin'
      // The real message thrown in authorize() is passed as result.code
      const message =
        result.code && result.code !== 'credentials'
          ? result.code
          : 'Invalid email or password';
      toast.error(message);
      throw new Error(message);
    }

    if (result?.ok) {
      toast.success('Welcome back!');
      // Redirect to callbackUrl or dashboard
      const params = new URLSearchParams(window.location.search);
      const callbackUrl = params.get('callbackUrl') || '/';
      router.push(callbackUrl);
    }
  }, [router]);

  const logout = useCallback(async () => {
    await signOut({ redirect: false });
    toast.success('Logged out successfully');
    router.push('/login');
  }, [router]);

  // checkAuth is a no-op — NextAuth handles session refresh automatically
  const checkAuth = useCallback(async () => { }, []);

  // Update session data (e.g., after profile edit)
  const updateUser = useCallback(async (updates: Partial<User>) => {
    await update(updates);
  }, [update]);

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    checkAuth,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
