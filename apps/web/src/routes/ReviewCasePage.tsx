import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient, type ReviewCaseDetailResponse } from "../lib/api/client";
import { useSession } from "../lib/session";
import { StatusPill } from "../components/StatusPill";

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
        setPayload(detail);
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

  if (!caseId) {
    return <main className="route-wrap"><p className="error">Review case id missing.</p></main>;
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
    <main className="route-wrap review-shell">
      <p className="breadcrumb"><Link to="/review">Review queue</Link></p>
      {error ? <p className="error">{error}</p> : null}
      {actionStatus ? <p className="hint">{actionStatus}</p> : null}
      {payload ? (
        <section className="review-detail-grid">
          <aside className="card review-sidebar">
            <div className="sidebar-block">
              <p className="eyebrow">Case</p>
              <h2>{payload.book.childFirstName}</h2>
              <p>{payload.book.readingProfileId}</p>
              <p>{payload.book.moneyLessonKey}</p>
              <StatusPill value={payload.stage} />
            </div>

            <div className="sidebar-block">
              <h3>Reason</h3>
              <p>{payload.reasonSummary}</p>
            </div>

            <div className="sidebar-block">
              <h3>Actions</h3>
              <label>Approve / continue note</label>
              <textarea value={approveNotes} onChange={(event) => setApproveNotes(event.target.value)} />
              <button onClick={approve}>Approve and continue</button>

              <label>Reject note</label>
              <textarea value={rejectNotes} onChange={(event) => setRejectNotes(event.target.value)} />
              <button className="danger" onClick={reject} disabled={!rejectNotes.trim()}>
                Reject book
              </button>

              <label>Retry selected page note</label>
              <textarea value={retryNotes} onChange={(event) => setRetryNotes(event.target.value)} />
              <button onClick={retryPage} disabled={!retryNotes.trim() || !selectedPage}>
                Retry selected page
              </button>
            </div>

            <div className="sidebar-block">
              <h3>Artifacts</h3>
              {payload.pdfUrl ? <p><a href={payload.pdfUrl}>Current PDF</a></p> : <p>No PDF available yet.</p>}
              {payload.artifacts.map((artifact) => (
                <p key={`${artifact.artifactType}-${artifact.createdAt}`}>
                  <a href={artifact.url ?? "#"}>{artifact.artifactType}</a>
                </p>
              ))}
            </div>

            <div className="sidebar-block">
              <h3>Audit</h3>
              <div className="timeline">
                {payload.events.map((event) => (
                  <article key={event.id} className="timeline-item">
                    <p><strong>{event.action}</strong> by {event.reviewerEmail}</p>
                    <p className="hint">{new Date(event.createdAt).toLocaleString()}</p>
                    {event.notes ? <p>{event.notes}</p> : null}
                  </article>
                ))}
              </div>
            </div>
          </aside>

          <section className="card review-main">
            <header className="review-header">
              <div>
                <h2>Pages</h2>
                <p className="hint">Order {payload.order.orderId} · Book {payload.book.bookId}</p>
              </div>
              <div className="review-header-statuses">
                <StatusPill value={payload.order.status} />
                <StatusPill value={payload.book.status} />
              </div>
            </header>

            <div className="page-selector">
              {payload.pages.map((page) => (
                <button
                  key={page.pageId}
                  className={page.pageId === selectedPage?.pageId ? "page-tab selected" : "page-tab"}
                  onClick={() => setSelectedPageId(page.pageId)}
                >
                  Page {page.pageIndex + 1}
                </button>
              ))}
            </div>

            {selectedPage ? (
              <div className="review-page-grid">
                <article className="page-panel">
                  <h3>Preview</h3>
                  {selectedPage.previewImageUrl ? <img src={selectedPage.previewImageUrl} alt="Preview" /> : <p>No page preview yet</p>}
                </article>
                <article className="page-panel">
                  <h3>Scene plate</h3>
                  {selectedPage.scenePlateUrl ? <img src={selectedPage.scenePlateUrl} alt="Scene plate" /> : <p>No scene plate</p>}
                </article>
                <article className="page-panel">
                  <h3>Page fill</h3>
                  {selectedPage.pageFillUrl ? <img src={selectedPage.pageFillUrl} alt="Page fill" /> : <p>No page fill</p>}
                </article>
              </div>
            ) : null}

            {selectedPage ? (
              <div className="review-metadata-grid">
                <article className="card muted inset-card">
                  <h3>Text</h3>
                  <p>{selectedPage.text}</p>
                  <p className="hint">Template: {selectedPage.templateId ?? "n/a"}</p>
                </article>
                <article className="card muted inset-card">
                  <h3>QA</h3>
                  <p>Retry count: {selectedPage.retryCount}</p>
                  {selectedPage.latestQaIssues.length ? (
                    <ul className="issue-list">
                      {selectedPage.latestQaIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No current QA issues recorded.</p>
                  )}
                  <pre>{JSON.stringify(selectedPage.qaMetrics, null, 2)}</pre>
                </article>
              </div>
            ) : null}
          </section>
        </section>
      ) : null}
    </main>
  );
}
