import posthog, { type CaptureResult } from 'posthog-js';

export const TELEMETRY_OPT_OUT_KEY = 'readest-telemetry-opt-out';
export const REDACTED_TELEMETRY_VALUE = '[REDACTED]';
export const REDACTED_SIGNED_URL = '[REDACTED_SIGNED_URL]';

const SAFE_ERROR_MESSAGE = 'Reader error details redacted at the telemetry boundary.';
const CIRCULAR_VALUE = '[CIRCULAR]';
const MAX_DEPTH_VALUE = '[MAX_DEPTH]';
const TRUNCATED_VALUE = '[TRUNCATED]';
const UNSUPPORTED_VALUE = '[UNSUPPORTED]';
const MAX_DEPTH = 8;
const MAX_COLLECTION_SIZE = 100;
const MAX_STRING_LENGTH = 2_048;

const SENSITIVE_KEYS = new Set([
  'authorization',
  'bearer',
  'bearertoken',
  'body',
  'clientsecret',
  'content',
  'cookie',
  'credentials',
  'editedprompt',
  'error',
  'errormessage',
  'exception',
  'excerpt',
  'failurereason',
  'headers',
  'input',
  'instructions',
  'message',
  'output',
  'passage',
  'password',
  'passwd',
  'payload',
  'privatekey',
  'prompt',
  'promptbody',
  'promptcomposition',
  'prompttext',
  'provideroutput',
  'providerdata',
  'providerpayload',
  'providerrequest',
  'providerresponse',
  'proxyauthorization',
  'quote',
  'rawbody',
  'rawdata',
  'rawpayload',
  'rawrequest',
  'rawresponse',
  'requestbody',
  'request',
  'requestheaders',
  'responsebody',
  'response',
  'responseheaders',
  'secret',
  'selectedexcerpt',
  'selectedpassage',
  'selectedtext',
  'selection',
  'selectiontext',
  'setcookie',
  'stack',
  'stacktrace',
  'surroundingcontext',
  'systemprompt',
  'text',
  'userdirection',
  'userprompt',
]);

const SAFE_TOKEN_KEYS = new Set([
  'completiontokens',
  'inputtokens',
  'maxtokens',
  'outputtokens',
  'prompttokens',
  'tokencount',
  'totaltokens',
]);

const SAFE_PROMPT_KEYS = new Set([
  'promptchars',
  'promptcomposer',
  'prompthash',
  'promptid',
  'promptlength',
  'promptprovider',
  'prompttemplateid',
  'prompttokens',
  'promptversion',
]);

const PROVIDER_KEY_PARTS = [
  'anthropic',
  'aws',
  'fal',
  'openai',
  'provider',
  'replicate',
  's3',
  'stability',
  'stripe',
  'upstream',
];
const PAYLOAD_KEY_PARTS = ['body', 'data', 'input', 'output', 'payload', 'request', 'response'];
const SAFE_PROVIDER_METADATA_SUFFIXES = [
  'code',
  'duration',
  'durationms',
  'latency',
  'latencyms',
  'model',
  'requestid',
  'responseid',
  'status',
  'statuscode',
  'tokencount',
  'tokens',
];

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/giu;
const SIGNED_URL_PARAMETERS = new Set([
  'access_token',
  'googleaccessid',
  'key-pair-id',
  'policy',
  'sig',
  'signature',
  'token',
  'x-amz-credential',
  'x-amz-security-token',
  'x-amz-signature',
  'x-goog-credential',
  'x-goog-signature',
]);

const SAFE_ERROR_NAMES = new Set([
  'AbortError',
  'AggregateError',
  'BookFileNotFoundError',
  'ChunkLoadError',
  'DataCloneError',
  'EncodingError',
  'Error',
  'EvalError',
  'ImportError',
  'InvalidCharacterError',
  'InvalidModificationError',
  'InvalidStateError',
  'NetworkError',
  'NotAllowedError',
  'NotFoundError',
  'NotReadableError',
  'NotSupportedError',
  'OperationError',
  'QuotaExceededError',
  'RangeError',
  'ReferenceError',
  'SecurityError',
  'StoryBoredApiError',
  'SyntaxError',
  'TimeoutError',
  'TransactionInactiveError',
  'TypeError',
  'URIError',
  'UnknownError',
]);

