/**
 * Shared network observer for MAIN-world hooks. Wraps fetch and XHR,
 * *reads* matching responses (cloned) and never alters requests or responses.
 */
export interface Observed {
  url: string;
  method: string;
  requestBody: unknown;
  responseBody: unknown;
  status: number;
}

export function installNetworkObserver(match: (url: string, method: string) => boolean, onObserved: (o: Observed) => void) {
  const w = window as Window & { __codesyncHooked?: boolean };
  if (w.__codesyncHooked) return;
  w.__codesyncHooked = true;

  const origFetch = window.fetch;
  window.fetch = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    let url = '';
    let method = 'GET';
    let bodyPromise: Promise<unknown> | null = null;
    try {
      url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href).href;
      method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (match(url, method)) {
        // Libraries such as Redux Toolkit (used by GeeksforGeeks) call fetch(new Request(url, { body }))
        // with no init — the body lives inside the Request. Clone it *before* fetch consumes it.
        bodyPromise =
          init?.body !== undefined && init?.body !== null
            ? Promise.resolve(init.body)
            : input instanceof Request
              ? input.clone().text().catch(() => null)
              : Promise.resolve(null);
      }
    } catch {
      bodyPromise = null; // observation must never break the page
    }
    const res = await origFetch.call(this, input, init);
    if (bodyPromise) {
      const status = res.status;
      Promise.all([bodyPromise, res.clone().json()]).then(
        ([requestBody, json]) => onObserved({ url, method, requestBody, responseBody: json, status }),
        () => undefined,
      );
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const meta = new WeakMap<XMLHttpRequest, { url: string; method: string }>();
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    try {
      meta.set(this, { url: new URL(String(url), location.href).href, method: method.toUpperCase() });
    } catch {
      /* ignore */
    }
    return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const m = meta.get(this);
    if (m && match(m.url, m.method)) {
      this.addEventListener('load', () => {
        try {
          const json = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          onObserved({ url: m.url, method: m.method, requestBody: body ?? null, responseBody: json, status: this.status });
        } catch {
          /* non-JSON */
        }
      });
    }
    return origSend.call(this, body);
  };
}

/** Best-effort parse of a request body (JSON string, URL-encoded string, FormData, URLSearchParams). */
export function readField(body: unknown, field: string): string | null {
  try {
    if (body instanceof FormData || body instanceof URLSearchParams) {
      const v = body.get(field);
      return typeof v === 'string' ? v : null;
    }
    if (typeof body === 'string') {
      try {
        const j = JSON.parse(body) as Record<string, unknown>;
        const v = j[field];
        return v === undefined || v === null ? null : String(v);
      } catch {
        return new URLSearchParams(body).get(field);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
