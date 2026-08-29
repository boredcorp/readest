import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertLearningBoredProductionSupabaseEnvironment,
  requiresExactLearningBoredSupabaseEnvironment,
  selectLearningBoredSupabaseUrl,
} from '@/integrations/learningbored/production-environment.mjs';

const exactProductionEnvironment = {
  deploymentProfile: 'private_beta',
  learningBoredEnabled: 'true',
  nodeEnv: 'production',
  serverSupabaseUrl: 'http://learningbored-supabase-gateway:8000',
  supabaseAnonKey: 'sb_publishable_fictional_runtime_key',
  supabaseUrl: 'https://supabase.learningbored.com',
};

describe('LearningBored production Supabase environment', () => {
  it('fails closed when the private-beta profile omits the exact public Supabase settings', () => {
    expect(() =>
      assertLearningBoredProductionSupabaseEnvironment({
        deploymentProfile: 'private_beta',
        learningBoredEnabled: 'false',
        nodeEnv: 'production',
      }),
    ).toThrowError(
      'LearningBored production requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  });

  it('does not accept a partial production Supabase configuration', () => {
    expect(() =>
      assertLearningBoredProductionSupabaseEnvironment({
        deploymentProfile: 'private_beta',
        learningBoredEnabled: 'true',
        nodeEnv: 'production',
        supabaseUrl: 'https://learningbored.supabase.co',
      }),
    ).toThrowError('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it.each(['learningbored-anon-key', 'YOUR_LEARNINGBORED_SUPABASE_ANON_KEY'])(
    'rejects a legacy or placeholder browser API key: %s',
    (supabaseAnonKey) => {
      expect(() =>
        assertLearningBoredProductionSupabaseEnvironment({
          ...exactProductionEnvironment,
          supabaseAnonKey,
        }),
      ).toThrowError('NEXT_PUBLIC_SUPABASE_ANON_KEY must be the self-hosted sb_publishable_ key');
    },
  );

  it('accepts the exact public Supabase settings for LearningBored production', () => {
    expect(() =>
      assertLearningBoredProductionSupabaseEnvironment(exactProductionEnvironment, 'server'),
    ).not.toThrow();
  });

  it('uses the private gateway on the server and the exact public origin in the browser', () => {
    expect(selectLearningBoredSupabaseUrl(exactProductionEnvironment, 'server')).toBe(
      'http://learningbored-supabase-gateway:8000',
    );
    expect(selectLearningBoredSupabaseUrl(exactProductionEnvironment, 'browser')).toBe(
      'https://supabase.learningbored.com',
    );
  });

  it('does not expose or require the private gateway in the browser runtime', () => {
    const { serverSupabaseUrl: _serverSupabaseUrl, ...browserEnvironment } =
      exactProductionEnvironment;

    expect(() =>
      assertLearningBoredProductionSupabaseEnvironment(browserEnvironment, 'browser'),
    ).not.toThrow();
    expect(selectLearningBoredSupabaseUrl(browserEnvironment, 'browser')).toBe(
      'https://supabase.learningbored.com',
    );
  });

  it.each([
    undefined,
    '',
    'http://kong:8000',
    'https://learningbored-supabase-gateway:8000',
    'http://user:password@learningbored-supabase-gateway:8000',
    'http://learningbored-supabase-gateway:8000/rest/v1',
  ])('rejects a missing or noncanonical private gateway on the server: %s', (serverSupabaseUrl) => {
    expect(() =>
      assertLearningBoredProductionSupabaseEnvironment(
        {
          ...exactProductionEnvironment,
          serverSupabaseUrl,
        },
        'server',
      ),
    ).toThrowError(
      'SUPABASE_URL must equal http://learningbored-supabase-gateway:8000 in LearningBored production',
    );
  });

  it.each([
    'not-a-url',
    '//learningbored.supabase.co',
    'http://learningbored.supabase.co',
    'https://user:password@learningbored.supabase.co',
    'https://learningbored.supabase.co/rest/v1',
    'https://learningbored.supabase.co?tenant=other',
    'https://learningbored.supabase.co#other',
  ])('rejects a noncanonical production Supabase origin: %s', (supabaseUrl) => {
    expect(() =>
      assertLearningBoredProductionSupabaseEnvironment({
        deploymentProfile: 'private_beta',
        learningBoredEnabled: 'true',
        nodeEnv: 'production',
        supabaseAnonKey: 'learningbored-anon-key',
        supabaseUrl,
      }),
    ).toThrowError(
      'NEXT_PUBLIC_SUPABASE_URL must equal https://supabase.learningbored.com in LearningBored production',
    );
  });

  it('rejects a valid HTTPS origin that is not the canonical LearningBored Supabase origin', () => {
    expect(() =>
      assertLearningBoredProductionSupabaseEnvironment({
        ...exactProductionEnvironment,
        supabaseUrl: 'https://learningbored.supabase.co',
      }),
    ).toThrowError(
      'NEXT_PUBLIC_SUPABASE_URL must equal https://supabase.learningbored.com in LearningBored production',
    );
  });

  it.each([undefined, '', 'private-btea', 'public'])(
    'rejects a missing or unknown production deployment profile: %s',
    (deploymentProfile) => {
      expect(() =>
        assertLearningBoredProductionSupabaseEnvironment({
          deploymentProfile,
          learningBoredEnabled: 'true',
          nodeEnv: 'production',
          supabaseAnonKey: 'learningbored-anon-key',
          supabaseUrl: 'https://supabase.learningbored.com',
        }),
      ).toThrowError(
        'LearningBored production requires NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE=private_beta',
      );
    },
  );

  it('does not impose LearningBored requirements on upstream Readest or local development', () => {
    expect(() =>
      assertLearningBoredProductionSupabaseEnvironment({
        nodeEnv: 'production',
      }),
    ).not.toThrow();
    expect(() =>
      assertLearningBoredProductionSupabaseEnvironment({
        deploymentProfile: 'private-btea',
        learningBoredEnabled: 'true',
        nodeEnv: 'development',
      }),
    ).not.toThrow();
  });

  it('leaves an explicitly disabled integration in normal Readest production mode', () => {
    const environment = {
      learningBoredEnabled: 'false',
      nodeEnv: 'production',
    };

    expect(requiresExactLearningBoredSupabaseEnvironment(environment)).toBe(false);
    expect(() => assertLearningBoredProductionSupabaseEnvironment(environment)).not.toThrow();
  });

  it('keeps the committed generic web environment outside the private-beta profile', () => {
    const webEnvironment = readFileSync(
      resolve(import.meta.dirname, '../../../../.env.web'),
      'utf8',
    );

    expect(webEnvironment).not.toMatch(/^NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE=/mu);
    expect(webEnvironment).not.toMatch(/^NEXT_PUBLIC_LEARNINGBORED_ENABLED=/mu);
  });
});
