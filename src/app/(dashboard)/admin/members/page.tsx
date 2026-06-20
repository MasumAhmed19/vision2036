'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Users,
  Search,
  Filter,
  MoreVertical,
  Mail,
  Phone,
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Eye,
  ChevronLeft,
  ChevronRight,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/common/EmptyState';
import { CardLoader, ButtonLoader, ProtectedRoute } from '@/components/common/LoadingStates';
import { cn } from '@/lib/utils';
import { usersService } from '@/services';
import { useAuth } from '@/contexts/AuthContext';
import type { User, UserRole } from '@/types';

const ROLE_CONFIG: Record<UserRole, { label: string; icon: React.ElementType; className: string }> = {
  member: {
    label: 'Member',
    icon: Shield,
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-500',
  },
  moderator: {
    label: 'Moderator',
    icon: ShieldCheck,
    className: 'bg-purple-500/10 text-purple-600 dark:text-purple-500',
  },
  admin: {
    label: 'Admin',
    icon: ShieldAlert,
    className: 'bg-red-500/10 text-red-600 dark:text-red-500',
  },
};

const ITEMS_PER_PAGE = 12;

export default function MembersPage() {
  return (
    <ProtectedRoute allowedRoles={['moderator', 'admin']}>
      <MembersContent />
    </ProtectedRoute>
  );
}

function MembersContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionType, setActionType] = useState<'status' | 'role' | 'reset-password' | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('member');
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const isSuperAdmin = currentUser?.role === 'admin';

  // Build query params
  const queryParams = new URLSearchParams();
  queryParams.append('page', page.toString());
  queryParams.append('limit', ITEMS_PER_PAGE.toString());
  if (roleFilter !== 'all') queryParams.append('role', roleFilter);
  if (statusFilter !== 'all') queryParams.append('isActive', statusFilter === 'active' ? 'true' : 'false');
  if (searchQuery) queryParams.append('search', searchQuery);

  // Fetch users
  const { data, isLoading, isError } = useQuery({
    queryKey: ['users', { page, roleFilter, statusFilter, searchQuery }],
    queryFn: () => usersService.getAllUsers(queryParams.toString()),
  });

  const users = data?.users || [];
  const pagination = data?.pagination;

  // Update status mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      usersService.updateUserStatus(id, isActive),
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? 'Member activated' : 'Member deactivated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeDialog();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to update status';
      toast.error('Update failed', { description: message });
    },
  });

  // Update role mutation
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      usersService.updateUserRole(id, role),
    onSuccess: () => {
      toast.success('Role updated successfully');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeDialog();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to update role';
      toast.error('Update failed', { description: message });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => usersService.resetUserPassword(id),
    onSuccess: (data) => {
      setTemporaryPassword(data.temporaryPassword);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Password reset successfully');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to reset password';
      toast.error('Reset failed', { description: message });
    },
  });

  const closeDialog = () => {
    setSelectedUser(null);
    setActionType(null);
    setNewRole('member');
    setTemporaryPassword(null);
  };

  const handleToggleStatus = () => {
    if (selectedUser) {
      statusMutation.mutate({ id: selectedUser.id, isActive: !selectedUser.isActive });
    }
  };

  const handleUpdateRole = () => {
    if (selectedUser) {
      roleMutation.mutate({ id: selectedUser.id, role: newRole });
    }
  };

  const handleResetPassword = () => {
    if (selectedUser) {
      resetPasswordMutation.mutate(selectedUser.id);
    }
  };

  const handleClearFilters = () => {
    setRoleFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    setPage(1);
  };

  const hasFilters = roleFilter !== 'all' || statusFilter !== 'all' || searchQuery !== '';
  const isPending = statusMutation.isPending || roleMutation.isPending || resetPasswordMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/admin')}
          className="mb-4 -ml-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Admin Dashboard
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">All Members</h1>
        <p className="text-muted-foreground">
          Manage member accounts and permissions
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-50 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>

        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32.5">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="moderator">Moderator</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32.5">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <CardLoader key={i} />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Failed to load members"
          description="Something went wrong while fetching members."
          action={
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          }
        />
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title={hasFilters ? 'No members found' : 'No members yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters to see more results.'
              : 'No member accounts found in the system.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Members Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {users.map((user) => (
              <MemberCard
                key={user.id}
                user={user}
                currentUser={currentUser}
                isSuperAdmin={isSuperAdmin}
                onView={() => setSelectedUser(user)}
                onToggleStatus={() => {
                  setSelectedUser(user);
                  setActionType('status');
                }}
                onChangeRole={() => {
                  setSelectedUser(user);
                  setNewRole(user.role);
                  setActionType('role');
                }}
                onResetPassword={() => {
                  setSelectedUser(user);
                  setActionType('reset-password');
                }}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* View User Dialog */}
      <Dialog open={!!selectedUser && !actionType} onOpenChange={closeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Member Details</DialogTitle>
          </DialogHeader>
          {selectedUser && <UserDetails user={selectedUser} />}
        </DialogContent>
      </Dialog>

      {/* Toggle Status Dialog */}
      <Dialog open={actionType === 'status'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedUser?.isActive ? 'Deactivate' : 'Activate'} Member
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.isActive
                ? 'Deactivating this member will prevent them from logging in and submitting payments.'
                : 'Activating this member will restore their access to the system.'}
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="font-medium">{selectedUser.name}</p>
              <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant={selectedUser?.isActive ? 'destructive' : 'default'}
              onClick={handleToggleStatus}
              disabled={isPending}
            >
              {statusMutation.isPending ? (
                <ButtonLoader />
              ) : selectedUser?.isActive ? (
                'Deactivate'
              ) : (
                'Activate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={actionType === 'role'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Member Role</DialogTitle>
            <DialogDescription>
              Select a new role for this member. Role changes take effect immediately.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <>
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="font-medium">{selectedUser.name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">New Role</label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="moderator">Moderator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateRole}
              disabled={isPending || newRole === selectedUser?.role}
            >
              {roleMutation.isPending ? <ButtonLoader /> : 'Update Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionType === 'reset-password'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Member Password</DialogTitle>
            <DialogDescription>
              Generate a new temporary password for this member. Share it securely after reset.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="font-medium">{selectedUser.name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </div>
              {temporaryPassword && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                  <p className="text-sm font-medium">Temporary password</p>
                  <p className="mt-1 font-mono text-sm">{temporaryPassword}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              {temporaryPassword ? 'Close' : 'Cancel'}
            </Button>
            {!temporaryPassword && (
              <Button onClick={handleResetPassword} disabled={isPending}>
                {resetPasswordMutation.isPending ? <ButtonLoader /> : 'Reset Password'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Member Card Component
function MemberCard({
  user,
  currentUser,
  isSuperAdmin,
  onView,
  onToggleStatus,
  onChangeRole,
  onResetPassword,
}: {
  user: User;
  currentUser: User | null;
  isSuperAdmin: boolean;
  onView: () => void;
  onToggleStatus: () => void;
  onChangeRole: () => void;
  onResetPassword: () => void;
}) {
  const roleConfig = ROLE_CONFIG[user.role];
  const RoleIcon = roleConfig.icon;
  const isCurrentUser = user.id === currentUser?.id;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 transition-colors',
        !user.isActive && 'opacity-60'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <span className="text-lg font-semibold text-muted-foreground">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <p className="font-medium">
              {user.name}
              {isCurrentUser && (
                <span className="ml-2 text-xs text-muted-foreground">(You)</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        {!isCurrentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onView}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              {isSuperAdmin && (
                <>
                  <DropdownMenuItem onClick={onChangeRole}>
                    <Shield className="mr-2 h-4 w-4" />
                    Change Role
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onResetPassword}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Reset Password
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onToggleStatus}
                className={user.isActive ? 'text-destructive focus:text-destructive' : ''}
              >
                {user.isActive ? (
                  <>
                    <XCircle className="mr-2 h-4 w-4" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Activate
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            roleConfig.className
          )}
        >
          <RoleIcon className="h-3 w-3" />
          {roleConfig.label}
        </span>
        <span
          className={cn(
            'text-xs font-medium',
            user.isActive ? 'text-green-600 dark:text-green-500' : 'text-muted-foreground'
          )}
        >
          {user.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}

// User Details Component
function UserDetails({ user }: { user: User }) {
  const roleConfig = ROLE_CONFIG[user.role];
  const RoleIcon = roleConfig.icon;

  return (
    <div className="space-y-4">
      {/* Avatar & Name */}
      <div className="flex items-center gap-4">
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <span className="text-2xl font-semibold text-muted-foreground">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div>
          <p className="text-lg font-semibold">{user.name}</p>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              roleConfig.className
            )}
          >
            <RoleIcon className="h-3 w-3" />
            {roleConfig.label}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="grid gap-3 text-sm">
        <div className="flex items-center gap-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span>{user.email}</span>
        </div>
        {user.phoneNumber && (
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{user.phoneNumber}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 border-t">
          <span className="text-muted-foreground">Status</span>
          <span
            className={cn(
              'font-medium',
              user.isActive ? 'text-green-600 dark:text-green-500' : 'text-muted-foreground'
            )}
          >
            {user.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Member Since</span>
          <span className="font-medium">
            {user.joinedAt ? format(new Date(user.joinedAt), 'MMMM yyyy') : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
