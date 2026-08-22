import { pathToFileURL } from 'node:url';

export const REQUIRED_READER_PUBLIC_ENDPOINTS = Object.freeze([
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_MARKETPLACE_URL',
  'NEXT_PUBLIC_NODE_BASE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_STORYBORED_API_BASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
]);

const FORBIDDEN_FALLBACK_HOSTNAMES = new Set([
  'node.readest.com',
  'storybored.com',
  'web.readest.com',
  'www.storybored.com',
]);

export function validateReaderPublicEndpoints(environment = process.env) {
  const endpoints = Object.fromEntries(
    REQUIRED_READER_PUBLIC_ENDPOINTS.map((name) => [
      name,
      requirePublicEndpoint(name, environment),
    ]),
  );

  requireMatchingOrigin(
    endpoints,
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_MARKETPLACE_URL',
    'StoryBored site and marketplace',
  );

  return endpoints;
}

function requirePublicEndpoint(name, environment) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for the production Reader image`);

  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL`);
  }

  if (
    (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(`${name} must be a credential-free HTTP(S) URL without query or fragment`);
  }
  if (FORBIDDEN_FALLBACK_HOSTNAMES.has(endpoint.hostname.toLowerCase())) {
    throw new Error(`${name} must not use an upstream or legacy fallback host`);
  }

  return endpoint.toString();
}

function requireMatchingOrigin(endpoints, leftName, rightName, description) {
  if (new URL(endpoints[leftName]).origin !== new URL(endpoints[rightName]).origin) {
    throw new Error(`${description} URLs must share one origin`);
  }
}

const isDirectRun =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) validateReaderPublicEndpoints();
