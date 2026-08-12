export type AuthCallbackFailureReason = 'invalid-link' | 'provider-error';

export function getCallbackFailureReason(
  errorCode: string | null,
  errorDescription: string | null,
): AuthCallbackFailureReason {
  const failure = `${errorCode ?? ''} ${errorDescription ?? ''}`.toLowerCase();
  return /otp_expired|expired|invalid[^a-z]+(?:link|token)|(?:link|token)[^a-z]+invalid/u.test(
    failure,
  )
    ? 'invalid-link'
    : 'provider-error';
}
