import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  apiClient,
  type BookResponse,
  type CreateOrderResponse,
  type OrderResponse
} from "../lib/api/client";
import { useSession } from "../lib/session";
import { storageKeys, usePersistentState, usePersistentString } from "../lib/storage";
import { StatusPill } from "../components/StatusPill";

type ReadingProfile = "read_aloud_3_4" | "early_decoder_5_7" | "independent_8_10";
type LessonKey = "inflation_candy" | "saving_later" | "delayed_gratification";

const enableIndependent8To10 = false;

export function ParentHomePage() {
  const { token, session } = useSession();
  const [email, setEmail] = useState("");
  const [linkStatus, setLinkStatus] = useState("");
  const [verifyStatus, setVerifyStatus] = useState("");
  const [childFirstName, setChildFirstName] = useState("Mia");
  const [pronouns, setPronouns] = useState("she/her");
  const [ageYears, setAgeYears] = useState(6);
  const [moneyLessonKey, setMoneyLessonKey] = useState<LessonKey>("saving_later");
  const [interestTags, setInterestTags] = useState("baking,forest,bikes");
  const [readingProfileId, setReadingProfileId] = useState<ReadingProfile>("early_decoder_5_7");
  const [order, setOrder] = usePersistentState<CreateOrderResponse>(storageKeys.activeOrder, null);
  const [orderStatus, setOrderStatus] = usePersistentState<OrderResponse>(storageKeys.activeOrderStatus, null);
  const [bookPayload, setBookPayload] = usePersistentState<BookResponse>(storageKeys.activeBookPayload, null);
  const [checkoutUrl, setCheckoutUrl] = usePersistentString(storageKeys.activeCheckoutUrl);
  const [downloadUrl, setDownloadUrl] = usePersistentString(storageKeys.activeDownloadUrl);
  const [privacyStatus, setPrivacyStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const checkoutOutcome = useMemo(() => new URL(window.location.href).searchParams.get("checkout"), []);

  useEffect(() => {
    if (checkoutOutcome === "success") {
      setVerifyStatus("Checkout returned successfully. Order status will update shortly.");
    } else if (checkoutOutcome === "cancel") {
      setVerifyStatus("Checkout was canceled.");
    }
  }, [checkoutOutcome]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const activeOrderId = orderStatus?.orderId ?? order?.orderId;
    if (!activeOrderId) {
      return;
    }

    void apiClient
      .getOrder(token, activeOrderId)
      .then((payload) => {
        setOrderStatus(payload);
      })
      .catch((apiError) => {
        if (!(apiError instanceof ApiError && apiError.status === 404)) {
          setError(apiError instanceof Error ? apiError.message : "Unable to load order status");
        }
      });
  }, [order?.orderId, orderStatus?.orderId, setOrderStatus, token]);

  useEffect(() => {
    if (!orderStatus || !token) {
      return;
    }

    const terminal = ["ready", "failed", "needs_review"];
    if (terminal.includes(orderStatus.bookStatus)) {
      return;
    }

    const timer = window.setInterval(() => {
      void apiClient
        .getOrder(token, orderStatus.orderId)
        .then((payload) => {
          setOrderStatus(payload);
        })
        .catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [orderStatus, setOrderStatus, token]);

  const requestLink = async () => {
    setError(null);
    const response = await apiClient.requestLink(email);
    if (response.sent) {
      setLinkStatus("Sign-in link sent. Check your email.");
    }
  };

  const createOrder = async () => {
    if (!token) {
      setError("Sign in first");
      return;
    }

    setError(null);
    try {
      const payload = await apiClient.createOrder(token, {
        childFirstName,
        pronouns,
        ageYears,
        moneyLessonKey,
        interestTags: interestTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        readingProfileId
      });
      setOrder(payload);
      setOrderStatus({
        orderId: payload.orderId,
        status: payload.status,
        bookId: payload.bookId,
        childProfileId: payload.childProfileId,
        bookStatus: "draft",
        createdAt: new Date().toISOString()
      });
      setCheckoutUrl(null);
      setBookPayload(null);
      setDownloadUrl(null);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to create order");
    }
  };

  const startCheckout = async () => {
    const activeOrderId = orderStatus?.orderId ?? order?.orderId;
    if (!token || !activeOrderId) {
      return;
    }

    try {
      const payload = await apiClient.checkoutOrder(token, activeOrderId);
      setCheckoutUrl(payload.checkoutUrl ?? null);
      setOrderStatus(await apiClient.getOrder(token, activeOrderId));
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to create checkout session");
    }
  };

  const fallbackMarkPaid = async () => {
    const activeOrderId = orderStatus?.orderId ?? order?.orderId;
    if (!token || !activeOrderId) {
      return;
    }

    try {
      await apiClient.markPaid(token, activeOrderId);
      setOrderStatus(await apiClient.getOrder(token, activeOrderId));
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to mark order paid");
    }
  };

  const loadBook = async () => {
    if (!token || !orderStatus?.bookId) {
      return;
    }

    try {
      setBookPayload(await apiClient.getBook(token, orderStatus.bookId));
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to load book");
    }
  };

  const loadDownload = async () => {
    if (!token || !orderStatus?.bookId) {
      return;
    }

    try {
      const payload = await apiClient.getBookDownload(token, orderStatus.bookId);
      setDownloadUrl(payload.url);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to get PDF link");
    }
  };

  const deleteChildProfile = async () => {
    if (!token || !orderStatus?.childProfileId) {
      return;
    }

    try {
      const payload = await apiClient.deleteChildProfile(token, orderStatus.childProfileId);
      setPrivacyStatus(
        `Deletion queued. Event ${payload.privacyEventId}. Queued artifacts: ${payload.queuedArtifacts}.`
      );
      setOrder(null);
      setOrderStatus(null);
      setBookPayload(null);
      setCheckoutUrl(null);
      setDownloadUrl(null);
    } catch (apiError) {
      setPrivacyStatus(apiError instanceof Error ? apiError.message : "Delete failed");
    }
  };

  return (
    <main className="route-wrap">
      <section className="hero-card warm">
        <p className="sub">No child photo upload. Parent-only account. Montessori-leaning visual style.</p>
        {session?.capabilities.canReview ? (
          <p className="hint">
            Internal reviewer access is enabled for this account. <Link to="/review">Open review queue</Link>
          </p>
        ) : null}
      </section>

      <section className="grid parent-grid">
        <article className="card">
          <h2>1. Parent Login</h2>
          <label>Email</label>
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="parent@example.com" />
          <button onClick={requestLink}>Send magic link</button>
          <p className="hint">Auth: {token ? `signed in as ${session?.user.email ?? "..."}` : "signed out"}</p>
          <p className="hint">{linkStatus}</p>
          <p className="hint">{verifyStatus}</p>
          <p className="hint">Privacy: parent email + child first name/age only. No child photos.</p>
        </article>

        <article className="card">
          <h2>2. Create Order</h2>
          <label>Child first name</label>
          <input value={childFirstName} onChange={(event) => setChildFirstName(event.target.value)} />

          <label>Pronouns</label>
          <input value={pronouns} onChange={(event) => setPronouns(event.target.value)} />

          <label>Age</label>
          <input
            type="number"
            value={ageYears}
            min={2}
            max={12}
            onChange={(event) => setAgeYears(Number(event.target.value))}
          />

          <label>Money lesson</label>
          <select value={moneyLessonKey} onChange={(event) => setMoneyLessonKey(event.target.value as LessonKey)}>
            <option value="inflation_candy">Why coins buy less candy</option>
            <option value="saving_later">Why saving helps later</option>
            <option value="delayed_gratification">Why waiting makes things better</option>
          </select>

          <label>Interests (comma-separated)</label>
          <input value={interestTags} onChange={(event) => setInterestTags(event.target.value)} />

          <label>Reading profile</label>
          <select value={readingProfileId} onChange={(event) => setReadingProfileId(event.target.value as ReadingProfile)}>
            <option value="read_aloud_3_4">Read-aloud (3-4)</option>
            <option value="early_decoder_5_7">Early decoder (5-7)</option>
            {enableIndependent8To10 ? <option value="independent_8_10">Independent (8-10)</option> : null}
          </select>

          <div className="button-row">
            <button onClick={createOrder}>Create order</button>
            <button onClick={startCheckout} disabled={!orderStatus?.orderId && !order?.orderId}>
              Create checkout session
            </button>
            <button onClick={fallbackMarkPaid} disabled={!orderStatus?.orderId && !order?.orderId}>
              Fallback mark paid
            </button>
          </div>

          {checkoutUrl ? (
            <p className="hint">
              Checkout URL: <a href={checkoutUrl}>Open Stripe Checkout</a>
            </p>
          ) : null}

          {orderStatus ? (
            <div className="status-panel">
              <p>
                <strong>Order</strong> {orderStatus.orderId}
              </p>
              <p>
                <strong>Status</strong> <StatusPill value={orderStatus.status} />
              </p>
              <p>
                <strong>Book</strong> {orderStatus.bookId}
              </p>
              <p>
                <strong>Book status</strong> <StatusPill value={orderStatus.bookStatus} />
              </p>
            </div>
          ) : null}

          {orderStatus?.bookStatus === "failed" ? (
            <p className="hint">Build failed. Check logs and retry with a new order.</p>
          ) : null}
          {orderStatus?.bookStatus === "needs_review" ? (
            <p className="hint">This book is under internal review. Release is paused until an operator clears it.</p>
          ) : null}
        </article>

        <article className="card full">
          <h2>3. Reader + Download + Privacy</h2>
          <div className="button-row">
            <button onClick={loadBook} disabled={!orderStatus?.bookId}>
              Load book
            </button>
            <button onClick={loadDownload} disabled={!orderStatus?.bookId}>
              Get PDF link
            </button>
            <button onClick={deleteChildProfile} disabled={!orderStatus?.childProfileId}>
              Delete child profile + artifacts
            </button>
          </div>

          {privacyStatus ? <p className="hint">{privacyStatus}</p> : null}

          {bookPayload ? (
            <>
              <div className="button-row">
                <button onClick={() => setShowTranscript((current) => !current)}>
                  {showTranscript ? "Hide text" : "Show text"}
                </button>
              </div>
              <div className="pages-grid">
                {bookPayload.pages.map((page) => {
                  const previewUrl = page.previewImageUrl ?? page.imageUrl;
                  return (
                    <article key={page.pageIndex} className="page-card">
                      <header>
                        <h3>Page {page.pageIndex + 1}</h3>
                        <StatusPill value={page.status} />
                      </header>
                      {previewUrl ? <img src={previewUrl} alt={`Page ${page.pageIndex + 1}`} /> : <p>No page preview yet</p>}
                      {showTranscript ? <p>{page.text}</p> : null}
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}

          {downloadUrl ? (
            <p>
              PDF: <a href={downloadUrl}>Download</a>
            </p>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
        </article>
      </section>
    </main>
  );
}
