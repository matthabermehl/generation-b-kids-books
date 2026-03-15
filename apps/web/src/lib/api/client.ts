import type { components } from "./generated";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export type SessionResponse = components["schemas"]["SessionResponse"];
export type RequestLinkResponse = components["schemas"]["RequestLinkResponse"];
export type VerifyLinkResponse = components["schemas"]["VerifyLinkResponse"];
export type CreateOrderRequest = components["schemas"]["CreateOrderRequest"];
export type CreateOrderResponse = components["schemas"]["CreateOrderResponse"];
export type OrderResponse = components["schemas"]["OrderResponse"];
export type CheckoutResponse = components["schemas"]["CheckoutResponse"];
export type MarkPaidResponse = components["schemas"]["MarkPaidResponse"];
export type BookResponse = components["schemas"]["BookResponse"];
export type BookCharacterResponse = components["schemas"]["BookCharacterResponse"];
export type GenerateCharacterCandidateRequest = components["schemas"]["GenerateCharacterCandidateRequest"];
export type SelectCharacterRequest = components["schemas"]["SelectCharacterRequest"];
export type DownloadResponse = components["schemas"]["DownloadResponse"];
export type DeleteChildProfileResponse = components["schemas"]["DeleteChildProfileResponse"];
export type ReviewQueueResponse = components["schemas"]["ReviewQueueResponse"];
export type ReviewCaseDetailResponse = components["schemas"]["ReviewCaseDetailResponse"];
export type ReviewActionRequest = components["schemas"]["ReviewActionRequest"];
export type ReviewActionResponse = components["schemas"]["ReviewActionResponse"];

function authHeader(token: string | null): Record<string, string> {
  if (!token) {
    return {};
  }

  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : response.statusText || "Request failed";
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

export const apiClient = {
  requestLink(email: string) {
    return request<RequestLinkResponse>("/v1/auth/request-link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({ email })
    });
  },
  verifyLink(token: string) {
    return request<VerifyLinkResponse>("/v1/auth/verify-link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({ token })
    });
  },
  getSession(token: string) {
    return request<SessionResponse>("/v1/session", {
      headers: authHeader(token)
    });
  },
  createOrder(token: string, input: CreateOrderRequest) {
    return request<CreateOrderResponse>("/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        ...authHeader(token)
      },
      body: JSON.stringify(input)
    });
  },
  checkoutOrder(token: string, orderId: string) {
    return request<CheckoutResponse>(`/v1/orders/${orderId}/checkout`, {
      method: "POST",
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        ...authHeader(token)
      }
    });
  },
  markPaid(token: string, orderId: string, mockRunTag?: string | null) {
    return request<MarkPaidResponse>(`/v1/orders/${orderId}/mark-paid`, {
      method: "POST",
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        ...(mockRunTag ? { "X-Mock-Run-Tag": mockRunTag } : {}),
        ...authHeader(token)
      }
    });
  },
  getOrder(token: string, orderId: string) {
    return request<OrderResponse>(`/v1/orders/${orderId}`, {
      headers: authHeader(token)
    });
  },
  getBook(token: string, bookId: string) {
    return request<BookResponse>(`/v1/books/${bookId}`, {
      headers: authHeader(token)
    });
  },
  getBookCharacter(token: string, bookId: string) {
    return request<BookCharacterResponse>(`/v1/books/${bookId}/character`, {
      headers: authHeader(token)
    });
  },
  generateCharacterCandidate(token: string, bookId: string, body: GenerateCharacterCandidateRequest = {}) {
    return request<BookCharacterResponse>(`/v1/books/${bookId}/character/candidates`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader(token)
      },
      body: JSON.stringify(body)
    });
  },
  selectCharacterCandidate(token: string, bookId: string, body: SelectCharacterRequest) {
    return request<BookCharacterResponse>(`/v1/books/${bookId}/character/select`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader(token)
      },
      body: JSON.stringify(body)
    });
  },
  getBookDownload(token: string, bookId: string) {
    return request<DownloadResponse>(`/v1/books/${bookId}/download?format=pdf`, {
      headers: authHeader(token)
    });
  },
  deleteChildProfile(token: string, childProfileId: string) {
    return request<DeleteChildProfileResponse>(`/v1/child-profiles/${childProfileId}`, {
      method: "DELETE",
      headers: authHeader(token)
    });
  },
  listReviewCases(token: string, params: { status?: string; stage?: string; limit?: number } = {}) {
    const search = new URLSearchParams();
    if (params.status) {
      search.set("status", params.status);
    }
    if (params.stage) {
      search.set("stage", params.stage);
    }
    if (params.limit) {
      search.set("limit", String(params.limit));
    }
    const query = search.toString();
    return request<ReviewQueueResponse>(`/v1/review/cases${query ? `?${query}` : ""}`, {
      headers: authHeader(token)
    });
  },
  getReviewCase(token: string, caseId: string) {
    return request<ReviewCaseDetailResponse>(`/v1/review/cases/${caseId}`, {
      headers: authHeader(token)
    });
  },
  approveReviewCase(token: string, caseId: string, body: ReviewActionRequest = {}) {
    return request<ReviewActionResponse>(`/v1/review/cases/${caseId}/approve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader(token)
      },
      body: JSON.stringify(body)
    });
  },
  rejectReviewCase(token: string, caseId: string, body: ReviewActionRequest) {
    return request<ReviewActionResponse>(`/v1/review/cases/${caseId}/reject`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader(token)
      },
      body: JSON.stringify(body)
    });
  },
  retryReviewPage(token: string, caseId: string, pageId: string, body: ReviewActionRequest) {
    return request<ReviewActionResponse>(`/v1/review/cases/${caseId}/pages/${pageId}/retry`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader(token)
      },
      body: JSON.stringify(body)
    });
  }
};
