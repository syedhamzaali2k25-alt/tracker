export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * SendGrid's plain REST API — deliberately not the @sendgrid/mail SDK,
 * since a single JSON POST doesn't need a dependency for it. Requires only
 * Single Sender Verification (one "from" address confirmed by clicking a
 * link SendGrid emails to it) on the account, not a verified domain — see
 * README "Weekly margin alerts" for setup.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = requiredEnv("SENDGRID_API_KEY");
  const from = requiredEnv("EMAIL_FROM");

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: from },
      subject: message.subject,
      content: [
        { type: "text/plain", value: message.text },
        { type: "text/html", value: message.html },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid send failed (${response.status}): ${body}`);
  }
}
