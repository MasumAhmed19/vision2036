# Dashboard Design System & Responsiveness Guide

## Overview

This is a modern, responsive dashboard design built with **Next.js 14+**, **Tailwind CSS**, and **shadcn/ui** components. The design follows a mobile-first approach with progressive enhancement for larger screens.

---

## 🎨 Design Tokens & Theming

### Color System

The design uses **CSS custom properties** (CSS variables) with `oklch` color space for better color consistency across themes.

```
Semantic Colors:
├── background / foreground     → Page background and text
├── card / card-foreground      → Card surfaces and text
├── primary / primary-foreground → Primary actions (buttons, links)
├── secondary / secondary-foreground → Secondary elements
├── muted / muted-foreground    → Subtle backgrounds and placeholder text
├── accent / accent-foreground  → Hover states and highlights
├── destructive                 → Error/danger states
├── border / input / ring       → Borders and focus states
└── sidebar-*                   → Dedicated sidebar color tokens
```

### Dark Mode Support

- Implements automatic dark/light theme switching
- Uses `next-themes` ThemeProvider with `class` attribute strategy
- Respects system preference with `enableSystem`
- All colors have corresponding dark mode variants

### Border Radius Scale

```
--radius-sm: calc(var(--radius) - 4px)
--radius-md: calc(var(--radius) - 2px)  
--radius-lg: var(--radius)              // Base: 0.625rem (10px)
--radius-xl: calc(var(--radius) + 4px)
--radius-2xl: calc(var(--radius) + 8px)
```

---

## 📐 Layout Architecture

### Desktop Layout (md: 768px+)

```
┌─────────────────────────────────────────────────────┐
│  Sidebar (64px collapsed / 256px expanded)  │ Main  │
│  ┌─────────────────┐                        │       │
│  │     Logo        │                        │ Header│
│  ├─────────────────┤  ←──────────────────── │ (64px)│
│  │                 │                        ├───────│
│  │   Navigation    │                        │       │
│  │     Items       │                        │       │
│  │                 │                        │Content│
│  │   ─────────     │                        │       │
│  │   Admin Section │                        │       │
│  │                 │                        │       │
│  │   ─────────     │                        │       │
│  │ Super Admin Sec │                        │       │
│  │                 │                        │       │
│  │   ─────────     │                        │       │
│  │  Collapse Btn   │                        │       │
│  └─────────────────┘                        │       │
└─────────────────────────────────────────────────────┘
```

### Mobile Layout (<768px)

```
┌─────────────────────────────┐
│  Logo      │      Profile   │  ← Header (64px)
├─────────────────────────────│
│                             │
│                             │
│         Content             │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│ Menu │ Home │ Pay │ Sum │ P │  ← Bottom Nav (64px)
└─────────────────────────────┘
       + Slide-out Drawer
```

---

## 🧩 Component Specifications

### 1. MainLayout Component

**Purpose:** Root layout wrapper that orchestrates sidebar, header, and content.

**Key Features:**
- Persists sidebar collapsed state in localStorage
- Shows loading state during authentication
- Manages hydration mismatch prevention with `mounted` state

```tsx
Structure:
<div className="min-h-screen bg-background">
  <div className="flex">
    <Sidebar />                           // Desktop only
    <div className="flex-1 flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
        {children}
      </main>
    </div>
  </div>
  <MobileNav />                           // Mobile only
</div>
```

**Responsive Padding:**
- Mobile: `p-4 pb-20` (extra bottom padding for bottom nav)
- Desktop: `p-6`

---

### 2. Sidebar Component

**Purpose:** Desktop navigation with collapsible functionality.

**Dimensions:**
- Expanded: `w-64` (256px)
- Collapsed: `w-16` (64px)

**Key Features:**
- `hidden md:flex` - Only visible on desktop
- `sticky top-0 h-screen` - Fixed position sidebar
- `transition-all duration-300` - Smooth collapse animation
- Tooltips appear when collapsed for accessibility
- Role-based navigation (Member / Admin / Super Admin sections)

**Navigation Item States:**
```
Default:     text-muted-foreground
Hover:       bg-accent text-accent-foreground
Active:      bg-accent text-accent-foreground
```

---

### 3. Header Component

**Purpose:** Top bar with logo (mobile), theme toggle, and user menu.

**Specifications:**
- Height: `h-16` (64px)
- Position: `sticky top-0 z-40`
- Glass morphism: `bg-card/95 backdrop-blur`

**Responsive Behavior:**
- Mobile: Shows logo on left
- Desktop: Logo hidden (shown in sidebar), spacer on left

**User Dropdown Contents:**
- User name and email
- Role badge with color coding
- Profile link
- Settings link  
- Logout action

---

### 4. MobileNav Component

**Purpose:** Bottom navigation bar + slide-out drawer for mobile devices.

**Bottom Bar Specifications:**
- Position: `fixed bottom-0 left-0 right-0 z-50`
- Height: `h-16` (64px)
- Shows only on mobile: `md:hidden`
- Glass morphism background
- Safe area support for notched devices: `safe-area-pb`

**Bottom Nav Items (5 slots):**
```
[ Menu ] [ Home ] [ Payments ] [ Summary ] [ Profile ]
```

**Slide-out Drawer:**
- Uses shadcn Sheet component
- Width: `w-[300px]`
- Contains full navigation tree
- Closes on navigation

---

### 5. Card Components

**Purpose:** Content containers with consistent styling.

**Structure:**
```tsx
<Card>           // bg-card, rounded-xl, border, shadow-sm
  <CardHeader>   // Contains title, description, and optional action
    <CardTitle>
    <CardDescription>
    <CardAction>  // Top-right positioned slot
  </CardHeader>
  <CardContent>  // px-6 padding
  </CardContent>
  <CardFooter>   // Bottom section
  </CardFooter>
</Card>
```

