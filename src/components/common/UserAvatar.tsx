'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  name?: string | null;
  avatar?: string | null;
  className?: string;
  fallbackClassName?: string;
}

// First letter of the first two words, e.g. "Rahim Uddin" -> "RU"
export function getInitials(name?: string | null) {
  if (!name?.trim()) return '?';

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/**
 * Shows the member's profile image, falling back to their initials only when
 * they haven't uploaded one (avatar is optional on the User model) or when the
 * image fails to load. Radix handles the swap for us.
 */
export function UserAvatar({ name, avatar, className, fallbackClassName }: UserAvatarProps) {
  return (
    <Avatar className={cn('h-10 w-10', className)}>
      <AvatarImage src={avatar || undefined} alt={name || 'Member'} className="object-cover -scale-z-110 bg-[#e6f2ee]"  />
      <AvatarFallback className={cn('font-semibold', fallbackClassName)}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
