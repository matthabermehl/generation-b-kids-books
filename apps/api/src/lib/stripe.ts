import Stripe from "stripe";
import { getRuntimeConfig } from "./ssm-config.js";

let cachedClient: Stripe | null = null;
let cachedKey = "";

async function stripeClient(): Promise<{ client: Stripe; config: Awaited<ReturnType<typeof getRuntimeConfig>> }> {
  const config = await getRuntimeConfig();
  const apiKey = config.secrets.stripeSecretKey;

  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new Stripe(apiKey);
    cachedKey = apiKey;
  }

  return { client: cachedClient, config };
}

export interface CreateStripeCheckoutInput {
  orderId: string;
  bookId: string;
  userId: string;
  customerEmail: string;
}

export async function createStripeCheckoutSession(input: CreateStripeCheckoutInput): Promise<{
  checkoutUrl: string;
  stripeSessionId: string;
}> {
  const { client, config } = await stripeClient();

  const session = await client.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price: config.stripe.priceId,
        quantity: 1
      }
    ],
    success_url: config.stripe.successUrl,
    cancel_url: config.stripe.cancelUrl,
    customer_email: input.customerEmail,
    metadata: {
      orderId: input.orderId,
      bookId: input.bookId,
      userId: input.userId
    }
  });

  if (!session.url || !session.id) {
    throw new Error("Stripe checkout session missing required URL or ID");
  }

  return {
    checkoutUrl: session.url,
    stripeSessionId: session.id
  };
}

export async function verifyStripeWebhook(body: string, signature: string): Promise<Stripe.Event> {
  const { client, config } = await stripeClient();
  return client.webhooks.constructEvent(body, signature, config.secrets.stripeWebhookSecret);
}
