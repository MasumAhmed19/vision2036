// 'use client';

// import { useTheme } from 'next-themes';
// import { useEffect, useState } from 'react';
// import { Sun, Moon } from 'lucide-react';

// export function ThemeToggle() {
//   const { setTheme, resolvedTheme } = useTheme();
//   const [mounted, setMounted] = useState(false);

//   useEffect(() => setMounted(true), []);

//   if (!mounted) return <div className="h-8 w-14 rounded-full bg-muted animate-pulse" />;

//   const isDark = resolvedTheme === 'dark';

//   return (
//     <button
//       onClick={() => setTheme(isDark ? 'light' : 'dark')}
//       role="switch"
//       aria-checked={!isDark}
//       aria-label="Toggle theme"
//       className="relative h-8 w-14 rounded-full transition-colors duration-300 "
//       style={{ backgroundColor: isDark ? '#334155' : '#f6f6f6' }}
//     >
//       {/* Icon */}
//       <span className="absolute inset-y-0 flex items-center transition-all duration-300"
//         style={{ left: isDark ? 'auto' : '8px', right: isDark ? '8px' : 'auto' }}>
//         {isDark
//           ? <Moon className="h-4 w-4 0" />
//           : <Sun className="h-4 w-4 " />}
//       </span>

//       {/* Thumb */}
//       <span
//         className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all duration-300"
//         style={{ left: isDark ? '4px' : 'calc(100% - 28px)' }}
//       />
//     </button>
//   );
// }


'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-8 w-14 rounded-full bg-muted animate-pulse" />;

  const isDark = resolvedTheme === 'dark';

  const handleToggle = () => {
    setIsAnimating(true);
    setTheme(isDark ? 'light' : 'dark');
    setTimeout(() => setIsAnimating(false), 400);
  };

  return (
    <button
      onClick={handleToggle}
      role="switch"
      aria-checked={!isDark}
      aria-label="Toggle theme"
      className="relative h-8 w-14 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
      style={{
        backgroundColor: isDark ? '#334155' : '#f6f6f6',
        transition: 'background-color 400ms ease',
        border: isDark ? '1px solid #475569' : '1px solid #e2e2e2',
      }}
    >
      {/* Icon */}
      <span
        className="absolute inset-y-0 flex items-center"
        style={{
          left: isDark ? 'auto' : '8px',
          right: isDark ? '8px' : 'auto',
          transition: 'opacity 200ms ease, transform 300ms ease',
          opacity: isAnimating ? 0 : 1,
          transform: isAnimating ? 'scale(0.5) rotate(30deg)' : 'scale(1) rotate(0deg)',
        }}
      >
        {isDark
          ? <Moon className="h-3.5 w-3.5 text-white" />
          : <Sun className="h-3.5 w-3.5 text-black" />}
      </span>

      {/* Thumb */}
      <span
        className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm flex items-center justify-center"
        style={{
          left: isDark ? '4px' : 'calc(100% - 28px)',
          transition: 'left 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}
      />
    </button>
  );
}