interface SanitizeState {
  readonly seen: WeakSet<object>;
  readonly depth: number;
}

export const POSTHOG_PRIVACY_CONFIG = {
  autocapture: false,
  capture_exceptions: false,
  capture_pageleave: false,
  capture_pageview: false,
  disable_session_recording: true,
  mask_all_element_attributes: true,
  mask_all_text: true,
  before_send: sanitizePostHogCapture,
} as const;

export const hasOptedOutTelemetry = () => {
  return typeof window === 'undefined' || localStorage.getItem(TELEMETRY_OPT_OUT_KEY) === 'true';
};

export const captureEvent = (event: string, properties?: Record<string, unknown>) => {
  if (!hasOptedOutTelemetry()) {
    posthog.capture(sanitizeTelemetryString(event), sanitizeTelemetryValue(properties));
  }
};

export const captureException = (error: unknown, properties?: Record<string, unknown>) => {
  if (hasOptedOutTelemetry()) return;

  const safeError = new Error(SAFE_ERROR_MESSAGE);
  safeError.name = sanitizeErrorName(error);
  posthog.captureException(safeError, sanitizeTelemetryValue(properties));
};

export function sanitizePostHogCapture(capture: CaptureResult | null): CaptureResult | null {
  if (!capture) return null;

  const properties = sanitizeTelemetryValue(capture.properties);
  // PostHog requires its browser project token in the event properties at this stage.
  if (Object.hasOwn(capture.properties, 'token')) {
    properties['token'] = capture.properties['token'];
  }

  return {
    ...capture,
    properties,
    ...(capture.$set ? { $set: sanitizeTelemetryValue(capture.$set) } : {}),
    ...(capture.$set_once ? { $set_once: sanitizeTelemetryValue(capture.$set_once) } : {}),
  };
}

export function sanitizeTelemetryValue<T>(value: T): T {
  return sanitizeValue(value, undefined, {
    seen: new WeakSet<object>(),
    depth: 0,
  }) as T;
}

export function sanitizeTelemetryString(value: string): string {
  let sanitized = value.replace(URL_PATTERN, sanitizeUrlMatch);

  sanitized = sanitized
    .replace(
      /["']?(?:authorization|proxy-authorization)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|(?:(?:bearer|basic)\s+)?[^\s,;]+)/giu,
      'authorization=[REDACTED]',
    )
    .replace(/\b(?:bearer|basic)\s+[a-z0-9._~+/=-]+/giu, 'credential [REDACTED]')
    .replace(
      /["']?(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|password|passwd|cookie)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
      'credential=[REDACTED]',
    )
    .replace(
      /\b(?:(?:sk|rk)_(?:live|test)_|sk-(?:proj-)?|whsec_)[a-z0-9_-]{8,}/giu,
      REDACTED_TELEMETRY_VALUE,
    )
    .replace(/\bphc_[a-z0-9_-]{8,}/giu, REDACTED_TELEMETRY_VALUE)
    .replace(/\b(?:gh[pousr]_|github_pat_)[a-z0-9_]{20,}/giu, REDACTED_TELEMETRY_VALUE)
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu, REDACTED_TELEMETRY_VALUE)
    .replace(/\beyJ[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}\b/giu, REDACTED_TELEMETRY_VALUE);

  if (sanitized.length > MAX_STRING_LENGTH) {
    return `${sanitized.slice(0, MAX_STRING_LENGTH)}${TRUNCATED_VALUE}`;
  }

  return sanitized;
}

function sanitizeValue(value: unknown, key: string | undefined, state: SanitizeState): unknown {
  if (key && shouldRedactKey(key)) return REDACTED_TELEMETRY_VALUE;
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case 'string':
      return sanitizeTelemetryString(value);
    case 'number':
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'function':
    case 'symbol':
      return UNSUPPORTED_VALUE;
  }

  if (state.depth >= MAX_DEPTH) return MAX_DEPTH_VALUE;
  if (value instanceof Date) {
    try {
      return value.toISOString();
    } catch {
      return UNSUPPORTED_VALUE;
    }
  }
  if (value instanceof URL) return sanitizeTelemetryString(value.toString());
  if (value instanceof Error) {
    return {
      name: sanitizeErrorName(value),
      message: REDACTED_TELEMETRY_VALUE,
    };
  }

  if (state.seen.has(value)) return CIRCULAR_VALUE;
  state.seen.add(value);

  const nextState = { seen: state.seen, depth: state.depth + 1 };
  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_COLLECTION_SIZE)
      .map((item) => sanitizeValue(item, undefined, nextState));
    if (value.length > MAX_COLLECTION_SIZE) sanitized.push(TRUNCATED_VALUE);
    return sanitized;
  }

  const sanitized: Record<string, unknown> = {};
  let entries: [string, unknown][];
  let wasTruncated = false;
  try {
    const allEntries = Object.entries(value);
    entries = allEntries.slice(0, MAX_COLLECTION_SIZE);
    wasTruncated = allEntries.length > MAX_COLLECTION_SIZE;
  } catch {
    return UNSUPPORTED_VALUE;
  }

  for (const [entryKey, entryValue] of entries) {
    if (entryKey === '__proto__' || entryKey === 'constructor' || entryKey === 'prototype') {
      continue;
    }
    sanitized[entryKey] = sanitizeValue(entryValue, entryKey, nextState);
  }

  if (wasTruncated) sanitized['_truncated'] = TRUNCATED_VALUE;
  return sanitized;
}

