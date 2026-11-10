import {
  LEARNINGBORED_PRIVATE_BETA_PROFILE,
  LEARNINGBORED_PUBLIC_SUPABASE_ORIGIN,
} from './production-environment.mjs';

interface LearningBoredSupabaseFetchEnvironment {
  deploymentProfile?: string;
  runtime: 'browser' | 'server';
}

/** Carry the owner's Access session only to the private beta's canonical browser endpoint. */
export function createLearningBoredSupabaseFetch(
  environment: LearningBoredSupabaseFetchEnvironment,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): typeof fetch | undefined {
  if (
    environment.deploymentProfile !== LEARNINGBORED_PRIVATE_BETA_PROFILE ||
    environment.runtime !== 'browser'
  ) {
    return undefined;
  }

  return (input, init) => {
    let destination: URL;
    try {
      destination = new URL(
        typeof input === 'string' ? input : 'url' in input ? input.url : input.href,
      );
    } catch {
      return fetcher(input, init);
    }

    if (
      destination.origin !== LEARNINGBORED_PUBLIC_SUPABASE_ORIGIN ||
      destination.username ||
      destination.password
    ) {
      return fetcher(input, init);
    }

    // Access cookies authenticate this origin separately from Supabase's bearer session. Fail
    // closed on redirects rather than forwarding auth bodies to a login or another destination.
    return fetcher(input, { ...init, credentials: 'include', redirect: 'error' });
  };
}
