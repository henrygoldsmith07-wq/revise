"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// The shared vocabulary every screen is built from. Le Studio's tokens carry
// all the colour, so nothing here needs a `dark:` variant — components stay
// readable and both themes stay correct by construction.

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Panel({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
}) {
  return <Tag className={cx("card p-4 sm:p-5", className)}>{children}</Tag>;
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {hint ? <p className="text-xs text-ink3 mt-0.5">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

type ControlVariant = "primary" | "secondary" | "ghost";
type ControlSize = "sm" | "md";

function controlClass(variant: ControlVariant, size: ControlSize, className?: string) {
  return cx(
    "btn",
    variant === "primary" && "btn-primary",
    variant === "secondary" && "btn-secondary",
    variant === "ghost" && "btn-ghost",
    size === "sm" && "text-xs px-2.5 py-1.5",
    size === "md" && "text-sm",
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      {...props}
      className={controlClass(variant, size, className)}
    />
  );
}

type ButtonLinkProps = Omit<React.ComponentProps<typeof Link>, "href" | "className"> & {
  href: string;
  variant?: ControlVariant;
  size?: ControlSize;
  className?: string;
};

export function ButtonLink({ href, variant = "secondary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link href={href} {...props} className={controlClass(variant, size, className)} />;
}

export function Pill({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "review" | "danger" | "speak" | "accent";
  className?: string;
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "",
    success: "bg-successsoft text-success border-transparent",
    review: "bg-reviewsoft text-review border-transparent",
    danger: "bg-dangersoft text-danger border-transparent",
    speak: "bg-speaksoft text-speak border-transparent",
    accent: "bg-accentsoft text-accent border-transparent",
  };
  return (
    <span className={cx("pill", tones[tone], className)} title={title}>
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "success" | "review" | "danger";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "review" ? "text-review" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <div className="rounded-[8px] border border-line bg-transparent p-3 sm:p-3.5">
      <p className="text-[10px] uppercase tracking-wide text-ink3 font-semibold">{label}</p>
      <p className={cx("text-xl font-semibold tabular-nums mt-0.5", toneClass)}>{value}</p>
      {sub ? <p className="text-[11px] text-ink3 mt-0.5">{sub}</p> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  tone = "accent",
}: {
  value: number;
  label?: string;
  tone?: "accent" | "success" | "review" | "danger";
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const fill =
    tone === "success" ? "bg-success" : tone === "review" ? "bg-review" : tone === "danger" ? "bg-danger" : "bg-accent";
  return (
    <div>
      {label ? (
        <div className="flex justify-between text-xs text-ink3 mb-1">
          <span>{label}</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
      ) : null}
      <div
        className="h-1.5 rounded-full bg-surface2 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "progress"}
      >
        <div className={cx("h-full bar-anim rounded-full", fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="card p-8 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="text-sm text-ink3 mt-1 max-w-md mx-auto">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex card-2 card p-0.5 gap-0.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            "px-3 py-1.5 text-xs font-semibold rounded-[10px] transition-colors",
            option.value === value ? "bg-surface text-ink elev-card" : "text-ink3 hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="text-xs font-semibold text-ink2">{label}</span>
      {hint ? <span className="block text-[11px] text-ink3 mb-1">{hint}</span> : <span className="block h-1" />}
      {children}
    </label>
  );
}

/** Honest labelling of anything a model produced, or didn't. */
export function SourceBadge({ source, note }: { source: "ai" | "fallback"; note?: string }) {
  if (source === "ai") return <Pill tone="speak">AI generated</Pill>;
  return (
    <Pill title={note}>
      {note === "offline" ? "Offline — from your device" : "From the spec content on this device"}
    </Pill>
  );
}
