import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, type ReviewQueueResponse } from "../lib/api/client";
import { useSession } from "../lib/session";
import { StatusPill } from "../components/StatusPill";

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
    <main className="route-wrap review-shell">
      <section className="hero-card review-hero">
        <div>
          <p className="eyebrow">Internal Review</p>
          <h2>Manual QA Queue</h2>
        </div>
        <div className="filter-row">
          <label htmlFor="review-stage">Stage</label>
          <select id="review-stage" value={stage} onChange={(event) => setStage(event.target.value as (typeof stageFilters)[number])}>
            <option value="">All open cases</option>
            <option value="image_qa">Image QA</option>
            <option value="image_safety">Image safety</option>
            <option value="text_moderation">Text moderation</option>
            <option value="finalize_gate">Finalize gate</option>
          </select>
        </div>
      </section>

      <section className="card">
        {error ? <p className="error">{error}</p> : null}
        <div className="review-table-wrap">
          <table className="review-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Child</th>
                <th>Profile</th>
                <th>Lesson</th>
                <th>Stage</th>
                <th>Reason</th>
                <th>Pages</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {payload?.cases.map((reviewCase) => (
                <tr key={reviewCase.caseId}>
                  <td>{new Date(reviewCase.createdAt).toLocaleString()}</td>
                  <td>{reviewCase.childFirstName}</td>
                  <td>{reviewCase.readingProfileId}</td>
                  <td>{reviewCase.moneyLessonKey}</td>
                  <td>
                    <StatusPill value={reviewCase.stage} />
                  </td>
                  <td>{reviewCase.reasonSummary}</td>
                  <td>{reviewCase.pageCount}</td>
                  <td>
                    <Link to={`/review/cases/${reviewCase.caseId}`}>Open</Link>
                  </td>
                </tr>
              ))}
              {!payload?.cases.length ? (
                <tr>
                  <td colSpan={8}>No open review cases.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
