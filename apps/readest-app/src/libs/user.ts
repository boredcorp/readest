const DEFAULT_STORYBORED_SITE_URL = 'https://storybored.com/';

export function getAccountDeletionUrl(
  siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] ?? DEFAULT_STORYBORED_SITE_URL,
): string {
  const configuredUrl = new URL(siteUrl);
  if (
    (configuredUrl.protocol !== 'https:' && configuredUrl.protocol !== 'http:') ||
    configuredUrl.username ||
    configuredUrl.password
  ) {
    throw new Error('StoryBored site URL must be an HTTP(S) origin without credentials');
  }

  return new URL('/account', configuredUrl.origin).toString();
}

export function openAccountDeletion(): void {
  window.location.assign(getAccountDeletionUrl());
}
