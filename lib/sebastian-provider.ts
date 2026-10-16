export type SebastianProviderConfig = {
  baseUrl: string | null;
  modelId: string;
  token: string;
  error: string | null;
};

export function getSebastianProviderConfig(): SebastianProviderConfig {
  const raw = process.env.SEBASTIAN_MODEL_SERVER_URL?.trim();
  const modelId = process.env.SEBASTIAN_MODEL_ID?.trim() || "sebastian";
  const token = process.env.SEBASTIAN_MODEL_SERVER_TOKEN?.trim() || "";
  if (!raw) return { baseUrl: null, modelId, token, error: null };
  try {
    const url = new URL(raw);
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (!(["http:", "https:"].includes(url.protocol)) || (!local && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
      return { baseUrl: null, modelId, token, error: "SEBASTIAN_MODEL_SERVER_URL must be an HTTPS base URL (HTTP is allowed only for localhost during development), without credentials or query parameters." };
    }
    return { baseUrl: url.toString().replace(/\\/+$/, ""), modelId, token, error: null };
  } catch {
    return { baseUrl: null, modelId, token, error: "SEBASTIAN_MODEL_SERVER_URL is not a valid URL." };
  }
}

export function getSebastianProviderHeaders(config: SebastianProviderConfig): Record<string, string> {
  return config.token ? { Authorization: `Bearer ${config.token}` } : {};
}
