import type { SVGProps } from "react";
import { cn } from "./cn";

export type IconName = "clock" | "power" | "bell" | "chevron";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  direction?: "up" | "right" | "down" | "left";
}

const DIRECTION_ROTATE: Record<NonNullable<IconProps["direction"]>, string> = {
  up: "rotate(-90 12 12)",
  right: "rotate(0 12 12)",
  down: "rotate(90 12 12)",
  left: "rotate(180 12 12)",
};

export function Icon({
  name,
  size = 16,
  className,
  direction = "right",
  "aria-hidden": ariaHidden = true,
  ...props
}: IconProps) {
  if (name === "clock") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={ariaHidden}
        className={cn("ui-icon", className)}
        {...props}
      >
        <circle cx="12" cy="12" r="8.25" />
        <path d="M12 7.6v5.1l3.2 1.8" />
      </svg>
    );
  }

  if (name === "power") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={ariaHidden}
        className={cn("ui-icon", className)}
        {...props}
      >
        <path d="M12 3.7v7.1" />
        <path d="M7.2 6.2a7.4 7.4 0 1 0 9.6 0" />
      </svg>
    );
  }

  if (name === "bell") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={ariaHidden}
        className={cn("ui-icon", className)}
        {...props}
      >
        <path d="M6.6 9.8a5.4 5.4 0 0 1 10.8 0v4.1l1.6 2.2H5l1.6-2.2z" />
        <path d="M10 17.1a2 2 0 0 0 4 0" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className={cn("ui-icon", className)}
      {...props}
    >
      <path transform={DIRECTION_ROTATE[direction]} d="M9 6l6 6-6 6" />
    </svg>
  );
}

