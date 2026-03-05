import { optionalEnv } from "./env.js";

const sendgridEndpoint = "https://api.sendgrid.com/v3/mail/send";

export async function sendLoginLink(email: string, link: string): Promise<void> {
  const apiKey = optionalEnv("SENDGRID_API_KEY");
  const fromEmail = optionalEnv("SENDGRID_FROM_EMAIL", "noreply@example.com");

  if (!apiKey) {
    console.log(`SENDGRID_API_KEY missing; login link for ${email}: ${link}`);
    return;
  }

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
    throw new Error(`SendGrid send failed: ${response.status} ${text}`);
  }
}
