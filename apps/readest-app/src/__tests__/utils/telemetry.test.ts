import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CaptureResult } from 'posthog-js';

const posthogMocks = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
  optIn: vi.fn(),
  optOut: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: {
    capture: posthogMocks.capture,
    captureException: posthogMocks.captureException,
    opt_in_capturing: posthogMocks.optIn,
    opt_out_capturing: posthogMocks.optOut,
  },
}));

import {
  captureEvent,
  captureException,
  POSTHOG_PRIVACY_CONFIG,
  REDACTED_SIGNED_URL,
  REDACTED_TELEMETRY_VALUE,
  resolvePostHogConfig,
  resolveSentryConfig,
  sanitizePostHogCapture,
  TELEMETRY_OPT_OUT_KEY,
} from '@/utils/telemetry';

describe('reader telemetry privacy boundary', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://telemetry.example.com');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_project');
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_POSTHOG_URL_BASE64', '');
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64', '');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', '');
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('fails closed without configured or fallback PostHog values', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', '');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');

    expect(resolvePostHogConfig()).toBeNull();

    captureEvent('reader_event');
    captureException(new Error('PRIVATE_ERROR_MARKER'));

    expect(posthogMocks.capture).not.toHaveBeenCalled();
    expect(posthogMocks.captureException).not.toHaveBeenCalled();
  });

  test('fails closed when fallback PostHog values are malformed', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', '');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_POSTHOG_URL_BASE64', 'not valid base64!');
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64', '%%%');

    expect(() => resolvePostHogConfig()).not.toThrow();
    expect(resolvePostHogConfig()).toBeNull();

    captureEvent('reader_event');
    captureException(new Error('PRIVATE_ERROR_MARKER'));

    expect(posthogMocks.capture).not.toHaveBeenCalled();
    expect(posthogMocks.captureException).not.toHaveBeenCalled();
  });

  test('preserves explicit and valid fallback PostHog configuration', () => {
    expect(resolvePostHogConfig()).toEqual({
      host: 'https://telemetry.example.com',
      key: 'phc_test_project',
    });

    expect(
      resolvePostHogConfig({
        defaultHostBase64: btoa('https://fallback-telemetry.example.com'),
        defaultKeyBase64: btoa('phc_fallback_project'),
      }),
    ).toEqual({
      host: 'https://fallback-telemetry.example.com',
      key: 'phc_fallback_project',
    });
  });

  test('disables automatic page, exception, DOM, and session recording capture', () => {
    expect(POSTHOG_PRIVACY_CONFIG).toMatchObject({
      autocapture: false,
      capture_exceptions: false,
      capture_pageleave: false,
      capture_pageview: false,
      disable_session_recording: true,
      mask_all_element_attributes: true,
      mask_all_text: true,
    });
    expect(POSTHOG_PRIVACY_CONFIG.before_send).toBe(sanitizePostHogCapture);
  });

  test('sanitizes explicit event properties before PostHog receives them', () => {
    captureEvent('scene_preview_opened', {
      sceneGenerationId: 'generation-safe-123',
      selectedText: 'SELECTED_TEXT_MARKER',
      prompt: 'PROMPT_MARKER',
      providerResponse: { body: 'RAW_PROVIDER_PAYLOAD_MARKER' },
      assetUrl:
        'https://assets.example.com/scene.png?X-Amz-Credential=SIGNED_CREDENTIAL_MARKER&X-Amz-Signature=SIGNED_SIGNATURE_MARKER',
      note: 'used Bearer INLINE_CREDENTIAL_MARKER and {"apiKey":"JSON_CREDENTIAL_MARKER"}',
      connectionNote:
        'postgresql://reader:DB_PASSWORD_MARKER@db.example/storybored ' +
        'redis://:REDIS_PASSWORD_MARKER@cache.example:6379/0',
    });

    expect(posthogMocks.capture).toHaveBeenCalledTimes(1);
    const properties = posthogMocks.capture.mock.calls[0]?.[1];
    const serialized = JSON.stringify(properties);

    expect(properties.sceneGenerationId).toBe('generation-safe-123');
    expect(properties.selectedText).toBe(REDACTED_TELEMETRY_VALUE);
    expect(properties.prompt).toBe(REDACTED_TELEMETRY_VALUE);
    expect(properties.assetUrl).toBe(REDACTED_SIGNED_URL);
    for (const marker of [
      'SELECTED_TEXT_MARKER',
      'PROMPT_MARKER',
      'RAW_PROVIDER_PAYLOAD_MARKER',
      'SIGNED_CREDENTIAL_MARKER',
      'SIGNED_SIGNATURE_MARKER',
      'INLINE_CREDENTIAL_MARKER',
      'JSON_CREDENTIAL_MARKER',
      'DB_PASSWORD_MARKER',
      'REDIS_PASSWORD_MARKER',
    ]) {
      expect(serialized).not.toContain(marker);
    }
  });

  test('replaces raw exceptions with a safe error and sanitized metadata', () => {
    const rawError = new Error('RAW_ERROR_MARKER with SELECTED_PASSAGE_MARKER');
    rawError.name = 'sk-proj-ERROR_NAME_CREDENTIAL_MARKER';

    captureException(rawError, {
      errorDigest: 'digest-safe-123',
      surroundingContext: 'SURROUNDING_CONTEXT_MARKER',
      authorization: 'Bearer AUTHORIZATION_MARKER',
    });

    expect(posthogMocks.captureException).toHaveBeenCalledTimes(1);
    const [safeError, properties] = posthogMocks.captureException.mock.calls[0] ?? [];
    expect(safeError).toBeInstanceOf(Error);
    expect(safeError.name).toBe('Error');
    expect(safeError.message).toBe('Reader error details redacted at the telemetry boundary.');
    expect(safeError.stack).not.toContain('RAW_ERROR_MARKER');
    expect(JSON.stringify(posthogMocks.captureException.mock.calls)).not.toContain(
      'ERROR_NAME_CREDENTIAL_MARKER',
    );
    expect(properties).toEqual({
      errorDigest: 'digest-safe-123',
      surroundingContext: REDACTED_TELEMETRY_VALUE,
      authorization: REDACTED_TELEMETRY_VALUE,
    });
  });

  test('sanitizes SDK-generated capture data while preserving PostHog project token', () => {
    const capture: CaptureResult = {
      uuid: 'event-safe-123',
      event: 'reader_event',
      properties: {
        token: 'phc_project_token_required_for_delivery',
        distinct_id: 'reader-safe-123',
        selectedPassage: 'SELECTED_PASSAGE_MARKER',
        currentUrl: 'https://reader.example.com/book?selection=URL_QUERY_MARKER#chapter',
        providerPayload: 'RAW_PROVIDER_PAYLOAD_MARKER',
      },
    };

    const sanitized = sanitizePostHogCapture(capture);
    const serialized = JSON.stringify(sanitized);

    expect(sanitized?.properties['token']).toBe('phc_project_token_required_for_delivery');
    expect(sanitized?.properties['selectedPassage']).toBe(REDACTED_TELEMETRY_VALUE);
    expect(sanitized?.properties['currentUrl']).toBe('https://reader.example.com/book');
    expect(serialized).not.toContain('SELECTED_PASSAGE_MARKER');
    expect(serialized).not.toContain('URL_QUERY_MARKER');
    expect(serialized).not.toContain('RAW_PROVIDER_PAYLOAD_MARKER');
  });

  test('honors the local telemetry opt-out before sanitizing or capturing', () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://reader-public-key@errors.example.com/42');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', 'readest@0.10.6+test');
    window.localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'true');

    captureEvent('reader_event', { selectedText: 'PRIVATE_MARKER' });
    captureException(new Error('PRIVATE_ERROR_MARKER'));

    expect(posthogMocks.capture).not.toHaveBeenCalled();
    expect(posthogMocks.captureException).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('fails closed instead of sending untagged Sentry failures', () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://reader-public-key@errors.example.com/42');

    expect(resolveSentryConfig()).toBeNull();
    captureException(new Error('PRIVATE_ERROR_MARKER'));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('sends a release-tagged deny-by-default Sentry envelope with no private input', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://reader-public-key@errors.example.com/42');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', 'readest@0.10.6+test');

    captureException(new Error('RAW_ERROR_MARKER with PRIVATE_TEXT_MARKER'), {
      authorization: 'Bearer TOKEN_MARKER',
      body: 'BODY_MARKER',
      cookie: 'session=COOKIE_MARKER',
      errorDigest: 'digest-safe-123',
      prompt: 'PROMPT_MARKER',
      selectedText: 'SELECTED_TEXT_MARKER',
      signedUrl:
        'https://assets.example.com/private.png?X-Amz-Credential=SIGNED_CREDENTIAL_MARKER&X-Amz-Signature=SIGNED_SIGNATURE_MARKER',
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl).toBe(
      'https://errors.example.com/api/42/envelope/?sentry_key=reader-public-key&sentry_version=7',
    );
    expect(requestInit).toMatchObject({
      body: expect.any(String),
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      keepalive: true,
      method: 'POST',
    });

    const envelopeLines = String(requestInit?.body).split('\n');
    expect(envelopeLines).toHaveLength(3);
    const event = JSON.parse(envelopeLines[2] ?? '{}');
    expect(event).toMatchObject({
      environment: 'production',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Reader error details redacted at the telemetry boundary.',
          },
        ],
      },
      extra: { errorDigest: 'digest-safe-123' },
      level: 'error',
      platform: 'javascript',
      release: 'readest@0.10.6+test',
      tags: { service: 'storybored-reader' },
    });

    const serializedRequest = JSON.stringify(fetchMock.mock.calls);
    for (const marker of [
      'RAW_ERROR_MARKER',
      'PRIVATE_TEXT_MARKER',
      'TOKEN_MARKER',
      'COOKIE_MARKER',
      'SELECTED_TEXT_MARKER',
      'PROMPT_MARKER',
      'BODY_MARKER',
      'SIGNED_CREDENTIAL_MARKER',
      'SIGNED_SIGNATURE_MARKER',
    ]) {
      expect(serializedRequest).not.toContain(marker);
    }
  });
});
