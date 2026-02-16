import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ComponentPropsWithoutRef,
  ReactElement,
  ReactNode,
  InputHTMLAttributes,
} from "react";
import { cloneElement, isValidElement } from "react";
import { cn } from "./cn";

export function Input({ className, ...props }: ComponentPropsWithoutRef<"input">) {
  return <input className={cn("ui-input", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentPropsWithoutRef<"select">) {
  return <select className={cn("ui-select", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cn("ui-textarea", className)} {...props} />;
}

interface FormFieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

function attachAriaToField(
  child: ReactNode,
  htmlFor: string | undefined,
  describedBy: string | undefined,
  invalid: boolean,
): ReactNode {
  if (!isValidElement(child)) {
    return child;
  }

  const node = child as ReactElement<Record<string, unknown>>;
  const existingDescribedBy = typeof node.props["aria-describedby"] === "string"
    ? (node.props["aria-describedby"] as string)
    : "";
  const nextDescribedBy = [existingDescribedBy, describedBy].filter(Boolean).join(" ").trim();

  const patch: Record<string, unknown> = {};
  if (htmlFor && !node.props.id) {
    patch.id = htmlFor;
  }
  if (nextDescribedBy && !node.props["aria-describedby"]) {
    patch["aria-describedby"] = nextDescribedBy;
  }
  if (invalid && !node.props["aria-invalid"]) {
    patch["aria-invalid"] = true;
  }

  return cloneElement(node, patch);
}

export function FormField({
  className,
  label,
  htmlFor,
  hint,
  error,
  children,
  ...props
}: FormFieldProps) {
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const describedBy = [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("ui-form-field", className)} {...props}>
      <label className="ui-form-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="ui-form-control">{attachAriaToField(children, htmlFor, describedBy, Boolean(error))}</div>
      {hint ? (
        <p id={hintId} className="ui-form-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="ui-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export function Toggle({
  className,
  label,
  description,
  id,
  checked,
  disabled,
  onChange,
  ...props
}: ToggleProps) {
  return (
    <label className={cn("ui-toggle", className)} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="ui-toggle-input"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        {...props}
      />
      <span className="ui-toggle-track" aria-hidden="true">
        <span className="ui-toggle-thumb" />
      </span>
      <span className="ui-toggle-copy">
        <span className="ui-toggle-label">{label}</span>
        {description ? <span className="ui-toggle-description">{description}</span> : null}
      </span>
    </label>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  className?: string;
  name: string;
  ariaLabel: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  className,
  name,
  ariaLabel,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className={cn("ui-segmented", className)} aria-label={ariaLabel}>
      <legend className="sr-only">{ariaLabel}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "ui-segmented-option",
            value === option.value && "is-active",
            option.disabled && "is-disabled",
          )}
        >
          <input
            className="ui-segmented-input"
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            aria-label={option.ariaLabel ?? option.label}
          />
          <span className="ui-segmented-label">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function Chip({
  className,
  selected = false,
  disabled,
  type = "button",
  children,
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      className={cn("ui-chip", selected && "is-active", className)}
      aria-pressed={selected}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

interface ChipGroupProps extends HTMLAttributes<HTMLDivElement> {
  ariaLabel?: string;
}

export function ChipGroup({ className, ariaLabel, children, ...props }: ChipGroupProps) {
  return (
    <div className={cn("ui-chip-group", className)} role="group" aria-label={ariaLabel} {...props}>
      {children}
    </div>
  );
}

interface TabsProps<T extends string> extends Omit<SegmentedControlProps<T>, "ariaLabel"> {
  ariaLabel?: string;
}

export function Tabs<T extends string>({
  ariaLabel = "탭 선택",
  ...props
}: TabsProps<T>) {
  return <SegmentedControl ariaLabel={ariaLabel} {...props} />;
}
