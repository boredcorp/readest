import { getAccessToken } from './access';
import { assertCloudLease, cloudAuthSnapshot, type CloudLease } from '@/services/cloudOwnerSession';

export const fetchWithTimeout = (url: string, options: RequestInit = {}, timeout = 10000) => {
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const id = setTimeout(() => controller.abort('Request timed out'), timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(id);
    options.signal?.removeEventListener('abort', cancel);
  });
};

export const fetchWithAuth = async (url: string, options: RequestInit, lease?: CloudLease) => {
  const token = lease ? cloudAuthSnapshot(lease).token : await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
  };

  if (lease) assertCloudLease(lease);
  const response = await fetch(url, {
    ...options,
    headers,
    ...(lease ? { signal: lease.signal } : {}),
  });
  if (lease) assertCloudLease(lease);

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Error:', errorData.error || response.statusText);
    throw new Error(errorData.error || 'Request failed');
  }

  return response;
};
