import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Filter, Inbox } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { getMoneyLessonLabel } from "@/lib/money-lessons";
import { apiClient, type ReviewQueueResponse } from "../lib/api/client";
import { useSession } from "../lib/session";

const stageFilters = ["", "image_qa", "image_safety", "text_moderation", "finalize_gate"] as const;

export function ReviewQueuePage() {
  const { token } = useSession();
  const [stage, setStage] = useState<(typeof stageFilters)[number]>("");
  const [payload, setPayload] = useState<ReviewQueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const next = await apiClient.listReviewCases(token, { status: "open", stage: stage || undefined, limit: 50 });
        if (!cancelled) {
          setPayload(next);
          setError(null);
        }
      } catch (apiError) {
        if (!cancelled) {
          setError(apiError instanceof Error ? apiError.message : "Unable to load review queue");
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [stage, token]);

  return (
    <main className="sw-page sw-container mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Card className="sw-panel border-border/70 bg-white/95">
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="sw-page-title text-2xl font-semibold text-slate-950">Manual QA queue</h1>
            <CardDescription>Open review cases refresh automatically every 10 seconds.</CardDescription>
          </div>
          <div className="w-full max-w-xs space-y-2">
            <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">Filter by stage</p>
            <Select value={stage || "all"} onValueChange={(value) => setStage(value === "all" ? "" : (value as (typeof stageFilters)[number]))}>
              <SelectTrigger className="w-full">
                <Filter className="size-4 text-slate-400" />
                <SelectValue placeholder="All open cases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All open cases</SelectItem>
                <SelectItem value="image_qa">Image QA</SelectItem>
                <SelectItem value="image_safety">Image safety</SelectItem>
                <SelectItem value="text_moderation">Text moderation</SelectItem>
                <SelectItem value="finalize_gate">Finalize gate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <Card className="sw-panel border-border/70 bg-white/95">
        <CardContent className="space-y-4 pt-6">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load review queue</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {!payload?.cases.length ? (
            <div className="sw-empty rounded-xl border border-dashed border-border bg-slate-50 px-4 py-10 text-center">
              <Inbox className="mx-auto mb-3 size-5 text-slate-400" />
              <p className="font-medium text-slate-900">No open review cases.</p>
              <p className="mt-1 text-sm text-slate-500">When the pipeline pauses a book for review, it will appear here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Child</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Lesson</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Spreads</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payload.cases.map((reviewCase) => (
                  <TableRow key={reviewCase.caseId}>
                    <TableCell>{new Date(reviewCase.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{reviewCase.childFirstName}</TableCell>
                    <TableCell className="text-slate-600">{reviewCase.readingProfileId}</TableCell>
                    <TableCell className="text-slate-600">{getMoneyLessonLabel(reviewCase.moneyLessonKey)}</TableCell>
                    <TableCell>
                      <StatusBadge value={reviewCase.stage} />
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal text-slate-600">{reviewCase.reasonSummary}</TableCell>
                    <TableCell>{reviewCase.pageCount}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/review/cases/${reviewCase.caseId}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
