import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function toneForValue(value: string) {
  if (["ready", "resolved", "approve_continue"].includes(value)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (
    ["needs_review", "image_qa", "image_safety", "retrying", "finalize_gate"].includes(value)
  ) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (["failed", "rejected", "reject"].includes(value)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (
    ["building", "pending", "created", "checkout_pending", "paid", "text_moderation", "retry_page", "draft"].includes(
      value
    )
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase", toneForValue(value), className)}
    >
      {value.replace(/_/g, " ")}
    </Badge>
  );
}
