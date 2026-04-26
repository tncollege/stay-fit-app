export interface ApiErrorPayload {
  error?: string;
  message?: string;
}

export class ApiClientError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

function getApiUrl(path: string) {
  const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function postJson<TResponse, TBody extends Record<string, unknown>>(
  url: string,
  body: TBody,
): Promise<TResponse> {
  const response = await fetch(getApiUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload;
    throw new ApiClientError(
      errorPayload.message || errorPayload.error || "Request failed.",
      response.status,
      errorPayload.error,
    );
  }

  return payload as TResponse;
}
