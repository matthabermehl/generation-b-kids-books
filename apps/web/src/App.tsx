import { useEffect, useMemo, useState } from "react";

type ReadingProfile = "read_aloud_3_4" | "early_decoder_5_7" | "independent_8_10";
type LessonKey = "inflation_candy" | "saving_later" | "delayed_gratification";

interface OrderResponse {
  orderId: string;
  bookId: string;
  status: string;
}

interface OrderStatus {
  orderId: string;
  status: string;
  bookId: string;
  bookStatus: string;
}

interface BookPayload {
  bookId: string;
  status: string;
  childFirstName: string;
  pages: Array<{
    pageIndex: number;
    text: string;
    status: string;
    imageUrl: string | null;
  }>;
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
const authTokenKey = "book-auth-token";

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

  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [bookPayload, setBookPayload] = useState<BookPayload | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verifyTokenFromUrl = useMemo(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get("token");
  }, []);

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
        localStorage.setItem(authTokenKey, payload.token);
        setToken(payload.token);
        setVerifyStatus("Email verified. You are signed in.");

        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("token");
        window.history.replaceState({}, "", cleanUrl.toString());
      } catch (err) {
        setVerifyStatus(err instanceof Error ? err.message : "Verification failed");
      }
    };

    void verify();
  }, [verifyTokenFromUrl]);

  useEffect(() => {
    if (!orderStatus || orderStatus.bookStatus === "ready" || !token) {
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
        interestTags: interestTags.split(",").map((tag) => tag.trim()).filter(Boolean),
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
      bookStatus: "draft"
    });
  };

  const startBuild = async () => {
    if (!token || !order) return;

    const response = await apiFetch(`/v1/orders/${order.orderId}/mark-paid`, {
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

    const statusResponse = await apiFetch(`/v1/orders/${order.orderId}`, {
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

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">AI Children&apos;s Book Builder</p>
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
            <option value="independent_8_10">Independent (8-10)</option>
          </select>

          <button onClick={createOrder}>Create order</button>
          <button onClick={startBuild} disabled={!order}>Mark paid + start build</button>

          {orderStatus && (
            <div className="status">
              <p>Order: {orderStatus.orderId}</p>
              <p>Status: {orderStatus.status}</p>
              <p>Book: {orderStatus.bookId}</p>
              <p>Book status: {orderStatus.bookStatus}</p>
            </div>
          )}
        </section>

        <section className="card full">
          <h2>3. Reader + Download</h2>
          <div className="button-row">
            <button onClick={loadBook} disabled={!orderStatus?.bookId}>Load book</button>
            <button onClick={loadDownload} disabled={!orderStatus?.bookId}>Get PDF link</button>
          </div>

          {bookPayload && (
            <div className="pages">
              {bookPayload.pages.map((page) => (
                <article key={page.pageIndex} className="page">
                  <h3>Page {page.pageIndex + 1}</h3>
                  <p>{page.text}</p>
                  {page.imageUrl ? (
                    <img src={page.imageUrl.replace("s3://", "https://")} alt={`Page ${page.pageIndex + 1} illustration`} />
                  ) : (
                    <p className="hint">Illustration pending...</p>
                  )}
                </article>
              ))}
            </div>
          )}

          {downloadUrl && (
            <p>
              PDF: <a href={downloadUrl} target="_blank" rel="noreferrer">Download generated PDF</a>
            </p>
          )}
        </section>
      </main>

      {error && <aside className="error">{error}</aside>}
    </div>
  );
}
