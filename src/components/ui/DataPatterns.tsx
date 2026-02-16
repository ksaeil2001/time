import type { KeyboardEvent, ReactNode } from "react";
import { Badge } from "./Badge";
import { Icon, type IconName } from "./Icon";
import { cn } from "./cn";

export interface ResourceListItem {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  onSelect?: () => void;
  selected?: boolean;
  disabled?: boolean;
}

interface ResourceListProps {
  className?: string;
  ariaLabel: string;
  items: ResourceListItem[];
}

export function ResourceList({ className, ariaLabel, items }: ResourceListProps) {
  return (
    <ul className={cn("ui-resource-list", className)} role="list" aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.id}>
          {item.onSelect ? (
            <button
              type="button"
              className={cn("ui-resource-row", item.selected && "is-selected")}
              onClick={item.onSelect}
              disabled={item.disabled}
              aria-current={item.selected || undefined}
            >
              <span className="ui-resource-main">
                <strong className="ui-resource-title">{item.title}</strong>
                {item.subtitle ? <span className="ui-resource-subtitle">{item.subtitle}</span> : null}
              </span>
              {item.meta ? <span className="ui-resource-meta">{item.meta}</span> : null}
            </button>
          ) : (
            <div className={cn("ui-resource-row", item.selected && "is-selected")}>
              <span className="ui-resource-main">
                <strong className="ui-resource-title">{item.title}</strong>
                {item.subtitle ? <span className="ui-resource-subtitle">{item.subtitle}</span> : null}
              </span>
              {item.meta ? <span className="ui-resource-meta">{item.meta}</span> : null}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export interface DataColumn {
  key: string;
  header: ReactNode;
  align?: "start" | "center" | "end";
}

export interface DataRow {
  id: string;
  cells: Record<string, ReactNode>;
  onSelect?: () => void;
  selected?: boolean;
}

interface DataTableProps {
  className?: string;
  ariaLabel: string;
  columns: DataColumn[];
  rows: DataRow[];
}

function handleRowSelect(event: KeyboardEvent<HTMLElement>, onSelect: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect();
  }
}

export function DataTable({ className, ariaLabel, columns, rows }: DataTableProps) {
  return (
    <div className={cn("ui-data-table-wrap", className)}>
      <table className="ui-data-table" aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`is-${column.align ?? "start"}`} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(row.onSelect && "is-clickable", row.selected && "is-selected")}
              onClick={row.onSelect}
              tabIndex={row.onSelect ? 0 : undefined}
              aria-selected={row.selected || undefined}
              onKeyDown={row.onSelect ? (event) => handleRowSelect(event, row.onSelect as () => void) : undefined}
            >
              {columns.map((column) => (
                <td key={`${row.id}-${column.key}`} className={`is-${column.align ?? "start"}`}>
                  {row.cells[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type EventTone = "success" | "warning" | "danger" | "info" | "ok" | "fail";

function normalizeResultTone(tone: EventTone): "success" | "warning" | "danger" | "info" {
  if (tone === "ok") {
    return "success";
  }
  if (tone === "fail") {
    return "danger";
  }
  return tone;
}

export interface EventListItem {
  id: string;
  icon: IconName;
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  resultTone: EventTone;
  resultLabel: ReactNode;
  metaChips?: ReactNode[];
  absoluteTime?: ReactNode;
  relativeTime?: ReactNode;
  chips?: ReactNode[];
  onSelect?: () => void;
  selected?: boolean;
}

interface EventItemProps {
  item: EventListItem;
}

export function EventItem({ item }: EventItemProps) {
  const normalizedTone = normalizeResultTone(item.resultTone);
  const subtitle = item.subtitle ?? item.description;
  const metaChips = item.metaChips ?? [
    item.absoluteTime,
    item.relativeTime,
    ...(item.chips ?? []),
  ].filter(Boolean);

  const content = (
    <>
      <span className={cn("ui-event-result-line", `is-${normalizedTone}`)} aria-hidden="true" />
      <div className="ui-event-left">
        <span className={cn("ui-event-icon-wrap", `is-${normalizedTone}`)} aria-hidden="true">
          <Icon name={item.icon} size={16} />
        </span>
      </div>
      <div className="ui-event-main">
        <div className="ui-event-title-row">
          <strong className="ui-event-title">{item.title}</strong>
          <Badge kind="result" tone={normalizedTone}>
            {item.resultLabel}
          </Badge>
        </div>
        {subtitle ? <p className="ui-event-description">{subtitle}</p> : null}
        {metaChips.length > 0 ? (
          <div className="ui-event-chip-row">
            {metaChips.map((chip, index) => (
              <span key={`${item.id}-meta-${index}`} className="ui-event-chip">
                {chip}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  if (item.onSelect) {
    return (
      <button
        type="button"
        className={cn("ui-event-row", "is-clickable", item.selected && "is-selected")}
        onClick={item.onSelect}
        aria-current={item.selected || undefined}
      >
        {content}
      </button>
    );
  }

  return <div className={cn("ui-event-row", item.selected && "is-selected")}>{content}</div>;
}

interface EventListProps {
  className?: string;
  ariaLabel: string;
  items: EventListItem[];
  emptyState?: ReactNode;
}

export function EventList({ className, ariaLabel, items, emptyState }: EventListProps) {
  if (items.length === 0) {
    return <div className={cn("ui-event-empty", className)}>{emptyState ?? "표시할 이벤트가 없습니다."}</div>;
  }

  return (
    <ul className={cn("ui-event-list", className)} role="list" aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.id}>
          <EventItem item={item} />
        </li>
      ))}
    </ul>
  );
}

export interface HistoryTableItem {
  id: string;
  event: ReactNode;
  reason?: ReactNode;
  resultTone: EventTone;
  resultLabel: ReactNode;
  absoluteTime?: ReactNode;
  onOpenDetail?: () => void;
  selected?: boolean;
  mode?: ReactNode;
  relativeTime?: ReactNode;
}

interface HistoryTableProps {
  className?: string;
  ariaLabel: string;
  rows: HistoryTableItem[];
}

const HISTORY_COLUMNS: DataColumn[] = [
  { key: "event", header: "이벤트", align: "start" },
  { key: "reason", header: "사유", align: "start" },
  { key: "time", header: "시각", align: "start" },
  { key: "result", header: "결과", align: "center" },
];

export function HistoryTable({ className, ariaLabel, rows }: HistoryTableProps) {
  const dataRows: DataRow[] = rows.map((row) => {
    const normalizedTone = normalizeResultTone(row.resultTone);
    const timeCell = (
      <span className="ui-history-time-cell">
        <span className="tabular">{row.absoluteTime ?? row.mode ?? "-"}</span>
        {row.relativeTime ? <span className="ui-history-relative-cell">{row.relativeTime}</span> : null}
      </span>
    );

    return {
      id: row.id,
      onSelect: row.onOpenDetail,
      selected: row.selected,
      cells: {
        event: <span className="ui-history-event-cell">{row.event}</span>,
        reason: <span className="ui-history-reason-cell">{row.reason ?? "-"}</span>,
        time: timeCell,
        result: (
          <Badge kind="result" tone={normalizedTone}>
            {row.resultLabel}
          </Badge>
        ),
      },
    };
  });

  return <DataTable className={className} ariaLabel={ariaLabel} columns={HISTORY_COLUMNS} rows={dataRows} />;
}

export interface TimelineItem {
  id: string;
  title: ReactNode;
  timestamp: ReactNode;
  description?: ReactNode;
  tone?: "default" | "ok" | "warn" | "fail";
}

interface TimelineListProps {
  className?: string;
  ariaLabel: string;
  items: TimelineItem[];
}

export function TimelineList({ className, ariaLabel, items }: TimelineListProps) {
  return (
    <ol className={cn("ui-timeline", className)} aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.id} className={cn("ui-timeline-item", `is-${item.tone ?? "default"}`)}>
          <div className="ui-timeline-head">
            <strong>{item.title}</strong>
            <span className="ui-timeline-time">{item.timestamp}</span>
          </div>
          {item.description ? <p className="ui-timeline-description">{item.description}</p> : null}
        </li>
      ))}
    </ol>
  );
}

