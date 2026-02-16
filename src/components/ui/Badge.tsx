import type { HTMLAttributes } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

type StatusTone = "idle" | "armed" | "finalWarning";
type TagTone = "neutral" | "info" | "warning";
type ResultTone = "success" | "warning" | "danger" | "info" | "ok" | "fail";

interface BaseBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  pill?: boolean;
}

type BadgeProps =
  | (BaseBadgeProps & { kind: "status"; tone: StatusTone })
  | (BaseBadgeProps & { kind: "tag"; tone?: TagTone })
  | (BaseBadgeProps & { kind: "result"; tone: ResultTone });

export function Badge(props: BadgeProps) {
  const { kind, pill = true, className, children, ...rest } = props;
  const normalizedResultTone =
    kind === "result"
      ? props.tone === "ok"
        ? "success"
        : props.tone === "fail"
          ? "danger"
          : props.tone
      : undefined;

  const toneClass =
    kind === "status"
      ? `ui-badge-${props.tone}`
      : kind === "result"
        ? `ui-badge-${normalizedResultTone}`
        : `ui-badge-${props.tone ?? "neutral"}`;

  const iconName =
    kind === "status"
      ? props.tone === "finalWarning"
        ? "bell"
        : props.tone === "armed"
          ? "power"
          : "clock"
      : kind === "result"
        ? normalizedResultTone === "danger"
          ? "bell"
          : normalizedResultTone === "warning"
            ? "bell"
            : normalizedResultTone === "success"
              ? "power"
              : "clock"
        : props.tone === "warning"
          ? "bell"
          : null;

  return (
    <span className={cn("ui-badge", `ui-badge-${kind}`, toneClass, pill && "ui-badge-pill", className)} {...rest}>
      {iconName ? <Icon name={iconName} size={12} className="ui-badge-icon" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
