import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertLearningBoredProductionSupabaseEnvironment,
  requiresExactLearningBoredSupabaseEnvironment,
} from '@/integrations/learningbored/production-environment.mjs';

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

  it('accepts the exact public Supabase settings for LearningBored production', () => {
    expect(() =>
      assertLearningBoredProductionSupabaseEnvironment({
        deploymentProfile: 'private_beta',
        learningBoredEnabled: 'true',
        nodeEnv: 'production',
        supabaseAnonKey: 'learningbored-anon-key',
        supabaseUrl: 'https://learningbored.supabase.co',
      }),
    ).not.toThrow();
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
      'NEXT_PUBLIC_SUPABASE_URL must be an absolute HTTPS origin without credentials, path, query, or fragment',
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
          supabaseUrl: 'https://learningbored.supabase.co',
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
