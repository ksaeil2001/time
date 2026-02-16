import type { HTMLAttributes } from "react";
import { cn } from "./cn";

interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "full";
}

export function Skeleton({
  className,
  width,
  height = 14,
  rounded = "md",
  style,
  ...props
}: SkeletonProps) {
  return (
    <span
      className={cn("ui-skeleton", `ui-skeleton-${rounded}`, className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}

