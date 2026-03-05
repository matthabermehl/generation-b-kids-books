import type { CreateOrderInput, StoryPackage } from "./types.js";
import type { MoneyLessonKey, ReadingProfile } from "./enums.js";

export interface StoryGenerationContext {
  bookId: string;
  childFirstName: string;
  ageYears: number;
  lesson: MoneyLessonKey;
  interests: string[];
  profile: ReadingProfile;
  pageCount: number;
}

export interface LlmProviderContract {
  generateBeatSheet(context: StoryGenerationContext): Promise<{ beats: string[] }>;
  draftPages(context: StoryGenerationContext, beats: string[]): Promise<StoryPackage>;
  critic(context: StoryGenerationContext, story: StoryPackage): Promise<{ ok: boolean; notes: string[] }>;
}

export interface ImageProviderContract {
  generateCharacterSheet(input: {
    bookId: string;
    prompt: string;
    seed?: number;
  }): Promise<{ s3Url: string; seed: number }>;
  generatePageImage(input: {
    bookId: string;
    pageIndex: number;
    prompt: string;
    seed: number;
  }): Promise<{ s3Url: string; seed: number; qaPassed: boolean; issues: string[] }>;
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
