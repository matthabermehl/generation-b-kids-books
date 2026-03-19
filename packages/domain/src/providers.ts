import type {
  BeatSheet,
  CreateOrderInput,
  StoryConcept,
  StoryDraftOptions,
  StoryCriticVerdict,
  StoryPackage
} from "./types.js";
import type { MoneyLessonKey, ReadingProfile } from "./enums.js";

export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface LlmCallMetadata {
  provider: "mock" | "openai" | "anthropic";
  model: string;
  latencyMs: number;
  usage: ProviderUsage | null;
}

export interface ImageCallMetadata {
  provider: "mock" | "openai";
  endpoint: string;
  requestId?: string;
  width?: number;
  height?: number;
  latencyMs: number;
}

export interface StoryGenerationContext {
  bookId: string;
  childFirstName: string;
  pronouns: string;
  ageYears: number;
  lesson: MoneyLessonKey;
  interests: string[];
  profile: ReadingProfile;
  pageCount: number;
}

export interface LlmProviderContract {
  generateStoryConcept(context: StoryGenerationContext): Promise<{ concept: StoryConcept; meta: LlmCallMetadata }>;
  generateBeatSheet(
    context: StoryGenerationContext,
    concept: StoryConcept
  ): Promise<{ beatSheet: BeatSheet; meta: LlmCallMetadata }>;
  reviseBeatSheet(
    context: StoryGenerationContext,
    concept: StoryConcept,
    beatSheet: BeatSheet,
    rewriteInstructions: string
  ): Promise<{ beatSheet: BeatSheet; meta: LlmCallMetadata }>;
  draftPages(
    context: StoryGenerationContext,
    concept: StoryConcept,
    beatSheet: BeatSheet,
    options?: StoryDraftOptions
  ): Promise<{ story: StoryPackage; meta: LlmCallMetadata }>;
  critic(
    context: StoryGenerationContext,
    concept: StoryConcept,
    story: StoryPackage
  ): Promise<{ verdict: StoryCriticVerdict; meta: LlmCallMetadata }>;
}

export interface ImageProviderContract {
  generateCharacterSheet(input: {
    bookId: string;
    prompt: string;
    seed?: number;
  }): Promise<{ s3Url: string; seed: number; meta: ImageCallMetadata }>;
  generatePageImage(input: {
    bookId: string;
    pageIndex: number;
    prompt: string;
    seed: number;
  }): Promise<{ s3Url: string; seed: number; qaPassed: boolean; issues: string[]; meta: ImageCallMetadata }>;
}

export interface RendererContract {
  renderPdf(input: {
    bookId: string;
    title: string;
    pages: Array<{ index: number; text: string; imageS3Url: string }>;
    outputKey: string;
  }): Promise<{ outputS3Url: string }>;
}

export interface EmailProviderContract {
  sendLoginLink(input: { toEmail: string; link: string; expiresInMinutes: number }): Promise<{ sent: boolean }>;
}

export interface PaymentProviderContract {
  createCheckout(input: {
    orderId: string;
    amountCents: number;
    currency: string;
    returnUrl: string;
  }): Promise<{ checkoutUrl: string; providerSessionId: string }>;
  confirmPaid(input: { orderId: string; providerEventId?: string }): Promise<{ paid: boolean }>;
}

export type PublicApiContracts = {
  createOrder: CreateOrderInput;
};
