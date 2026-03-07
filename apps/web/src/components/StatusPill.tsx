export function StatusPill({ value }: { value: string }) {
  return <span className={`status-pill status-${value}`}>{value.replace(/_/g, " ")}</span>;
}
