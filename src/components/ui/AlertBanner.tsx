import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type AlertVariant = "info" | "warning" | "danger";

interface AlertBannerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  tone?: "info" | "warn" | "danger";
  actions?: ReactNode;
}

export function AlertBanner({
  variant = "info",
  tone,
  className,
  children,
  actions,
  role,
  "aria-live": ariaLive,
  ...props
}: AlertBannerProps) {
  const resolvedVariant = tone === "warn" ? "warning" : tone ?? variant;
  const computedRole = role ?? (resolvedVariant === "danger" ? "alert" : "status");
  const computedAriaLive = ariaLive ?? (resolvedVariant === "danger" ? "assertive" : "polite");

  return (
    <div
      className={cn("ui-alert-banner", `ui-alert-${resolvedVariant}`, className)}
      role={computedRole}
      aria-live={computedAriaLive}
      {...props}
    >
      <div className="ui-alert-content">{children}</div>
      {actions ? <div className="ui-alert-actions">{actions}</div> : null}
    </div>
  );
}
