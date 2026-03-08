import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  apiClient,
  type BookResponse,
  type CreateOrderResponse,
  type OrderResponse
} from "@/lib/api/client";
import { useSession } from "@/lib/session";
import { storageKeys, usePersistentState, usePersistentString } from "@/lib/storage";

export type ReadingProfile = "read_aloud_3_4" | "early_decoder_5_7" | "independent_8_10";
export type LessonKey = "inflation_candy" | "saving_later" | "delayed_gratification";

export interface ParentDraft {
  childFirstName: string;
  pronouns: string;
  ageYears: number;
  moneyLessonKey: LessonKey;
  interestTags: string;
  readingProfileId: ReadingProfile;
}

export interface FlowBanner {
  tone: "success" | "info" | "error";
  title: string;
  message: string;
}

interface ParentFlowContextValue {
  draft: ParentDraft;
  updateDraft: <K extends keyof ParentDraft>(key: K, value: ParentDraft[K]) => void;
  order: CreateOrderResponse | null;
  orderStatus: OrderResponse | null;
  bookPayload: BookResponse | null;
  checkoutUrl: string | null;
  downloadUrl: string | null;
  error: string | null;
  privacyStatus: string;
  banner: FlowBanner | null;
  hasActiveOrder: boolean;
  hasActiveBook: boolean;
  clearError: () => void;
  clearBanner: () => void;
  setBanner: (banner: FlowBanner | null) => void;
  clearFlowState: () => void;
  createOrder: () => Promise<CreateOrderResponse | null>;
  refreshOrder: () => Promise<OrderResponse | null>;
  startCheckout: () => Promise<string | null>;
  fallbackMarkPaid: () => Promise<void>;
  loadBook: () => Promise<void>;
  loadDownload: () => Promise<void>;
  deleteChildProfile: () => Promise<void>;
}

const defaultDraft: ParentDraft = {
  childFirstName: "Mia",
  pronouns: "she/her",
  ageYears: 6,
  moneyLessonKey: "saving_later",
  interestTags: "baking,forest,bikes",
  readingProfileId: "early_decoder_5_7"
};

const ParentFlowContext = createContext<ParentFlowContextValue | null>(null);

