import { ProgressBar } from "./ui";

export interface BreakdownRow {
  key: string;
  label: string;
  /** Marks this row accounts for. */
  marks: number;
  /** 0–1 share of the total. */
  share: number;
  detail?: string;
}

/** A ranked list of where marks went, each with its share of the total. */
export function BreakdownList({ title, rows, limit = 5 }: { title: string; rows: BreakdownRow[]; limit?: number }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">{title}</h3>
      <ul className="space-y-2.5">
        {rows.slice(0, limit).map((row) => (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink2 min-w-0 truncate" title={row.label}>{row.label}</span>
              <span className="text-danger tabular-nums shrink-0">
                {row.marks} {row.marks === 1 ? "mark" : "marks"} · {Math.round(row.share * 100)}%
              </span>
            </div>
            <ProgressBar value={row.share} tone="danger" />
            {row.detail ? <p className="text-[11px] text-ink3 mt-0.5">{row.detail}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
