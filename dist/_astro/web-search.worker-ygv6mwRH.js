function getCorsProxy() {
  return "https://aiproxy.inled.es/?url=";
}
async function fetchPage(url, options = {}) {
  const {
    maxSize = 500 * 1024,
    // 500KB por defecto
    timeout = 1e4,
    // 10s por defecto
    headers = {},
    followRedirects = true,
    maxRedirects = 3
  } = options;
  const startTime = Date.now();
  if (!isValidUrl(url)) {
    throw new Error(`Invalid URL: ${url}`);
  }
  const corsProxy = getCorsProxy();
  const fetchUrl = `${corsProxy}${encodeURIComponent(url)}` ;
  console.log(`[WebSearchWorker] Fetching: ${url} (proxy: ${ true})`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(fetchUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "EdgeAI/1.0 (Local Browser Agent; +https://github.com/InledGroup/Edge.AI)",
        ...headers
      },
      redirect: followRedirects ? "follow" : "manual"
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error(`Invalid content type: ${contentType}. Expected text/html.`);
    }
    const html = await readBodyWithLimit(response, maxSize);
    const responseHeaders = {
      contentType: response.headers.get("content-type") || void 0,
      lastModified: response.headers.get("last-modified") || void 0,
      etag: response.headers.get("etag") || void 0
    };
    const fetchTime = Date.now() - startTime;
    return {
      url: response.url,
      // URL final después de redirects
      html,
      size: html.length,
      status: response.status,
      fetchTime,
      headers: responseHeaders
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(`Fetch timeout after ${timeout}ms`);
      }
      throw error;
    }
    throw new Error(`Unknown fetch error: ${String(error)}`);
  }
}
async function fetchPages(urls, options = {}) {
  if (urls.length > 10) {
    throw new Error(`Too many URLs: ${urls.length}. Maximum is 10.`);
  }
  if (urls.length === 0) {
    return [];
  }
  const results = await Promise.allSettled(
    urls.map((url) => fetchPage(url, options))
  );
  const successfulPages = [];
  const failedUrls = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successfulPages.push(result.value);
    } else {
      failedUrls.push({
        url: urls[index],
        error: result.reason?.message || String(result.reason)
      });
    }
  });
  if (failedUrls.length > 0) {
    console.warn(`[WebSearchWorker] ${failedUrls.length} URLs failed to fetch:`, failedUrls);
  }
  return successfulPages;
}
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    const blacklist = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "10.",
      // Private network
      "172.16.",
      // Private network
      "192.168.",
      // Private network
      "169.254.169.254",
      // AWS metadata
      "metadata.google.internal"
      // GCP metadata
    ];
    const hostname = parsed.hostname.toLowerCase();
    if (blacklist.some((b) => hostname.includes(b))) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
async function readBodyWithLimit(response, maxSize) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }
  const chunks = [];
  let totalSize = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (totalSize > maxSize) {
        reader.cancel();
        throw new Error(
          `Response too large: ${totalSize} bytes (max: ${maxSize} bytes)`
        );
      }
      chunks.push(value);
    }
    const allChunks = new Uint8Array(totalSize);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(allChunks);
  } catch (error) {
    reader.cancel();
    throw error;
  }
}
self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  try {
    let result;
    switch (type) {
      case "fetch-page": {
        const { url, options } = payload;
        result = await fetchPage(url, options);
        break;
      }
      case "fetch-pages": {
        const { urls, options } = payload;
        result = await fetchPages(urls, options);
        break;
      }
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    self.postMessage({
      id,
      type: "success",
      payload: result
    });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
console.log("[WebSearchWorker] Initialized");
