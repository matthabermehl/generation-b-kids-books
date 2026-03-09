import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  apiClient,
  type BookResponse,
  type CreateOrderResponse,
  type OrderResponse
} from "@/lib/api/client";
import { sanitizeBookPayload, toSafeAssetUrl, toSafeCheckoutUrl } from "@/lib/safe-url";
import { useSession } from "@/lib/session";
import { storageKeys, usePersistentState, usePersistentString } from "@/lib/storage";

export const readingProfileOptions = [
  { value: "read_aloud_3_4", label: "Read-aloud (3-4)", minAge: 3, maxAge: 4 },
  { value: "early_decoder_5_7", label: "Early decoder (5-7)", minAge: 5, maxAge: 7 }
] as const;

export type ReadingProfile = (typeof readingProfileOptions)[number]["value"];
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

function readingProfileConfig(readingProfileId: ReadingProfile) {
  return readingProfileOptions.find((option) => option.value === readingProfileId) ?? readingProfileOptions[0];
}

export function validateAgeYears(ageYears: number, readingProfileId: ReadingProfile) {
  const { minAge, maxAge } = readingProfileConfig(readingProfileId);

  if (!Number.isInteger(ageYears)) {
    return `Enter an age between ${minAge} and ${maxAge}.`;
  }

  if (ageYears < minAge || ageYears > maxAge) {
    return `${readingProfileConfig(readingProfileId).label} only supports ages ${minAge}-${maxAge}.`;
  }

  return null;
}

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
  const safeCheckoutUrl = useMemo(() => toSafeCheckoutUrl(checkoutUrl), [checkoutUrl]);
  const safeDownloadUrl = useMemo(() => toSafeAssetUrl(downloadUrl), [downloadUrl]);
  const safeBookPayload = useMemo(() => (bookPayload ? sanitizeBookPayload(bookPayload) : null), [bookPayload]);

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
    if (checkoutUrl && !safeCheckoutUrl) {
      setCheckoutUrl(null);
    }
  }, [checkoutUrl, safeCheckoutUrl, setCheckoutUrl]);

  useEffect(() => {
    if (downloadUrl && !safeDownloadUrl) {
      setDownloadUrl(null);
    }
  }, [downloadUrl, safeDownloadUrl, setDownloadUrl]);

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
      bookPayload: safeBookPayload,
      checkoutUrl: safeCheckoutUrl,
      downloadUrl: safeDownloadUrl,
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

        const ageError = validateAgeYears(draft.ageYears, draft.readingProfileId);
        if (ageError) {
          setError(ageError);
          return null;
        }

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
          const safeUrl = toSafeCheckoutUrl(payload.checkoutUrl);
          if (payload.checkoutUrl && !safeUrl) {
            setCheckoutUrl(null);
            setError("Received an invalid checkout URL");
            return null;
          }

          setCheckoutUrl(safeUrl);
          const freshStatus = await apiClient.getOrder(token, activeOrderId);
          setOrderStatus(freshStatus);
          return safeUrl;
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
          setBookPayload(sanitizeBookPayload(payload));
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
          const safeUrl = toSafeAssetUrl(payload.url);
          if (payload.url && !safeUrl) {
            setDownloadUrl(null);
            setError("Received an invalid download URL");
            return;
          }

          setDownloadUrl(safeUrl);
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
      safeBookPayload,
      safeCheckoutUrl,
      safeDownloadUrl,
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
