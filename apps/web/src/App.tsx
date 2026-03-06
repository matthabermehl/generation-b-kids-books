import { useEffect, useMemo, useState } from "react";

type ReadingProfile = "read_aloud_3_4" | "early_decoder_5_7" | "independent_8_10";
type LessonKey = "inflation_candy" | "saving_later" | "delayed_gratification";

interface OrderResponse {
  orderId: string;
  bookId: string;
  childProfileId: string;
  status: string;
}

interface OrderStatus {
  orderId: string;
  status: string;
  bookId: string;
  bookStatus: string;
  childProfileId: string;
}

interface BookPayload {
  bookId: string;
  status: string;
  childFirstName: string;
  productFamily?: "picture_book_fixed_layout" | "chapter_book_reflowable";
  pages: Array<{
    pageIndex: number;
    text: string;
    status: string;
    imageUrl: string | null;
    previewImageUrl?: string | null;
    templateId?: string;
    productFamily?: "picture_book_fixed_layout" | "chapter_book_reflowable";
  }>;
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
const enableIndependent8To10 = false;
const authTokenKey = "book-auth-token";
const activeOrderKey = "book-active-order";
const activeOrderStatusKey = "book-active-order-status";
const activeCheckoutUrlKey = "book-active-checkout-url";
const activeBookPayloadKey = "book-active-book-payload";
const activeDownloadUrlKey = "book-active-download-url";

function loadJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function authHeader(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${apiBase}${path}`, options);
}

export function App() {
  const [email, setEmail] = useState("");
  const [linkStatus, setLinkStatus] = useState("");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(authTokenKey));
  const [verifyStatus, setVerifyStatus] = useState("");

  const [childFirstName, setChildFirstName] = useState("Mia");
  const [pronouns, setPronouns] = useState("she/her");
  const [ageYears, setAgeYears] = useState(6);
  const [moneyLessonKey, setMoneyLessonKey] = useState<LessonKey>("saving_later");
  const [interestTags, setInterestTags] = useState("baking,forest,bikes");
  const [readingProfileId, setReadingProfileId] = useState<ReadingProfile>("early_decoder_5_7");

  const [order, setOrder] = useState<OrderResponse | null>(() => loadJson<OrderResponse>(activeOrderKey));
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(() =>
    loadJson<OrderStatus>(activeOrderStatusKey)
  );
  const [bookPayload, setBookPayload] = useState<BookPayload | null>(() =>
    loadJson<BookPayload>(activeBookPayloadKey)
  );
  const [downloadUrl, setDownloadUrl] = useState<string | null>(() => localStorage.getItem(activeDownloadUrlKey));
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(() => localStorage.getItem(activeCheckoutUrlKey));
  const [privacyStatus, setPrivacyStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const verifyTokenFromUrl = useMemo(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get("token");
  }, []);

  const checkoutOutcome = useMemo(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get("checkout");
  }, []);

  useEffect(() => {
    if (!checkoutOutcome) {
      return;
    }

    if (checkoutOutcome === "success") {
      setVerifyStatus("Checkout returned successfully. Order status will update shortly.");
    }
    if (checkoutOutcome === "cancel") {
      setVerifyStatus("Checkout was canceled.");
    }
  }, [checkoutOutcome]);

  useEffect(() => {
    if (!verifyTokenFromUrl) {
      return;
    }

    const verify = async () => {
      try {
        const response = await apiFetch("/v1/auth/verify-link", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": crypto.randomUUID()
          },
          body: JSON.stringify({ token: verifyTokenFromUrl })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Verification failed");
        }

        const payload = (await response.json()) as { token: string };
        setToken(payload.token);
        setVerifyStatus("Email verified. You are signed in.");
      } catch (err) {
        setVerifyStatus(err instanceof Error ? err.message : "Verification failed");
      } finally {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("token");
        window.history.replaceState({}, "", cleanUrl.toString());
      }
    };

    void verify();
  }, [verifyTokenFromUrl]);

  useEffect(() => {
    if (token) {
      localStorage.setItem(authTokenKey, token);
      return;
    }

    localStorage.removeItem(authTokenKey);
  }, [token]);

  useEffect(() => {
    if (order) {
      localStorage.setItem(activeOrderKey, JSON.stringify(order));
      return;
    }
    localStorage.removeItem(activeOrderKey);
  }, [order]);

  useEffect(() => {
    if (orderStatus) {
      localStorage.setItem(activeOrderStatusKey, JSON.stringify(orderStatus));
      return;
    }
    localStorage.removeItem(activeOrderStatusKey);
  }, [orderStatus]);

  useEffect(() => {
    if (checkoutUrl) {
      localStorage.setItem(activeCheckoutUrlKey, checkoutUrl);
      return;
    }
    localStorage.removeItem(activeCheckoutUrlKey);
  }, [checkoutUrl]);

  useEffect(() => {
    if (bookPayload) {
      localStorage.setItem(activeBookPayloadKey, JSON.stringify(bookPayload));
      return;
    }
    localStorage.removeItem(activeBookPayloadKey);
  }, [bookPayload]);

  useEffect(() => {
    if (downloadUrl) {
      localStorage.setItem(activeDownloadUrlKey, downloadUrl);
      return;
    }
    localStorage.removeItem(activeDownloadUrlKey);
  }, [downloadUrl]);

  useEffect(() => {
    if (!orderStatus) {
      return;
    }

    setOrder((current) => {
      if (
        current &&
        current.orderId === orderStatus.orderId &&
        current.bookId === orderStatus.bookId &&
        current.childProfileId === orderStatus.childProfileId &&
        current.status === orderStatus.status
      ) {
        return current;
      }

      return {
        orderId: orderStatus.orderId,
        bookId: orderStatus.bookId,
        childProfileId: orderStatus.childProfileId,
        status: orderStatus.status
      };
    });
  }, [orderStatus]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const activeOrderId = orderStatus?.orderId ?? order?.orderId;
    if (!activeOrderId) {
      return;
    }

    const refreshOrderStatus = async () => {
      const response = await apiFetch(`/v1/orders/${activeOrderId}`, {
        headers: authHeader(token)
      });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as OrderStatus;
      setOrderStatus(payload);
    };

    void refreshOrderStatus();
  }, [token, orderStatus?.orderId, order?.orderId]);

  useEffect(() => {
    if (!orderStatus || !token) {
      return;
    }

    const terminal = ["ready", "failed", "needs_review"];
    if (terminal.includes(orderStatus.bookStatus)) {
      return;
    }

    const timer = setInterval(async () => {
      const response = await apiFetch(`/v1/orders/${orderStatus.orderId}`, {
        headers: {
          ...authHeader(token)
        }
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as OrderStatus;
      setOrderStatus(payload);
    }, 4000);

    return () => clearInterval(timer);
  }, [orderStatus, token]);

  const requestLink = async () => {
    setError(null);
    const response = await apiFetch("/v1/auth/request-link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      const text = await response.text();
      setLinkStatus(`Failed: ${text}`);
      return;
    }

    setLinkStatus("Sign-in link sent. Check your email.");
  };

  const createOrder = async () => {
    if (!token) {
      setError("Sign in first");
      return;
    }

    setError(null);
    const response = await apiFetch("/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        ...authHeader(token)
      },
      body: JSON.stringify({
        childFirstName,
        pronouns,
        ageYears,
        moneyLessonKey,
        interestTags: interestTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        readingProfileId
      })
    });

    if (!response.ok) {
      const text = await response.text();
      setError(text);
      return;
    }

    const payload = (await response.json()) as OrderResponse;
    setOrder(payload);
    setOrderStatus({
      orderId: payload.orderId,
      status: payload.status,
      bookId: payload.bookId,
      childProfileId: payload.childProfileId,
      bookStatus: "draft"
    });
    setCheckoutUrl(null);
  };

  const startCheckout = async () => {
    const activeOrderId = orderStatus?.orderId ?? order?.orderId;
    const activeBookId = orderStatus?.bookId ?? order?.bookId;
    if (!token || !activeOrderId || !activeBookId) return;

    const response = await apiFetch(`/v1/orders/${activeOrderId}/checkout`, {
      method: "POST",
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        ...authHeader(token)
      }
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

    const payload = (await response.json()) as {
      status: string;
      checkoutUrl: string | null;
      stripeSessionId: string | null;
    };

    setCheckoutUrl(payload.checkoutUrl);

    const statusResponse = await apiFetch(`/v1/orders/${activeOrderId}`, {
      headers: authHeader(token)
    });

    if (statusResponse.ok) {
      setOrderStatus((await statusResponse.json()) as OrderStatus);
    }
  };

  const fallbackMarkPaid = async () => {
    const activeOrderId = orderStatus?.orderId ?? order?.orderId;
    if (!token || !activeOrderId) return;

    const response = await apiFetch(`/v1/orders/${activeOrderId}/mark-paid`, {
      method: "POST",
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        ...authHeader(token)
      }
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

    const statusResponse = await apiFetch(`/v1/orders/${activeOrderId}`, {
      headers: authHeader(token)
    });

    if (statusResponse.ok) {
      setOrderStatus((await statusResponse.json()) as OrderStatus);
    }
  };

  const loadBook = async () => {
    if (!token || !orderStatus?.bookId) return;

    const response = await apiFetch(`/v1/books/${orderStatus.bookId}`, {
      headers: authHeader(token)
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

    setBookPayload((await response.json()) as BookPayload);
  };

  const loadDownload = async () => {
    if (!token || !orderStatus?.bookId) return;

    const response = await apiFetch(`/v1/books/${orderStatus.bookId}/download?format=pdf`, {
      headers: authHeader(token)
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

    const payload = (await response.json()) as { url: string };
    setDownloadUrl(payload.url);
  };

  const deleteChildProfile = async () => {
    if (!token || !orderStatus?.childProfileId) {
      return;
    }

    const response = await apiFetch(`/v1/child-profiles/${orderStatus.childProfileId}`, {
      method: "DELETE",
      headers: {
        ...authHeader(token)
      }
    });

    if (!response.ok) {
      setPrivacyStatus(`Delete failed: ${await response.text()}`);
      return;
    }

    const payload = (await response.json()) as { privacyEventId: string; queuedArtifacts: number };
    setPrivacyStatus(
      `Deletion queued. Event ${payload.privacyEventId}. Queued artifacts: ${payload.queuedArtifacts}.`
    );
    setOrder(null);
    setOrderStatus(null);
    setBookPayload(null);
    setCheckoutUrl(null);
    setDownloadUrl(null);
  };

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">AI Children's Book Builder</p>
        <h1>Calm, Personalized Bitcoin Stories</h1>
        <p className="sub">No child photo upload. Parent-only account. Montessori-leaning visual style.</p>
      </header>

      <main className="grid">
        <section className="card">
          <h2>1. Parent Login</h2>
          <label>Email</label>
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="parent@example.com" />
          <button onClick={requestLink}>Send magic link</button>
          <p className="hint">{linkStatus}</p>
          <p className="hint">{verifyStatus}</p>
          <p className="hint">Auth: {token ? "signed in" : "signed out"}</p>
          <p className="hint">Privacy: we collect parent email + child first name/age only. No child photos.</p>
        </section>

        <section className="card">
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
          <select
            value={readingProfileId}
            onChange={(event) => setReadingProfileId(event.target.value as ReadingProfile)}
          >
            <option value="read_aloud_3_4">Read-aloud (3-4)</option>
            <option value="early_decoder_5_7">Early decoder (5-7)</option>
            {enableIndependent8To10 ? <option value="independent_8_10">Independent (8-10)</option> : null}
          </select>

          <button onClick={createOrder}>Create order</button>
          <button onClick={startCheckout} disabled={!orderStatus?.orderId && !order?.orderId}>
            Create checkout session
          </button>
          <button onClick={fallbackMarkPaid} disabled={!orderStatus?.orderId && !order?.orderId}>
            Fallback mark paid
          </button>

          {checkoutUrl && (
            <p className="hint">
              Checkout URL: <a href={checkoutUrl}>Open Stripe Checkout</a>
            </p>
          )}

          {orderStatus && (
            <div className="status">
              <p>Order: {orderStatus.orderId}</p>
              <p>Status: {orderStatus.status}</p>
              <p>Book: {orderStatus.bookId}</p>
              <p>Book status: {orderStatus.bookStatus}</p>
              <p>Child profile: {orderStatus.childProfileId}</p>
            </div>
          )}

          {orderStatus?.bookStatus === "failed" && (
            <p className="hint">Build failed. Check logs/alarms and retry with a new order.</p>
          )}
          {orderStatus?.bookStatus === "needs_review" && (
            <p className="hint">This book was flagged for manual review and is blocked from release.</p>
          )}
        </section>

        <section className="card full">
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

          {privacyStatus && <p className="hint">{privacyStatus}</p>}

          {bookPayload && (
            <>
              <div className="button-row">
                <button onClick={() => setShowTranscript((current) => !current)}>
                  {showTranscript ? "Hide text" : "Show text"}
                </button>
              </div>
              <div className="pages">
                {bookPayload.pages.map((page) => {
                  const previewUrl = page.previewImageUrl ?? page.imageUrl;
                  return (
                    <article key={page.pageIndex} className="page-card">
                      <h3>Page {page.pageIndex + 1}</h3>
                      {previewUrl ? <img src={previewUrl} alt={`Page ${page.pageIndex + 1}`} /> : <p>No page preview yet</p>}
                      {showTranscript ? <p>{page.text}</p> : null}
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {downloadUrl && (
            <p>
              PDF: <a href={downloadUrl}>Download</a>
            </p>
          )}

          {error && <p className="error">{error}</p>}
        </section>
      </main>
    </div>
  );
}
