import type { HTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "./cn";

interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: IconName;
  heading?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}

export function EmptyState({
  className,
  icon = "clock",
  heading,
  title,
  description,
  action,
  primaryAction,
  secondaryAction,
  ...props
}: EmptyStateProps) {
  const resolvedTitle = title ?? heading;
  const resolvedPrimaryAction = primaryAction ?? action;

  return (
    <div className={cn("ui-empty-state", className)} role="status" aria-live="polite" {...props}>
      <Icon name={icon} size={20} className="ui-empty-icon" />
      {resolvedTitle ? <h3 className="ui-empty-title">{resolvedTitle}</h3> : null}
      {description ? <p className="ui-empty-description">{description}</p> : null}
      {resolvedPrimaryAction || secondaryAction ? (
        <div className="ui-empty-action-row">
          {resolvedPrimaryAction ? <div className="ui-empty-action">{resolvedPrimaryAction}</div> : null}
          {secondaryAction ? <div className="ui-empty-action">{secondaryAction}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
