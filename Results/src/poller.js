// Results/src/poller.js

import { allowedRedirectHost, extractLinks, screenTestMaterial } from "./source-policy.js";

function headerValue(headers, name) {
  return headers?.get?.(name) || null;
}

async function readBodyLimited(response, maxBytes) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("response too large");
      throw new Error(`Response exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function isTextContent(contentType) {
  const value = String(contentType || "").toLowerCase();
  return value.includes("text/") || value.includes("html") || value.includes("json") || value.includes("xml") || value.includes("csv");
}

async function fetchWithValidatedRedirects(url, options, additionalAllowedHosts, fetchImpl) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const response = await fetchImpl(currentUrl, { ...options, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: currentUrl };
    }
    const location = response.headers.get("location");
    if (!location) throw new Error(`Redirect ${response.status} did not provide a Location header`);
    const nextUrl = new URL(location, currentUrl).href;
    if (!allowedRedirectHost(url, nextUrl, additionalAllowedHosts)) {
      throw new Error(`Redirect target host is not allowlisted: ${new URL(nextUrl).hostname}`);
    }
    currentUrl = nextUrl;
  }
  throw new Error("Source exceeded the redirect limit");
}

export async function inspectSource({ source, previousCheck, electionYear, config, fetchImpl = fetch, now = new Date() }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("source timeout"), config.fetchTimeoutMs);
  const headers = new Headers({
    Accept: "text/html,application/xhtml+xml,application/json,text/csv,application/xml,application/pdf,application/octet-stream;q=0.8,*/*;q=0.5",
    "User-Agent": config.userAgent,
  });
  if (previousCheck?.etag) headers.set("If-None-Match", previousCheck.etag);
  if (previousCheck?.last_modified) headers.set("If-Modified-Since", previousCheck.last_modified);

  try {
    const { response, finalUrl } = await fetchWithValidatedRedirects(
      source.endpoint_url,
      { method: "GET", headers, signal: controller.signal },
      config.additionalAllowedHosts,
      fetchImpl,
    );
    const contentType = headerValue(response.headers, "content-type");
    const declaredLength = Number(headerValue(response.headers, "content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > config.maxResponseBytes) {
      throw new Error(`Declared Content-Length exceeded ${config.maxResponseBytes} bytes`);
    }

    if (response.status === 304) {
      return {
        check: {
          checkedAt: now.toISOString(),
          httpStatus: 304,
          redirectTo: finalUrl === source.endpoint_url ? null : finalUrl,
          contentType,
          contentLength: null,
          etag: headerValue(response.headers, "etag") || previousCheck?.etag || null,
          lastModified: headerValue(response.headers, "last-modified") || previousCheck?.last_modified || null,
          sha256: previousCheck?.sha256 || null,
          screenResult: "unknown",
          errorMessage: null,
        },
        discoveries: [],
        changed: false,
      };
    }

    const bytes = await readBodyLimited(response, config.maxResponseBytes);
    const digest = bytes.byteLength > 0 ? await sha256Hex(bytes) : null;
    const text = isTextContent(contentType) ? new TextDecoder("utf-8", { fatal: false }).decode(bytes) : "";
    const isLandingPage = source.source_role === "landing_page";
    const screenResult = isLandingPage ? "clean" : screenTestMaterial({ url: finalUrl, text });
    const discoveries = isLandingPage && response.ok && text
      ? extractLinks(text, finalUrl, electionYear)
      : [];

    return {
      check: {
        checkedAt: now.toISOString(),
        httpStatus: response.status,
        redirectTo: finalUrl === source.endpoint_url ? null : finalUrl,
        contentType,
        contentLength: bytes.byteLength,
        etag: headerValue(response.headers, "etag"),
        lastModified: headerValue(response.headers, "last-modified"),
        sha256: digest,
        screenResult,
        errorMessage: response.ok ? null : `HTTP ${response.status}`,
      },
      discoveries,
      changed: Boolean(digest && digest !== previousCheck?.sha256),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      check: {
        checkedAt: now.toISOString(),
        httpStatus: null,
        redirectTo: null,
        contentType: null,
        contentLength: null,
        etag: null,
        lastModified: null,
        sha256: null,
        screenResult: "unknown",
        errorMessage: message.slice(0, 1000),
      },
      discoveries: [],
      changed: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}
