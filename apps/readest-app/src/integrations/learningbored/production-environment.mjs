export const LEARNINGBORED_PRODUCTION_SUPABASE_ENV_NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];
export const LEARNINGBORED_PRIVATE_BETA_PROFILE = 'private_beta';

/**
 * @typedef {object} LearningBoredProductionSupabaseEnvironment
 * @property {string} [deploymentProfile]
 * @property {string} [learningBoredEnabled]
 * @property {string} [nodeEnv]
 * @property {string} [supabaseAnonKey]
 * @property {string} [supabaseUrl]
 */

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
 * Production LearningBored must never inherit Readest's embedded upstream Supabase project.
 *
 * @param {LearningBoredProductionSupabaseEnvironment} environment
 */
export function assertLearningBoredProductionSupabaseEnvironment(environment) {
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

  if (!canonicalizeLearningBoredSupabaseOrigin(environment.supabaseUrl)) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL must be an absolute HTTPS origin without credentials, path, query, or fragment.',
    );
  }
}