function sanitizeErrorName(error: unknown): string {
  try {
    const candidate = error instanceof Error ? error.name : 'Error';
    return SAFE_ERROR_NAMES.has(candidate) ? candidate : 'Error';
  } catch {
    return 'Error';
  }
}

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
  if (SENSITIVE_KEYS.has(normalized)) return true;

  if (
    normalized.includes('selected') &&
    ['content', 'excerpt', 'passage', 'quote', 'selection', 'text'].some((part) =>
      normalized.includes(part),
    )
  ) {
    return true;
  }

  if (normalized.includes('prompt') && !SAFE_PROMPT_KEYS.has(normalized)) return true;

  if (normalized.startsWith('raw') && PAYLOAD_KEY_PARTS.some((part) => normalized.includes(part))) {
    return true;
  }

  if (
    PROVIDER_KEY_PARTS.some((part) => normalized.includes(part)) &&
    !SAFE_PROVIDER_METADATA_SUFFIXES.some((suffix) => normalized.endsWith(suffix)) &&
    PAYLOAD_KEY_PARTS.some((part) => normalized.includes(part))
  ) {
    return true;
  }

  if (
    normalized.includes('token') &&
    !SAFE_TOKEN_KEYS.has(normalized) &&
    !normalized.endsWith('tokencount') &&
    !normalized.endsWith('tokens')
  ) {
    return true;
  }

  return (
    normalized.includes('authorization') ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('credential') ||
    normalized.endsWith('credentials') ||
    normalized.endsWith('password') ||
    normalized.endsWith('privatekey') ||
    normalized.endsWith('secret')
  );
}

function sanitizeUrlMatch(rawMatch: string): string {
  const trailingPunctuation = rawMatch.match(/[),.;!?]+$/u)?.[0] ?? '';
  const rawUrl = trailingPunctuation ? rawMatch.slice(0, -trailingPunctuation.length) : rawMatch;

  try {
    const url = new URL(rawUrl);
    if (url.username || url.password || hasSignedUrlParameter(url)) {
      return `${REDACTED_SIGNED_URL}${trailingPunctuation}`;
    }

    url.search = '';
    url.hash = '';
    return `${url.toString()}${trailingPunctuation}`;
  } catch {
    return REDACTED_TELEMETRY_VALUE;
  }
}

function hasSignedUrlParameter(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (SIGNED_URL_PARAMETERS.has(key.toLowerCase())) return true;
  }
  return false;
}

export const optInTelemetry = () => {
  localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'false');
  posthog.opt_in_capturing();
};
export const optOutTelemetry = () => {
  localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'true');
  posthog.opt_out_capturing();
};
