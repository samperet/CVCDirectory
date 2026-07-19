/**
 * Magic-link delivery. Uses Resend when RESEND_API_KEY is configured. When it
 * is not (local development, preview deployments), callers fall back to
 * returning the link directly so the flow can still be exercised.
 */

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendMagicLinkEmail(to: string, name: string, verifyUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email delivery is not configured");
  const from = process.env.EMAIL_FROM ?? "CVC Directory <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Verify your CVC Directory account",
      text: [
        `Hi ${name},`,
        "",
        "Click the link below to verify your CVC Directory account. Verified members get a badge next to their name.",
        "",
        verifyUrl,
        "",
        "This link expires in 30 minutes. If you didn't request it, you can ignore this email.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to send verification email: ${response.status} ${detail}`);
  }
}
