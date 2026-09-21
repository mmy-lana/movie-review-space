'use client';

/**
 * Small metadata tag used for genres, rewatch markers and spoiler warnings.
 */

export type BadgeTone =
  | 'neutral'
  | 'outline'
  | 'green'
  | 'orange'
  | 'cyan'
  | 'warning';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
  /** Renders a leading glyph, e.g. the rewatch `↺` or a lock. */
  icon?: React.ReactNode;
  /** Renders the badge as a link-style control. */
  onClick?: () => void;
  /** Highlights the badge as the currently selected filter. */
  selected?: boolean;
  className?: string;
  title?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-transparent bg-surface-hover text-text-secondary',
  outline: 'border-border-subtle bg-transparent text-text-secondary',
  green: 'border-brand-green/35 bg-brand-green/10 text-brand-green',
  orange: 'border-brand-orange/35 bg-brand-orange/10 text-brand-orange',
  cyan: 'border-brand-cyan/35 bg-brand-cyan/10 text-brand-cyan',
  warning: 'border-brand-orange/50 bg-surface-elevated text-brand-orange',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-[1px] text-[9px] tracking-[0.08em]',
  sm: 'px-2 py-0.5 text-[10px] tracking-[0.06em]',
  md: 'px-2.5 py-1 text-[11px] tracking-[0.04em]',
};

/** Minimum tap target for interactive badges, per the mobile hit-area rules. */
const INTERACTIVE_CLASSES: Record<BadgeSize, string> = {
  xs: 'min-h-7',
  sm: 'min-h-8',
  md: 'min-h-9',
};

export function Badge({
  children,
  tone = 'neutral',
  size = 'sm',
  icon,
  onClick,
  selected = false,
  className = '',
  title,
}: BadgeProps) {
  const base =
    'inline-flex items-center gap-1 rounded-full border font-semibold uppercase whitespace-nowrap';

  const toneClass = selected ? TONE_CLASSES.green : TONE_CLASSES[tone];

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        title={title}
        className={`${base} ${SIZE_CLASSES[size]} ${INTERACTIVE_CLASSES[size]} ${toneClass} cursor-pointer transition-colors duration-150 hover:border-brand-green/60 hover:text-text-primary ${className}`}
      >
        {icon}
        {children}
      </button>
    );
  }

  return (
    <span
      title={title}
      className={`${base} ${SIZE_CLASSES[size]} ${toneClass} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

/** Rewatch marker used across diary rows, review cards and film headers. */
export function RewatchBadge({ size = 'xs' }: { size?: BadgeSize }) {
  return (
    <Badge tone="cyan" size={size} title="Rewatch" icon={<span aria-hidden="true">↺</span>}>
      Rewatch
    </Badge>
  );
}

/** Spoiler warning marker shown on review cards before the mask is revealed. */
export function SpoilerBadge({ size = 'xs' }: { size?: BadgeSize }) {
  return (
    <Badge tone="warning" size={size} icon={<span aria-hidden="true">⚠</span>}>
      Spoilers
    </Badge>
  );
}

export default Badge;
