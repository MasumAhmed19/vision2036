'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Phone, Calendar, Shield, Pencil, AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { summariesService } from '@/services/summaries';
import { UserYearlySummary } from '@/types';
import { toast } from 'react-hot-toast';

export default function ProfilePage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [summary, setSummary] = useState<UserYearlySummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  useEffect(() => {
    async function fetchSummary() {
      if (!user) return;
      try {
        const year = new Date().getFullYear();
        const data = await summariesService.getUserSummary(year);
        setSummary(data);
      } catch (error: any) {
        console.error('Failed to load summary:', error);
      } finally {
        setIsLoadingSummary(false);
      }
    }
    fetchSummary();
  }, [user]);

  const isLoading = isAuthLoading || isLoadingSummary;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'default';
      case 'ADMIN':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="space-y-2 text-center sm:text-left">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-muted-foreground">
            Manage your account information
          </p>
        </div>
        <Link href="/profile/edit">
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-2" />
            Edit Profile
          </Button>
        </Link>
      </div>

      {/* Savings Summary Widget */}
      {summary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Savings Progress ({summary.year})
              </span>
              <Badge variant="outline" className="font-normal">
                {summary.total.completionPercentage}% Complete
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Warning if Month 6 rule violated */}
            {(summary.flexible as any).hasWarning && (
              <div className="bg-destructive/10 text-destructive border border-destructive/20 p-3 rounded-lg flex items-start gap-3 text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <p>
                  <strong>Notice:</strong> Your flexible contribution is under the required minimum threshold of Tk. 7,000 for Month 6 or later. Please process a payment to avoid lag penalties.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 p-3 bg-background rounded-lg border">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Verified Monthly</p>
                <p className="text-2xl font-bold flex items-center gap-2">
                  Tk. {summary.monthly.paid.toLocaleString()}
                  {summary.monthly.remaining === 0 && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Remaining: Tk. {summary.monthly.remaining.toLocaleString()}
                </p>
              </div>
              <div className="space-y-1 p-3 bg-background rounded-lg border">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Verified Flexible</p>
                <p className="text-2xl font-bold flex items-center gap-2">
                  Tk. {summary.flexible.paid.toLocaleString()}
                  {summary.flexible.remaining === 0 && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Remaining: Tk. {summary.flexible.remaining.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={user.avatar || undefined} alt={user.name} />
              <AvatarFallback className="text-2xl bg-muted">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="text-center sm:text-left">
              <h2 className="text-2xl font-semibold">{user.name}</h2>
              <p className="text-muted-foreground">{user.email}</p>
              <div className="mt-2">
                <Badge variant={getRoleBadgeVariant(user.role)}>
                  {user.role.replace('_', ' ')}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
            <Phone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Phone Number</p>
              <p className="font-medium">
                {user.phoneNumber || 'Not provided'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Role</p>
              <p className="font-medium">{user.role.replace('_', ' ')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Member Since</p>
              <p className="font-medium">
                {user.joinedAt
                  ? format(new Date(user.joinedAt), 'MMMM d, yyyy')
                  : 'N/A'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <p className="font-medium">Account Status</p>
              <p className="text-sm text-muted-foreground">
                Your account is currently {user.isActive ? 'active' : 'inactive'}
              </p>
            </div>
            <Badge variant={user.isActive ? 'default' : 'destructive'}>
              {user.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Security Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Password</p>
              <p className="text-sm text-muted-foreground">
                Last changed: Unknown
              </p>
            </div>
            <Link href="/profile/edit?tab=security">
              <Button variant="outline" size="sm">
                Change Password
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
