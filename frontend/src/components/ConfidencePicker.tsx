import type { ConfidenceSummary } from "../types";

export const CONFIDENCE_LABELS = ["猜的", "不确定", "比较确定", "很确定"] as const;

export function ConfidencePicker({ value, onChange, disabled = false }: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}): JSX.Element {
  return <div className="confidence-picker" role="group" aria-label="答题把握度">
    <span>这题有多大把握？</span>
    <div>{CONFIDENCE_LABELS.map((label, index) => <button key={label} type="button" disabled={disabled}
      className={value === index + 1 ? "is-active" : ""} aria-pressed={value === index + 1}
      onClick={() => onChange(value === index + 1 ? null : index + 1)}>{label}</button>)}</div>
  </div>;
}

export function ConfidenceSummaryView({ summary }: { summary: ConfidenceSummary | null }): JSX.Element | null {
  if (!summary || !summary.buckets.some(bucket => bucket.count)) return null;
  return <section className="confidence-summary" aria-label="答题把握度统计">
    <strong>把握度校准</strong>
    <div>{summary.buckets.map(bucket => <span key={bucket.level}>
      <b>{CONFIDENCE_LABELS[bucket.level - 1]}</b>
      <em>{bucket.count ? `${bucket.correct}/${bucket.count} 答对` : "暂无记录"}</em>
    </span>)}</div>
  </section>;
}
