import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={cn("ui-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentPropsWithoutRef<"header">) {
  return <header className={cn("ui-card-header", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentPropsWithoutRef<"h3">) {
  return <h3 className={cn("ui-card-title", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return <p className={cn("ui-card-description", className)} {...props} />;
}

export function CardActions({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("ui-card-actions", className)} {...props} />;
}

interface SectionPanelProps extends ComponentPropsWithoutRef<"section"> {
  heading: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function SectionPanel({
  className,
  heading,
  description,
  action,
  children,
  ...props
}: SectionPanelProps) {
  return (
    <section className={cn("ui-section", className)} {...props}>
      <header className="ui-section-header">
        <div className="ui-section-copy">
          <h2 className="ui-section-title">{heading}</h2>
          {description ? <p className="ui-section-description">{description}</p> : null}
        </div>
        {action ? <div className="ui-section-action">{action}</div> : null}
      </header>
      <div className="ui-section-body">{children}</div>
    </section>
  );
}
