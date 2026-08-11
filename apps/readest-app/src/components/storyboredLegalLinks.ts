export interface StoryBoredLegalLinks {
  termsUrl: string;
  privacyUrl: string;
}

const isLoopbackHostname = (hostname: string) =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]';

export const getStoryBoredLegalLinks = (
  marketplaceUrl: string | undefined,
): StoryBoredLegalLinks | undefined => {
  if (!marketplaceUrl) return undefined;

  try {
    const url = new URL(marketplaceUrl);
    const isHttps = url.protocol === 'https:';
    const isLoopbackHttp = url.protocol === 'http:' && isLoopbackHostname(url.hostname);

    if ((!isHttps && !isLoopbackHttp) || url.username || url.password || url.search || url.hash) {
      return undefined;
    }

    return {
      termsUrl: `${url.origin}/terms`,
      privacyUrl: `${url.origin}/privacy`,
    };
  } catch {
    return undefined;
  }
};
