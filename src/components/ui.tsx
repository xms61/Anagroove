import React from 'react';

/** Joins class names, skipping empty ones. */
export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-on-accent shadow-accent hover:brightness-110',
  secondary: 'bg-raised text-fg border border-line hover:brightness-125',
  ghost: 'text-fg hover:bg-raised',
  danger: 'bg-bad/15 text-bad border border-bad/40 hover:bg-bad/25',
} as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  icon?: React.ReactNode;
};

/** A button with visible text and an optional leading icon. */
export function Button({ variant = 'secondary', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-control text-sm font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        FOCUS,
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  /** Required: the button has no visible text. */
  label: string;
  variant?: keyof typeof BUTTON_VARIANTS;
};

export function IconButton({ label, variant = 'ghost', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'relative inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-control transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        FOCUS,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A surface for grouped content: the theme's panel colour, border, radius and glow. */
export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx('bg-glass border border-line rounded-panel shadow-panel', className)} {...rest}>
      {children}
    </section>
  );
}
