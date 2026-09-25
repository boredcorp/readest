export interface CloudLease {
  readonly subject: string;
  readonly ownerKey: string;
  readonly epoch: number;
  readonly signal: AbortSignal;
}

type CloudSession = { subject: string; token: string };
let session: CloudSession | null = null;
let epoch = 0;
let controller = new AbortController();
let ownerKey: string | null = null;
const listeners = new Set<() => void>();

/** Called with subject and token from one auth notification, never separate lookups. */
export function publishCloudSession(next: CloudSession | null): void {
  if (session?.subject === next?.subject) {
    session = next;
    return;
  }
  controller.abort();
  controller = new AbortController();
  epoch += 1;
  ownerKey = null;
  session = next;
  for (const listener of listeners) listener();
}

export function subscribeCloudSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function cloudSessionEpoch(): number {
  return epoch;
}
export function activeCloudOwnerKey(): string | null {
  return ownerKey;
}
export function hasCloudSession(): boolean {
  return session !== null;
}

export async function captureCloudLease(): Promise<CloudLease> {
  const captured = session;
  const capturedEpoch = epoch;
  const signal = controller.signal;
  if (!captured) throw new Error('Sign in to use the cloud library');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`storybored-ordinary-cloud-v1:${captured.subject}`),
  );
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  const lease = { subject: captured.subject, ownerKey: key, epoch: capturedEpoch, signal };
  assertCloudLease(lease);
  ownerKey = key;
  return lease;
}

export function assertCloudLease(lease: CloudLease): void {
  if (lease.signal.aborted || lease.epoch !== epoch || session?.subject !== lease.subject) {
    throw new DOMException('Cloud library account changed', 'AbortError');
  }
}

export function cloudAuthSnapshot(lease: CloudLease): CloudSession {
  assertCloudLease(lease);
  return { subject: session!.subject, token: session!.token };
}

export function assertCloudOrigin(origin?: {
  kind: string;
  ownerKey?: string;
  epoch?: number;
}): void {
  if (
    origin?.kind === 'cloud' &&
    (origin.ownerKey !== ownerKey || origin.epoch !== epoch || !session)
  ) {
    throw new DOMException('Cloud library account changed', 'AbortError');
  }
}

export function isCurrentCloudOrigin(origin?: {
  kind: string;
  ownerKey?: string;
  epoch?: number;
}): boolean {
  try {
    assertCloudOrigin(origin);
    return true;
  } catch {
    return false;
  }
}
