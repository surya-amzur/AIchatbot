import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-[var(--color-primary-600)] text-white border border-[var(--color-primary-700)] hover:bg-[var(--color-primary-700)]",
  secondary: "bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-soft)]",
  ghost: "bg-transparent text-[var(--color-text-secondary)] border border-transparent hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-text-primary)]",
  danger: "bg-[var(--color-danger-600)] text-white border border-[var(--color-danger-700)] hover:bg-[var(--color-danger-700)]",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-4 text-sm",
};

function Button({
  variant = "secondary",
  size = "md",
  className = "",
  leftIcon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-400)] disabled:cursor-not-allowed disabled:opacity-50 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    >
      {leftIcon}
      {children}
    </button>
  );
}

export default Button;
