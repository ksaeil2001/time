import type { ReactNode } from "react";
import { Badge } from "../ui/Badge";
import { Icon, type IconName } from "../ui/Icon";
import { cn } from "../ui/cn";

export interface AppShellNavItem {
  path: string;
  label: string;
  icon: IconName;
  group?: string;
  isActive: boolean;
  onSelect: () => void;
}

interface AppShellV2Props {
  isOnboarding: boolean;
  brandTitle: string;
  brandSubtitle: string;
  navItems: AppShellNavItem[];
  routeTitle: string;
  statusLabel: string;
  statusTone: "idle" | "armed" | "finalWarning";
  remainingLabel: string;
  triggerLabel: string;
  liveStatusText: string;
  simulationBadgeLabel?: string;
  processBadgeLabel?: string;
  mainContent: ReactNode;
  rightPanel?: ReactNode;
  quickActions?: ReactNode;
}

export function AppShellV2({
  isOnboarding,
  brandTitle,
  brandSubtitle,
  navItems,
  routeTitle,
  statusLabel,
  statusTone,
  remainingLabel,
  triggerLabel,
  liveStatusText,
  simulationBadgeLabel,
  processBadgeLabel,
  mainContent,
  rightPanel,
  quickActions,
}: AppShellV2Props) {
  const groupedNavItems = navItems.reduce<Record<string, AppShellNavItem[]>>((acc, item) => {
    const key = item.group ?? "기타";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});

  if (isOnboarding) {
    return (
      <main className="app-shell-v2 app-shell-v2-onboarding">
        <section className="app-main-v2 app-main-v2-onboarding">
          <div className="main-stage-v2">{mainContent}</div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell-v2">
      <aside className="sidebar-nav-v2" aria-label="주요 메뉴">
        <div className="brand-block-v2">
          <h1>{brandTitle}</h1>
          <p>{brandSubtitle}</p>
        </div>

        <nav className="sidebar-nav-list" aria-label="페이지 내비게이션">
          {Object.entries(groupedNavItems).map(([group, items]) => (
            <section key={group} className="sidebar-nav-group">
              <h2 className="sidebar-nav-group-title">{group}</h2>
              <div className="sidebar-nav-group-items">
                {items.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    className={cn("nav-item-v2", item.isActive && "is-active")}
                    aria-current={item.isActive ? "page" : undefined}
                    onClick={item.onSelect}
                    title={item.label}
                  >
                    <span className="nav-item-accent" aria-hidden="true" />
                    <span className="nav-item-left">
                      <Icon name={item.icon} size={16} />
                      <span className="nav-item-label">{item.label}</span>
                    </span>
                    <Icon name="chevron" size={14} className="nav-item-chevron" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <p className="sidebar-foot-v2">단축키: Ctrl/Cmd + N</p>
      </aside>

      <section className="app-main-v2">
        <header className="top-status-bar-v2" aria-label="현재 집중 상태">
          <div className="top-status-main-v2">
            <p className="eyebrow">{routeTitle}</p>
            <div className="top-status-title-row">
              <Badge kind="status" tone={statusTone}>
                {statusLabel}
              </Badge>
              <span className="top-status-inline-metric">
                <Icon name="clock" size={14} />
                <strong className="tabular">{remainingLabel}</strong>
              </span>
              <span className="top-status-inline-metric">
                <Icon name="power" size={14} />
                <strong className="tabular">{triggerLabel}</strong>
              </span>
              {simulationBadgeLabel ? <Badge kind="tag" tone="warning">{simulationBadgeLabel}</Badge> : null}
              {processBadgeLabel ? <Badge kind="tag">{processBadgeLabel}</Badge> : null}
            </div>
            <p className="muted top-status-live-v2" role="status" aria-live="polite">
              {liveStatusText}
            </p>
          </div>
        </header>

        <div className="main-stage-v2">
          <section className="main-canvas-v2">{mainContent}</section>
          <aside className="right-panel-v2" aria-label="우측 요약 패널">
            {rightPanel}
          </aside>
        </div>

        {quickActions ? <footer className="quick-action-footer-v2">{quickActions}</footer> : null}
      </section>
    </main>
  );
}
