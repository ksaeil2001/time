import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

interface DetailDrawerProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function DetailDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  className,
}: DetailDrawerProps) {
  return (
    <>
      <div
        className={cn("ui-detail-drawer-backdrop", open && "is-open")}
        aria-hidden={!open}
        onClick={onClose}
      />
      <aside
        className={cn("ui-detail-drawer", open && "is-open", className)}
        role="dialog"
        aria-modal={open || undefined}
        aria-labelledby="detail-drawer-title"
        aria-hidden={!open}
        aria-label="상세 정보 패널"
      >
        <header className="ui-detail-drawer-header">
          <div className="ui-detail-drawer-copy">
            <h3 id="detail-drawer-title" className="ui-detail-drawer-title">{title}</h3>
            {subtitle ? <p className="ui-detail-drawer-subtitle">{subtitle}</p> : null}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            닫기
          </Button>
        </header>
        <div className="ui-detail-drawer-body">{children}</div>
      </aside>
    </>
  );
}