---

### 6. Button Variants

**Available Variants:**
| Variant | Use Case |
|---------|----------|
| `default` | Primary actions |
| `secondary` | Secondary actions |
| `outline` | Tertiary actions |
| `ghost` | Subtle/icon buttons |
| `destructive` | Danger actions |
| `link` | Text links |

**Sizes:**
| Size | Height | Use Case |
|------|--------|----------|
| `xs` | 24px | Compact areas |
| `sm` | 32px | Tight spaces |
| `default` | 36px | Standard buttons |
| `lg` | 40px | Prominent CTAs |
| `icon` | 36×36px | Icon-only buttons |

---

## 📱 Responsive Breakpoints

```css
/* Tailwind Default Breakpoints */
sm:  640px   /* Small tablets */
md:  768px   /* Tablets / Layout switch point */
lg:  1024px  /* Laptops */
xl:  1280px  /* Desktops */
2xl: 1536px  /* Large screens */
```

### Key Responsive Patterns

**1. Layout Switch at `md` (768px)**
```
< 768px:  Bottom nav + Header with logo
≥ 768px:  Sidebar + Header without logo
```

**2. Grid Columns**
```tsx
// Stats cards example
<div className="grid gap-4 grid-cols-2 lg:grid-cols-4">

// Common patterns
grid-cols-1 md:grid-cols-2 lg:grid-cols-3
grid-cols-2 lg:grid-cols-4
```

**3. Spacing Adjustments**
```tsx
p-4 md:p-6           // Padding
gap-4 md:gap-6       // Grid/flex gaps
text-sm md:text-base // Font sizes
```

**4. Visibility Toggles**
```tsx
hidden md:flex       // Desktop only
md:hidden            // Mobile only
hidden lg:block      // Large screens only
```

---

## 🎯 Implementation Instructions

### For New Projects

**1. Install Dependencies:**
```bash
npm install next-themes @radix-ui/react-* lucide-react class-variance-authority clsx tailwind-merge sonner
npx shadcn-ui@latest init
```

**2. Copy Core Files:**
```
├── globals.css           # CSS variables and theme tokens
├── contexts/
│   ├── ThemeProvider.tsx # Dark mode support
│   └── AuthContext.tsx   # Authentication (adapt to your needs)
├── components/
│   ├── layout/           # MainLayout, Sidebar, Header, MobileNav
│   └── ui/               # shadcn components
└── lib/
    └── utils.ts          # cn() helper function
```

**3. Key CSS Classes to Include:**
```css
/* Mobile safe area support */
.safe-area-pb {
  padding-bottom: env(safe-area-inset-bottom, 0);
}

/* Custom scrollbar */
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
```

---

## 🔑 Key Design Principles

### 1. **Mobile-First**
Always start with mobile styles, then add desktop enhancements with `md:` prefix.

### 2. **Semantic Color Tokens**
Never use raw colors. Use semantic tokens like `text-muted-foreground` instead of `text-gray-500`.

### 3. **Consistent Spacing**
Use the 4px grid system: `4, 8, 12, 16, 20, 24...` (Tailwind: `1, 2, 3, 4, 5, 6...`).

### 4. **Glass Morphism for Floating Elements**
```tsx
className="bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60"
```

### 5. **Smooth Transitions**
```tsx
className="transition-all duration-300"
// or
className="transition-colors" // for just color changes
```

### 6. **Focus States**
All interactive elements must have visible focus states using `ring` utilities.

### 7. **Role-Based Navigation**
Navigation items can be filtered based on user roles using conditional rendering.

---

## 📋 Customization Checklist

When adapting this design:

- [ ] Update `globals.css` color tokens to match brand
- [ ] Replace Logo component with your branding
- [ ] Modify navigation items in `Sidebar.tsx` and `MobileNav.tsx`
- [ ] Adjust role-based access logic in navigation components
- [ ] Update metadata in `layout.tsx` (title, description, manifest)
- [ ] Configure theme colors in viewport metadata
- [ ] Add/remove shadcn components as needed
- [ ] Customize toast styles in layout

---

## 📦 File Structure Summary

```
src/
├── app/
│   ├── globals.css          # Theme tokens & global styles
│   ├── layout.tsx           # Root layout with providers
│   └── (dashboard)/
│       ├── layout.tsx       # Dashboard layout with MainLayout
│       └── page.tsx         # Dashboard pages
├── components/
│   ├── layout/
│   │   ├── MainLayout.tsx   # Main wrapper
│   │   ├── Sidebar.tsx      # Desktop sidebar
│   │   ├── Header.tsx       # Top header
│   │   └── MobileNav.tsx    # Mobile bottom nav + drawer
│   ├── ui/                  # shadcn components
│   └── common/              # Shared components
├── contexts/
│   ├── ThemeProvider.tsx    # Dark mode
│   ├── AuthContext.tsx      # Auth state
│   └── QueryProvider.tsx    # React Query
└── lib/
    └── utils.ts             # cn() helper
```

---

## 💡 Quick Reference

| Element | Mobile | Desktop |
|---------|--------|---------|
| Navigation | Bottom bar + drawer | Sidebar (collapsible) |
| Logo | In header | In sidebar |
| Content padding | 16px | 24px |
| Bottom padding | 80px (for nav) | 24px |
| Sidebar width | N/A | 64px / 256px |
| Header height | 64px | 64px |
| Bottom nav height | 64px | N/A |

---

*This design system is built for scalability and maintainability. Follow the patterns consistently for a cohesive user experience across all screen sizes.*
