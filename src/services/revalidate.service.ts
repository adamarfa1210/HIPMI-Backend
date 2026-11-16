export interface RevalidatePayload {
  secret: string;
  tags: string[];
  timestamp: number;
}

export class RevalidateService {
  /**
   * Triggers Next.js On-Demand ISR Revalidation via webhook.
   * Dispatches asynchronously in a non-blocking fire-and-forget pattern.
   */
  static triggerRevalidation(tags: string[]): Promise<boolean> {
    const publicWebUrl = process.env.PUBLIC_WEB_URL || "https://hipmipttelkom.vercel.app";
    const revalidateSecret = process.env.REVALIDATE_SECRET || "hipmi-secret-token-xyz-2026";
    const targetUrl = `${publicWebUrl.replace(/\/$/, "")}/api/revalidate`;

    const payload: RevalidatePayload = {
      secret: revalidateSecret,
      tags,
      timestamp: Date.now(),
    };

    // Return promise but catch errors so CMS mutations never fail if Next.js webhook is unavailable
    return fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": revalidateSecret,
      },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) {
          console.warn(`[RevalidateService] Webhook returned status ${res.status} for tags: ${tags.join(", ")}`);
          return false;
        }
        return true;
      })
      .catch((err) => {
        console.warn(`[RevalidateService] Failed to trigger revalidation for tags [${tags.join(", ")}]: ${err.message}`);
        return false;
      });
  }
}
