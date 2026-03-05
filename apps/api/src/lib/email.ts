import { z } from "zod";
import { redactText } from "./log-redaction.js";
import { getRuntimeConfig } from "./ssm-config.js";

const sendgridEndpoint = "https://api.sendgrid.com/v3/mail/send";
const fromEmailSchema = z
  .string()
  .email()
  .refine((value) => {
    const domain = value.split("@")[1] ?? "";
    return domain.includes(".");
  }, "SENDGRID_FROM_EMAIL must use a valid domain");

export async function sendLoginLink(email: string, link: string): Promise<void> {
  const config = await getRuntimeConfig();
  const apiKey = config.secrets.sendgridApiKey;
  const fromEmail = fromEmailSchema.parse(config.sendgridFromEmail);

  const body = {
    personalizations: [
      {
        to: [{ email }],
        subject: "Your sign-in link"
      }
    ],
    from: { email: fromEmail },
    content: [
      {
        type: "text/plain",
        value: `Click to sign in: ${link}`
      }
    ]
  };

  const response = await fetch(sendgridEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("SENDGRID_DELIVERY_FAILURE", {
      status: response.status,
      toEmail: email,
      fromEmail,
      responseSnippet: redactText(text.slice(0, 512))
    });
    throw new Error(`SendGrid send failed: ${response.status} ${redactText(text)}`);
  }
}
