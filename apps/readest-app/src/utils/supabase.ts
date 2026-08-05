import { createClient } from '@supabase/supabase-js';

import {
  assertLearningBoredProductionSupabaseEnvironment,
  canonicalizeLearningBoredSupabaseOrigin,
  requiresExactLearningBoredSupabaseEnvironment,
} from '@/integrations/learningbored/production-environment.mjs';

const supabaseEnvironment = {
  deploymentProfile: process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'],
  learningBoredEnabled: process.env['NEXT_PUBLIC_LEARNINGBORED_ENABLED'],
  nodeEnv: process.env['NODE_ENV'],
  supabaseAnonKey: process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  supabaseUrl: process.env['NEXT_PUBLIC_SUPABASE_URL'],
};

assertLearningBoredProductionSupabaseEnvironment(supabaseEnvironment);

const requiresExactSupabaseEnvironment =
  requiresExactLearningBoredSupabaseEnvironment(supabaseEnvironment);
const explicitSupabaseUrl = requiresExactSupabaseEnvironment
  ? canonicalizeLearningBoredSupabaseOrigin(supabaseEnvironment.supabaseUrl)
  : supabaseEnvironment.supabaseUrl?.trim();
const explicitSupabaseAnonKey = supabaseEnvironment.supabaseAnonKey?.trim();

const supabaseUrl = requiresExactSupabaseEnvironment
  ? explicitSupabaseUrl!
  : process.env['SUPABASE_URL'] ||
    explicitSupabaseUrl ||
    atob(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64']!);
const supabaseAnonKey = requiresExactSupabaseEnvironment
  ? explicitSupabaseAnonKey!
  : process.env['SUPABASE_ANON_KEY'] ||
    explicitSupabaseAnonKey ||
    atob(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64']!);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const createSupabaseClient = (accessToken?: string) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};
