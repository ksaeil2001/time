import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "./cn";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  label: string;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    size = "md",
    className,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("ui-icon-button", `ui-icon-button-${size}`, className)}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} size={size === "sm" ? 14 : 16} aria-hidden={true} />
    </button>
  );
});
