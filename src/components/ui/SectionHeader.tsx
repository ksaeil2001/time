import type { ReactNode } from "react";
import { cn } from "./cn";

interface SectionHeaderProps {
  className?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
}

export function SectionHeader({
  className,
  title,
  description,
  actions,
  id,
}: SectionHeaderProps) {
  return (
    <header className={cn("ui-section-header-v2", className)}>
      <div className="ui-section-copy-v2">
        <h2 id={id} className="ui-section-title-v2">
          {title}
        </h2>
        {description ? <p className="ui-section-description-v2">{description}</p> : null}
      </div>
      {actions ? <div className="ui-section-actions-v2">{actions}</div> : null}
    </header>
  );
}

