import { beforeEach, describe, expect, test, vi } from 'vitest';
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
  sanitizePostHogCapture,
  TELEMETRY_OPT_OUT_KEY,
} from '@/utils/telemetry';

describe('reader telemetry privacy boundary', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
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
    window.localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'true');

    captureEvent('reader_event', { selectedText: 'PRIVATE_MARKER' });
    captureException(new Error('PRIVATE_ERROR_MARKER'));

    expect(posthogMocks.capture).not.toHaveBeenCalled();
    expect(posthogMocks.captureException).not.toHaveBeenCalled();
  });
});
