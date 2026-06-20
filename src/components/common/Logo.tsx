interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

const textSizeClasses = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
};

export function Logo({ className = '', showText = true, size = 'lg' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Logo Icon - Minimalistic geometric design */}
      <div className={`relative ${sizeClasses[size]}`}>
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Outer ring */}
          <circle
            cx="20"
            cy="20"
            r="18"
            stroke="currentColor"
            strokeWidth="3"
            className="text-foreground"
          />
          {/* Inner V shape representing Vision */}
          <path
            d="M12 14L20 28L28 14"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-foreground"
          />
          {/* Accent dot */}
          <circle
            cx="20"
            cy="10"
            r="2"
            fill="currentColor"
            className="text-foreground"
          />
        </svg>
      </div>
      
      {showText && (
        <span className={`font-semibold tracking-tight ${textSizeClasses[size]}`}>
          Vision<span className="text-muted-foreground">2036</span>
        </span>
      )}
    </div>
  );
}
