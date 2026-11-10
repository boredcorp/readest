/** Carry the browser Access session only to this configured service origin. */
export function createBrowserAccessFetch(
  serviceUrl: string,
  fetchImplementation: typeof fetch = globalThis.fetch,
): typeof fetch {
  const serviceOrigin = new URL(serviceUrl).origin;

  return (input, init) => {
    if (typeof window === 'undefined') {
      return fetchImplementation.call(globalThis, input, init);
    }

    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input.toString() : input.url,
      window.location.href,
    );
    if (url.origin !== serviceOrigin) {
      return fetchImplementation.call(globalThis, input, init);
    }

    // An expired Access session must fail rather than follow its login redirect
    // with the application's Bearer token, body or other protected request data.
    return fetchImplementation.call(globalThis, input, {
      ...init,
      credentials: 'include',
      redirect: 'error',
    });
  };
}