export function ParentFlowProvider({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  const [draft, setDraft] = useState<ParentDraft>(defaultDraft);
  const [order, setOrder] = usePersistentState<CreateOrderResponse>(storageKeys.activeOrder, null);
  const [orderStatus, setOrderStatus] = usePersistentState<OrderResponse>(storageKeys.activeOrderStatus, null);
  const [bookPayload, setBookPayload] = usePersistentState<BookResponse>(storageKeys.activeBookPayload, null);
  const [checkoutUrl, setCheckoutUrl] = usePersistentString(storageKeys.activeCheckoutUrl);
  const [downloadUrl, setDownloadUrl] = usePersistentString(storageKeys.activeDownloadUrl);
  const [error, setError] = useState<string | null>(null);
  const [privacyStatus, setPrivacyStatus] = useState("");
  const [banner, setBanner] = useState<FlowBanner | null>(null);

  const activeOrderId = orderStatus?.orderId ?? order?.orderId ?? null;
  const activeBookId = orderStatus?.bookId ?? order?.bookId ?? null;
  const hasActiveOrder = Boolean(activeOrderId);
  const hasActiveBook = Boolean(activeBookId);

  useEffect(() => {
    if (token || !hasActiveOrder) {
      return;
    }

    setOrder(null);
    setOrderStatus(null);
    setBookPayload(null);
    setCheckoutUrl(null);
    setDownloadUrl(null);
  }, [hasActiveOrder, setBookPayload, setCheckoutUrl, setDownloadUrl, setOrder, setOrderStatus, token]);

  useEffect(() => {
    if (!token || !activeOrderId) {
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
  }, [activeOrderId, setOrderStatus, token]);

  useEffect(() => {
    if (!orderStatus || !token) {
      return;
    }

    const terminalStatuses = new Set(["ready", "failed", "needs_review"]);
    if (terminalStatuses.has(orderStatus.bookStatus)) {
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

  const value = useMemo<ParentFlowContextValue>(
    () => ({
      draft,
      updateDraft: (key, value) => {
        setDraft((current) => ({
          ...current,
          [key]: value
        }));
      },
      order,
      orderStatus,
      bookPayload,
      checkoutUrl,
      downloadUrl,
      error,
      privacyStatus,
      banner,
      hasActiveOrder,
      hasActiveBook,
      clearError: () => setError(null),
      clearBanner: () => setBanner(null),
      setBanner,
      clearFlowState: () => {
        setOrder(null);
        setOrderStatus(null);
        setBookPayload(null);
        setCheckoutUrl(null);
        setDownloadUrl(null);
        setPrivacyStatus("");
        setError(null);
        setBanner(null);
      },
      createOrder: async () => {
        if (!token) {
          setError("Sign in first");
          return null;
        }

        setError(null);
        setPrivacyStatus("");

        try {
          const payload = await apiClient.createOrder(token, {
            childFirstName: draft.childFirstName,
            pronouns: draft.pronouns,
            ageYears: draft.ageYears,
            moneyLessonKey: draft.moneyLessonKey,
            interestTags: draft.interestTags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            readingProfileId: draft.readingProfileId
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
          return payload;
        } catch (apiError) {
          setError(apiError instanceof Error ? apiError.message : "Unable to create order");
          return null;
        }
      },
      refreshOrder: async () => {
        if (!token || !activeOrderId) {
          return null;
        }

        try {
          const payload = await apiClient.getOrder(token, activeOrderId);
          setOrderStatus(payload);
          return payload;
        } catch (apiError) {
          setError(apiError instanceof Error ? apiError.message : "Unable to load order status");
          return null;
        }
      },
      startCheckout: async () => {
        if (!token || !activeOrderId) {
          setError("Create an order before starting checkout");
          return null;
        }

        try {
          const payload = await apiClient.checkoutOrder(token, activeOrderId);
          setCheckoutUrl(payload.checkoutUrl ?? null);
          const freshStatus = await apiClient.getOrder(token, activeOrderId);
          setOrderStatus(freshStatus);
          return payload.checkoutUrl ?? null;
        } catch (apiError) {
          setError(apiError instanceof Error ? apiError.message : "Unable to create checkout session");
          return null;
        }
      },
      fallbackMarkPaid: async () => {
        if (!token || !activeOrderId) {
          setError("Create an order before marking it paid");
          return;
        }

        try {
          await apiClient.markPaid(token, activeOrderId);
          const freshStatus = await apiClient.getOrder(token, activeOrderId);
          setOrderStatus(freshStatus);
        } catch (apiError) {
          setError(apiError instanceof Error ? apiError.message : "Unable to mark order paid");
        }
      },
      loadBook: async () => {
        if (!token || !activeBookId) {
          setError("No active book is available yet");
          return;
        }

        try {
          const payload = await apiClient.getBook(token, activeBookId);
          setBookPayload(payload);
        } catch (apiError) {
          setError(apiError instanceof Error ? apiError.message : "Unable to load book");
        }
      },
      loadDownload: async () => {
        if (!token || !activeBookId) {
          setError("No active book is available yet");
          return;
        }

        try {
          const payload = await apiClient.getBookDownload(token, activeBookId);
          setDownloadUrl(payload.url);
        } catch (apiError) {
          setError(apiError instanceof Error ? apiError.message : "Unable to get PDF link");
        }
      },
      deleteChildProfile: async () => {
        if (!token || !orderStatus?.childProfileId) {
          setError("Nothing to delete yet");
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
      }
    }),
    [
      activeBookId,
      activeOrderId,
      banner,
      bookPayload,
      checkoutUrl,
      downloadUrl,
      draft,
      error,
      hasActiveBook,
      hasActiveOrder,
      order,
      orderStatus,
      privacyStatus,
      setBookPayload,
      setCheckoutUrl,
      setDownloadUrl,
      setOrder,
      setOrderStatus,
      token
    ]
  );

  return <ParentFlowContext.Provider value={value}>{children}</ParentFlowContext.Provider>;
}

export function useParentFlow() {
  const context = useContext(ParentFlowContext);
  if (!context) {
    throw new Error("useParentFlow must be used inside ParentFlowProvider");
  }

  return context;
}
