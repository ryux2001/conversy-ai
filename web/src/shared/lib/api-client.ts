const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api").replace(/\/+$/, "");

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function postJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiRequestError("NETWORK_ERROR", "NETWORK_ERROR");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorPayload = typeof payload === "object" && payload !== null
      ? payload as { message?: unknown; code?: unknown }
      : {};
    const message = errorPayload.message;
    throw new ApiRequestError(
      Array.isArray(message)
        ? message.join(" ")
        : typeof message === "string"
          ? message
          : `HTTP ${response.status}`,
      typeof errorPayload.code === "string" ? errorPayload.code : "UNKNOWN",
      response.status,
    );
  }

  return payload as T;
}
