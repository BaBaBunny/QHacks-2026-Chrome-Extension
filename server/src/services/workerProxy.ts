const DEFAULT_WORKER_URL = "http://localhost:3002";

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function withHostname(baseUrl: string, hostname: string): string | null {
  try {
    const parsed = new URL(baseUrl);
    parsed.hostname = hostname;
    return normalizeBase(parsed.toString());
  } catch {
    return null;
  }
}

export function getWorkerBaseUrls(configuredUrl = process.env.WORKER_URL || DEFAULT_WORKER_URL): string[] {
  const normalized = normalizeBase(configuredUrl || DEFAULT_WORKER_URL);
  const candidates = [normalized];

  const localhostVariant = withHostname(normalized, "localhost");
  const loopbackVariant = withHostname(normalized, "127.0.0.1");

  if (localhostVariant) candidates.push(localhostVariant);
  if (loopbackVariant) candidates.push(loopbackVariant);

  return dedupe(candidates);
}

export function getWorkerEndpointUrls(path: string): string[] {
  const endpoint = path.startsWith("/") ? path : `/${path}`;
  const urls: string[] = [];

  for (const base of getWorkerBaseUrls()) {
    urls.push(`${base}${endpoint}`);
    urls.push(`${base}/api${endpoint}`);
  }

  return dedupe(urls);
}
