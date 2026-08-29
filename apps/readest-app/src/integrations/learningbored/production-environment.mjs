export const LEARNINGBORED_PRODUCTION_SUPABASE_ENV_NAMES = [
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];
export const LEARNINGBORED_PRIVATE_BETA_PROFILE = 'private_beta';
export const LEARNINGBORED_PUBLIC_SUPABASE_ORIGIN = 'https://supabase.learningbored.com';
export const LEARNINGBORED_SERVER_SUPABASE_ORIGIN = 'http://learningbored-supabase-gateway:8000';

/**
 * @typedef {object} LearningBoredProductionSupabaseEnvironment
 * @property {string} [deploymentProfile]
 * @property {string} [learningBoredEnabled]
 * @property {string} [nodeEnv]
 * @property {string} [serverSupabaseUrl]
 * @property {string} [supabaseAnonKey]
 * @property {string} [supabaseUrl]
 */

/** @typedef {'browser' | 'server'} LearningBoredRuntime */

/**
 * @param {LearningBoredProductionSupabaseEnvironment} environment
 */
export function requiresExactLearningBoredSupabaseEnvironment(environment) {
  return (
    environment.nodeEnv === 'production' &&
    (environment.deploymentProfile !== undefined || environment.learningBoredEnabled === 'true')
  );
}

/**
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
export function canonicalizeLearningBoredSupabaseOrigin(value) {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const url = new URL(value.trim());
    const isBareHttpsOrigin =
      url.protocol === 'https:' &&
      url.pathname === '/' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash;

    return isBareHttpsOrigin ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Select the public browser origin or private server gateway without ever placing the private
 * address in a client-side fallback path.
 *
 * @param {LearningBoredProductionSupabaseEnvironment} environment
 * @param {LearningBoredRuntime} runtime
 * @returns {string | undefined}
 */
export function selectLearningBoredSupabaseUrl(environment, runtime) {
  if (requiresExactLearningBoredSupabaseEnvironment(environment)) {
    assertLearningBoredProductionSupabaseEnvironment(environment, runtime);
    return runtime === 'server'
      ? LEARNINGBORED_SERVER_SUPABASE_ORIGIN
      : LEARNINGBORED_PUBLIC_SUPABASE_ORIGIN;
  }

  return runtime === 'server'
    ? environment.serverSupabaseUrl?.trim() || environment.supabaseUrl?.trim()
    : environment.supabaseUrl?.trim();
}

/**
 * Production LearningBored must never inherit Readest's embedded upstream Supabase project.
 *
 * @param {LearningBoredProductionSupabaseEnvironment} environment
 * @param {LearningBoredRuntime} [runtime='browser']
 */
export function assertLearningBoredProductionSupabaseEnvironment(environment, runtime = 'browser') {
  if (!requiresExactLearningBoredSupabaseEnvironment(environment)) {
    return;
  }

  if (environment.deploymentProfile !== LEARNINGBORED_PRIVATE_BETA_PROFILE) {
    throw new Error(
      'LearningBored production requires NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE=private_beta.',
    );
  }

  const missingEnvironmentNames = [
    environment.supabaseUrl?.trim() ? undefined : 'NEXT_PUBLIC_SUPABASE_URL',
    environment.supabaseAnonKey?.trim() ? undefined : 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter(Boolean);

  if (missingEnvironmentNames.length > 0) {
    throw new Error(
      `LearningBored production requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. Missing: ${missingEnvironmentNames.join(', ')}.`,
    );
  }

  if (
    canonicalizeLearningBoredSupabaseOrigin(environment.supabaseUrl) !==
    LEARNINGBORED_PUBLIC_SUPABASE_ORIGIN
  ) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL must equal ${LEARNINGBORED_PUBLIC_SUPABASE_ORIGIN} in LearningBored production.`,
    );
  }

  if (!environment.supabaseAnonKey?.trim().startsWith('sb_publishable_')) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY must be the self-hosted sb_publishable_ key in LearningBored production.',
    );
  }

  if (
    runtime === 'server' &&
    environment.serverSupabaseUrl?.trim() !== LEARNINGBORED_SERVER_SUPABASE_ORIGIN
  ) {
    throw new Error(
      `SUPABASE_URL must equal ${LEARNINGBORED_SERVER_SUPABASE_ORIGIN} in LearningBored production.`,
    );
  }
}
