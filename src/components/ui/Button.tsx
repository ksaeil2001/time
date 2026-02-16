import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  immediate?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    immediate = false,
    className,
    disabled,
    children,
    iconLeft,
    iconRight,
    type = "button",
    ...props
  }: ButtonProps,
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "ui-button",
        `ui-button-${variant}`,
        `ui-button-${size}`,
        loading && "is-loading",
        immediate && "safety-action",
        className,
      )}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      {...props}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : iconLeft}
      <span>{children}</span>
      {!loading ? iconRight : null}
    </button>
  );
});
