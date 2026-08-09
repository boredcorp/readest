'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import { handleAuthCallback } from '@/helpers/auth';
import { useTranslation } from '@/hooks/useTranslation';
import LearningBoredAuthPresentation, {
  LearningBoredAuthActions,
  LearningBoredAuthButton,
  LearningBoredAuthStatus,
} from '@/integrations/learningbored/presentation/LearningBoredAuthPresentation';
import SelectedRoutePresentation from '@/integrations/learningbored/presentation/SelectedRoutePresentation';
import { getLearningBoredRoutePresentation } from '@/integrations/learningbored/presentation/selection';

type AuthCallbackPresentation = 'readest' | 'learningbored';
type AuthCallbackFailureReason = 'invalid-link' | 'provider-error';

const routePresentation = getLearningBoredRoutePresentation();

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

function AuthCallbackRouteController({ presentation }: { presentation: AuthCallbackPresentation }) {
  const _ = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const [visualState, setVisualState] = useState<'pending' | 'success' | AuthCallbackFailureReason>(
    'pending',
  );

  useEffect(() => {
    const hash = window.location.hash || '';
    const params = new URLSearchParams(hash.slice(1));

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');
    const next = params.get('next') ?? '/';
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    const errorCode = params.get('error_code');
    const failureReason = getCallbackFailureReason(errorCode, errorDescription);

    if (presentation === 'learningbored' && error) {
      setVisualState(failureReason);
    }

    const navigate = (path: string) => {
      if (presentation === 'learningbored' && path === '/auth/error') {
        const search = new URLSearchParams({ reason: failureReason });
        if (errorCode) search.set('code', errorCode);
        router.push(`/auth/error?${search.toString()}`);
        return;
      }

      if (presentation === 'learningbored') setVisualState('success');
      router.push(path);
    };

    handleAuthCallback({
      accessToken,
      refreshToken,
      type,
      next,
      error,
      errorCode,
      errorDescription,
      login,
      navigate,
    });
  }, [login, presentation, router]);

  if (presentation === 'learningbored') {
    const isSuccess = visualState === 'success';
    const isFailure = visualState === 'invalid-link' || visualState === 'provider-error';
    const heading = isSuccess
      ? _('Sign-in confirmed.')
      : isFailure
        ? visualState === 'invalid-link'
          ? _('This link cannot be used.')
          : _('Sign-in could not be completed.')
        : _('Confirming your sign-in.');

    return (
      <LearningBoredAuthPresentation
        description={
          isSuccess
            ? _('Your private-beta session is ready. The Reader will open next.')
            : isFailure
              ? _('Your library has not been changed. You can safely try again.')
              : _('LearningBored is verifying the secure response from the authentication service.')
        }
        heading={heading}
        privacyNote={_(
          'Authentication responses are used only to establish your private Reader session.',
        )}
      >
        <LearningBoredAuthStatus
          actions={
            isFailure ? (
              <LearningBoredAuthActions align='start'>
                <LearningBoredAuthButton onClick={() => router.push('/auth')} type='button'>
                  {_('Return to sign in')}
                </LearningBoredAuthButton>
              </LearningBoredAuthActions>
            ) : undefined
          }
          title={
            isSuccess
              ? _('Opening your Reader')
              : visualState === 'invalid-link'
                ? _('Invalid or expired link')
                : visualState === 'provider-error'
                  ? _('Authentication service error')
                  : _('Verifying the secure callback')
          }
          tone={isSuccess ? 'success' : isFailure ? 'error' : 'pending'}
        >
          <p>
            {isSuccess
              ? _('You will continue automatically.')
              : visualState === 'invalid-link'
                ? _('Request a fresh recovery link from the sign-in screen.')
                : visualState === 'provider-error'
                  ? _('The authentication service returned an error before a session was created.')
                  : _('Keep this page open. No action is needed.')}
          </p>
        </LearningBoredAuthStatus>
      </LearningBoredAuthPresentation>
    );
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      <span className='loading loading-infinity loading-xl w-20' />
    </div>
  );
}

export default function AuthCallback() {
  return (
    <SelectedRoutePresentation
      presentation={routePresentation}
      readest={<AuthCallbackRouteController presentation='readest' />}
      learningbored={<AuthCallbackRouteController presentation='learningbored' />}
    />
  );
}
