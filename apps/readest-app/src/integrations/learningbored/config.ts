export interface LearningBoredPublicEnvironment {
  enabled?: string;
  apiBaseUrl?: string;
  deploymentProfile?: string;
  nodeEnv?: string;
}

export interface LearningBoredReaderConfig {
  enabled: boolean;
  apiBaseUrl: string;
}

export const LEARNINGBORED_PRIVATE_BETA_PRODUCTION_API_ORIGIN = 'https://api.learningbored.com';
const LEARNINGBORED_PRIVATE_BETA_PROFILE = 'private_beta';

function getPublicEnvironment(): LearningBoredPublicEnvironment {
  return {
    enabled: process.env['NEXT_PUBLIC_LEARNINGBORED_ENABLED'],
    apiBaseUrl: process.env['NEXT_PUBLIC_LEARNINGBORED_API_BASE_URL'],
    deploymentProfile: process.env['NEXT_PUBLIC_LEARNINGBORED_DEPLOYMENT_PROFILE'],
    nodeEnv: process.env['NODE_ENV'],
  };
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function canonicalizeApiOrigin(
  value: string | undefined,
  nodeEnv: string | undefined,
  deploymentProfile: string | undefined,
): string {
  if (!value?.trim()) {
    return '';
  }

  try {
    const url = new URL(value.trim());
    const isHttps = url.protocol === 'https:';
    const isLocalDevelopmentHttp =
      url.protocol === 'http:' &&
      (nodeEnv === 'development' || nodeEnv === 'test') &&
      isLocalHostname(url.hostname);
    const isBareOrigin =
      url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash;

    if (!(isHttps || isLocalDevelopmentHttp) || !isBareOrigin) {
      return '';
    }

    if (
      nodeEnv === 'production' &&
      (deploymentProfile !== LEARNINGBORED_PRIVATE_BETA_PROFILE ||
        url.origin !== LEARNINGBORED_PRIVATE_BETA_PRODUCTION_API_ORIGIN)
    ) {
      return '';
    }

    return url.origin;
  } catch {
    return '';
  }
}

/** LearningBored is intentionally absent unless both public settings are explicit. */
export function getLearningBoredReaderConfig(
  environment: LearningBoredPublicEnvironment = getPublicEnvironment(),
): LearningBoredReaderConfig {
  const apiBaseUrl = canonicalizeApiOrigin(
    environment.apiBaseUrl,
    environment.nodeEnv,
    environment.deploymentProfile,
  );

  return {
    enabled: environment.enabled === 'true' && apiBaseUrl.length > 0,
    apiBaseUrl,
  };
}

export function isLearningBoredReaderEnabled(): boolean {
  return getLearningBoredReaderConfig().enabled;
}
