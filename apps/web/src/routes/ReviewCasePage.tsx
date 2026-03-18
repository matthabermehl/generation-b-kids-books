import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { apiClient, type ReviewCaseDetailResponse } from "../lib/api/client";
import { sanitizeReviewCaseDetail } from "../lib/safe-url";
import { useSession } from "../lib/session";

export function ReviewCasePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { token } = useSession();
  const [payload, setPayload] = useState<ReviewCaseDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [retryNotes, setRetryNotes] = useState("");
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !caseId) {
      return;
    }

    void apiClient
      .getReviewCase(token, caseId)
      .then((detail) => {
        setPayload(sanitizeReviewCaseDetail(detail));
        setSelectedPageId((current) => current ?? detail.pages[0]?.pageId ?? null);
        setError(null);
      })
      .catch((apiError) => {
        setError(apiError instanceof Error ? apiError.message : "Unable to load review case");
      });
  }, [caseId, token]);

  const selectedPage = useMemo(
    () => payload?.pages.find((page) => page.pageId === selectedPageId) ?? payload?.pages[0] ?? null,
    [payload, selectedPageId]
  );
  const supportingArtifacts = useMemo(
    () =>
      payload?.artifacts.filter(
        (artifact) => artifact.artifactType !== "pdf" && artifact.artifactType !== "story_proof_pdf"
      ) ?? [],
    [payload]
  );

  if (!caseId) {
    return (
      <main className="sw-page sw-container mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="destructive">
          <AlertTitle>Review case id missing</AlertTitle>
          <AlertDescription>The route needs a case id before the reviewer workspace can load.</AlertDescription>
        </Alert>
      </main>
    );
  }

  const approve = async () => {
    if (!token) {
      return;
    }
    const response = await apiClient.approveReviewCase(token, caseId, { notes: approveNotes || undefined });
    setActionStatus(`Resume started. Execution: ${response.executionArn ?? "n/a"}`);
    navigate("/review", { replace: true });
  };

  const reject = async () => {
    if (!token) {
      return;
    }
    const response = await apiClient.rejectReviewCase(token, caseId, { notes: rejectNotes });
    setActionStatus(`Case ${response.status}.`);
    navigate("/review", { replace: true });
  };

  const retryPage = async () => {
    if (!token || !selectedPage) {
      return;
    }
    const response = await apiClient.retryReviewPage(token, caseId, selectedPage.pageId, { notes: retryNotes });
    setActionStatus(`Page retry queued. Execution: ${response.executionArn ?? "n/a"}`);
    navigate("/review", { replace: true });
  };

  return (
    <main className="sw-page sw-container mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="w-fit px-0 text-slate-500">
        <Link to="/review">Review queue</Link>
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load review case</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {actionStatus ? (
        <Alert>
          <AlertTitle>Reviewer action queued</AlertTitle>
          <AlertDescription>{actionStatus}</AlertDescription>
        </Alert>
      ) : null}
      {payload ? (
        <section className="sw-sidebar-layout grid gap-6 lg:grid-cols-[0.95fr_1.25fr]">
          <aside className="sw-sidebar space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card className="sw-panel border-border/70 bg-white/95">
              <CardHeader className="space-y-2">
                <CardDescription>Review case</CardDescription>
                <h1 className="text-2xl font-semibold text-slate-950">{payload.book.childFirstName}</h1>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge value={payload.stage} />
                  <StatusBadge value={payload.order.status} />
                  <StatusBadge value={payload.book.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-600">
                <p>Reading profile: {payload.book.readingProfileId}</p>
                <p>Lesson: {payload.book.moneyLessonKey}</p>
                <p>Spreads: {payload.book.spreadCount}</p>
                <p>Physical pages: {payload.book.physicalPageCount}</p>
                <p>Order: {payload.order.orderId}</p>
                <p>Book: {payload.book.bookId}</p>
              </CardContent>
            </Card>

            <Card className="sw-panel border-border/70 bg-white/95">
              <CardHeader>
                <h2 className="text-lg font-semibold text-slate-950">Reason</h2>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-slate-600">{payload.reasonSummary}</CardContent>
            </Card>

            <Card className="sw-panel border-border/70 bg-white/95">
              <CardHeader>
                <h2 className="text-lg font-semibold text-slate-950">Reviewer actions</h2>
                <CardDescription>Keep the resume, reject, and retry behaviors unchanged.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">Approve / continue note</p>
                  <Textarea value={approveNotes} onChange={(event) => setApproveNotes(event.target.value)} />
                  <Button onClick={approve} className="w-full">Approve and continue</Button>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">Reject note</p>
                  <Textarea value={rejectNotes} onChange={(event) => setRejectNotes(event.target.value)} />
                  <Button variant="destructive" onClick={reject} disabled={!rejectNotes.trim()} className="w-full">
                    Reject book
                  </Button>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">Retry selected page note</p>
                  <Textarea value={retryNotes} onChange={(event) => setRetryNotes(event.target.value)} />
                  <Button onClick={retryPage} disabled={!retryNotes.trim() || !selectedPage} variant="outline" className="w-full">
                    Retry selected page
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="sw-panel border-border/70 bg-white/95">
              <CardHeader>
                <h2 className="text-lg font-semibold text-slate-950">Artifacts</h2>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {payload.storyProofPdfUrl ? (
                  <p>
                    <a href={payload.storyProofPdfUrl} className="font-medium text-slate-900 underline" rel="noreferrer">
                      Story proof PDF
                    </a>
                  </p>
                ) : null}
                {payload.pdfUrl ? (
                  <p>
                    <a href={payload.pdfUrl} className="font-medium text-slate-900 underline" rel="noreferrer">
                      Final illustrated PDF
                    </a>
                  </p>
                ) : null}
                {!payload.storyProofPdfUrl && !payload.pdfUrl ? (
                  <p className="text-slate-500">No readable PDF available yet.</p>
                ) : null}
                {supportingArtifacts.map((artifact) => (
                  <p key={`${artifact.artifactType}-${artifact.createdAt}`}>
                    {artifact.url ? (
                      <a href={artifact.url} className="text-slate-700 underline" rel="noreferrer">{artifact.artifactType}</a>
                    ) : (
                      <span className="text-slate-500">{artifact.artifactType}</span>
                    )}
                  </p>
                ))}
                {!payload.storyProofPdfUrl && !payload.pdfUrl && supportingArtifacts.length === 0 ? (
                  <p className="text-slate-500">No support artifacts available yet.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="sw-panel border-border/70 bg-white/95">
              <CardHeader>
                <h2 className="text-lg font-semibold text-slate-950">Audit trail</h2>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-72">
                  <div className="sw-audit-list space-y-4 pr-4">
                    {payload.events.map((event) => (
                      <article key={event.id} className="sw-audit-item rounded-xl border border-border/80 bg-slate-50 p-4 text-sm">
                        <p className="font-medium text-slate-900">{event.action} by {event.reviewerEmail}</p>
                        <p className="mt-1 text-slate-500">{new Date(event.createdAt).toLocaleString()}</p>
                        {event.notes ? <p className="mt-3 text-slate-600">{event.notes}</p> : null}
                      </article>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>

          <section className="space-y-6">
            <Card className="sw-panel border-border/70 bg-white/95">
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">Spread review</h2>
                  <CardDescription>Inspect the selected spread preview alongside the right-page illustration asset.</CardDescription>
                </div>
                <div className="text-sm text-slate-500">Order {payload.order.orderId} · Book {payload.book.bookId}</div>
              </CardHeader>
              <CardContent>
                <Tabs value={selectedPage?.pageId} onValueChange={setSelectedPageId} className="gap-4">
                  <ScrollArea className="w-full">
                    <TabsList variant="line" className="min-w-max">
                      {payload.pages.map((page) => (
                        <TabsTrigger key={page.pageId} value={page.pageId}>
                          Spread {page.spreadIndex + 1}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </ScrollArea>
                  {payload.pages.map((page) => (
                    <TabsContent key={page.pageId} value={page.pageId} className="space-y-6">
                      <div className="sw-two-up grid gap-4 xl:grid-cols-2">
                        <Card className="sw-panel sw-preview-card border-border/70 bg-slate-50/70">
                          <CardHeader>
                            <h3 className="text-base font-semibold text-slate-950">Spread preview</h3>
                          </CardHeader>
                          <CardContent>
                            {page.previewImageUrl ? (
                              <img src={page.previewImageUrl} alt="Spread preview" className="sw-preview-media aspect-[2/1] w-full rounded-xl border border-border bg-white object-contain" />
                            ) : (
                              <div className="sw-empty rounded-xl border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-slate-500">No spread preview yet</div>
                            )}
                          </CardContent>
                        </Card>
                        <Card className="sw-panel sw-preview-card sw-preview-card--art border-border/70 bg-slate-50/70">
                          <CardHeader>
                            <h3 className="text-base font-semibold text-slate-950">Right-page art</h3>
                          </CardHeader>
                          <CardContent>
                            {page.pageArtUrl ? (
                              <img src={page.pageArtUrl} alt="Right-page art" className="sw-preview-media aspect-square w-full rounded-xl border border-border bg-white object-contain" />
                            ) : (
                              <div className="sw-empty rounded-xl border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-slate-500">No right-page art</div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>

            {selectedPage ? (
              <div className="sw-sidebar-layout grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <Card className="sw-panel border-border/70 bg-white/95">
                  <CardHeader>
                    <h3 className="text-lg font-semibold text-slate-950">Text and metadata</h3>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-slate-600">
                    <p className="leading-6">{selectedPage.text}</p>
                    <p>Spread: {selectedPage.spreadIndex + 1}</p>
                    <p>Template: {selectedPage.templateId ?? "n/a"}</p>
                    <p>Scene: {String(selectedPage.provenance?.sceneId ?? "n/a")}</p>
                    <p>
                      Scene plan:{" "}
                      {payload.scenePlan?.url ? (
                        <a href={payload.scenePlan.url} className="text-slate-700 underline" rel="noreferrer">
                          current scene-plan.json
                        </a>
                      ) : (
                        "n/a"
                      )}
                    </p>
                    <p>
                      Image plan:{" "}
                      {payload.imagePlan?.url ? (
                        <a href={payload.imagePlan.url} className="text-slate-700 underline" rel="noreferrer">
                          current image-plan.json
                        </a>
                      ) : (
                        "n/a"
                      )}
                    </p>
                    <pre className="sw-code-block overflow-auto rounded-xl border border-border bg-slate-950 p-4 text-xs text-slate-100">
                      {JSON.stringify(selectedPage.provenance, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
                <Card className="sw-panel border-border/70 bg-white/95">
                  <CardHeader>
                    <h3 className="text-lg font-semibold text-slate-950">QA details</h3>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-slate-600">
                    <p>Retry count: {selectedPage.retryCount}</p>
                    {selectedPage.latestQaIssues.length ? (
                      <ul className="list-disc space-y-1 pl-5">
                        {selectedPage.latestQaIssues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No current QA issues recorded.</p>
                    )}
                    <pre className="sw-code-block overflow-auto rounded-xl border border-border bg-slate-950 p-4 text-xs text-slate-100">
                      {JSON.stringify(selectedPage.qaMetrics, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </section>
        </section>
      ) : null}
    </main>
  );
}
