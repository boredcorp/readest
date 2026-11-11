import { createClient } from '@supabase/supabase-js';

import {
  assertLearningBoredProductionSupabaseEnvironment,
  requiresExactLearningBoredSupabaseEnvironment,
  selectLearningBoredSupabaseUrl,
} from '@/integrations/learningbored/production-environment.mjs';
import { getLearningBoredPrivateBetaPolicy } from '@/integrations/learningbored/private-beta-policy';
import { createLearningBoredSupabaseFetch } from '@/integrations/learningbored/supabase-fetch';

const supabaseEnvironment = {
  deploymentProfile: process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'],
  learningBoredEnabled: process.env['NEXT_PUBLIC_LEARNINGBORED_ENABLED'],
  nodeEnv: process.env['NODE_ENV'],
  serverSupabaseUrl: process.env['SUPABASE_URL'],
  supabaseAnonKey: process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  supabaseUrl: process.env['NEXT_PUBLIC_SUPABASE_URL'],
};

const runtime = typeof window === 'undefined' ? 'server' : 'browser';
const learningBoredSupabaseFetch = createLearningBoredSupabaseFetch(
  {
    deploymentProfile: supabaseEnvironment.deploymentProfile,
    runtime,
  },
  (input, init) => globalThis.fetch(input, init),
);

assertLearningBoredProductionSupabaseEnvironment(supabaseEnvironment, runtime);

const requiresExactSupabaseEnvironment =
  requiresExactLearningBoredSupabaseEnvironment(supabaseEnvironment);
const learningBoredPrivateBetaPolicy = getLearningBoredPrivateBetaPolicy({
  deploymentProfile: supabaseEnvironment.deploymentProfile,
  enabled: supabaseEnvironment.learningBoredEnabled,
});
const explicitSupabaseUrl = selectLearningBoredSupabaseUrl(supabaseEnvironment, runtime);
const explicitSupabaseAnonKey = supabaseEnvironment.supabaseAnonKey?.trim();

const supabaseUrl = requiresExactSupabaseEnvironment
  ? explicitSupabaseUrl!
  : explicitSupabaseUrl || atob(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64']!);
const supabaseAnonKey = requiresExactSupabaseEnvironment
  ? explicitSupabaseAnonKey!
  : process.env['SUPABASE_ANON_KEY'] ||
    explicitSupabaseAnonKey ||
    atob(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64']!);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  ...(learningBoredSupabaseFetch ? { global: { fetch: learningBoredSupabaseFetch } } : {}),
  auth: {
    // The selected private-beta callback owns its implicit-flow fragment. Default Readest keeps
    // auth-js's canonical URL detection behavior.
    detectSessionInUrl: !learningBoredPrivateBetaPolicy.active,
  },
});

export const createSupabaseClient = (accessToken?: string) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      ...(learningBoredSupabaseFetch ? { fetch: learningBoredSupabaseFetch } : {}),
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  });
};

export const createSupabaseAdminClient = () => {
  const supabaseAdminKey = process.env['SUPABASE_ADMIN_KEY'] || '';
  return createClient(supabaseUrl, supabaseAdminKey, {
    ...(learningBoredSupabaseFetch ? { global: { fetch: learningBoredSupabaseFetch } } : {}),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};
