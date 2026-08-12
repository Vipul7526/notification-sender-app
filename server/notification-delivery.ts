type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
};

type ExpoPushResponse = {
  data?: Array<{ status?: "ok" | "error"; message?: string }>;
};

export async function sendExpoPushMessages(
  messages: ExpoPushMessage[],
): Promise<{ sent: number; failed: number }> {
  const validMessages = messages.filter((message) => /^ExponentPushToken\[.+\]$/.test(message.to));
  if (validMessages.length === 0) return { sent: 0, failed: 0 };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validMessages),
    });

    if (!response.ok) {
      return { sent: 0, failed: validMessages.length };
    }

    const payload = (await response.json()) as ExpoPushResponse;
    const results = payload.data ?? [];
    const sent = results.filter((item) => item.status === "ok").length;
    return { sent, failed: validMessages.length - sent };
  } catch {
    return { sent: 0, failed: validMessages.length };
  }
}
