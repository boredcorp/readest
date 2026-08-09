'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import LearningBoredAuthPresentation, {
  LearningBoredAuthActions,
  LearningBoredAuthButton,
  LearningBoredAuthStatus,
} from '@/integrations/learningbored/presentation/LearningBoredAuthPresentation';
import SelectedRoutePresentation from '@/integrations/learningbored/presentation/SelectedRoutePresentation';
import { getLearningBoredRoutePresentation } from '@/integrations/learningbored/presentation/selection';

type AuthErrorPresentation = 'readest' | 'learningbored';
type AuthErrorReason = 'generic' | 'invalid-link' | 'provider-error';

const routePresentation = getLearningBoredRoutePresentation();

function AuthErrorRouteController({ presentation }: { presentation: AuthErrorPresentation }) {
  const _ = useTranslation();
  const router = useRouter();
  const [reason, setReason] = useState<AuthErrorReason>('generic');
  useTheme({ systemUIVisible: false });

  useEffect(() => {
    if (presentation === 'learningbored') {
      const requestedReason = new URLSearchParams(window.location.search).get('reason');
      setReason(
        requestedReason === 'invalid-link' || requestedReason === 'provider-error'
          ? requestedReason
          : 'generic',
      );
      return;
    }

    const timer = setTimeout(() => {
      router.push('/auth');
    }, 3000);

    return () => clearTimeout(timer);
  }, [presentation, router]);

  if (presentation === 'learningbored') {
    const isInvalidLink = reason === 'invalid-link';

    return (
      <LearningBoredAuthPresentation
        description={
          isInvalidLink
            ? _('The single-use link is no longer valid. Your account and library are unchanged.')
            : _(
                'The authentication service did not create a session. Your account and library are unchanged.',
              )
        }
        heading={
          isInvalidLink ? _('Request a new recovery link.') : _('Sign-in needs another try.')
        }
        privacyNote={_(
          'LearningBored never asks you to reuse an expired link or share a recovery code.',
        )}
      >
        <LearningBoredAuthStatus
          actions={
            <LearningBoredAuthActions>
              <LearningBoredAuthButton
                onClick={() => router.push(isInvalidLink ? '/auth?task=reset' : '/auth')}
                type='button'
              >
                {isInvalidLink ? _('Request another link') : _('Try sign-in again')}
              </LearningBoredAuthButton>
              {isInvalidLink && (
                <LearningBoredAuthButton
                  onClick={() => router.push('/auth')}
                  type='button'
                  variant='secondary'
                >
                  {_('Back to sign in')}
                </LearningBoredAuthButton>
              )}
            </LearningBoredAuthActions>
          }
          title={
            isInvalidLink
              ? _('Invalid or expired recovery link')
              : reason === 'provider-error'
                ? _('Authentication service error')
                : _('Session could not be established')
          }
          tone='error'
        >
          <p>
            {isInvalidLink
              ? _('Request a fresh link below. Only the newest recovery link should be used.')
              : _('Return to sign in and retry when you are ready.')}
          </p>
        </LearningBoredAuthStatus>
      </LearningBoredAuthPresentation>
    );
  }

  return (
    <div className='bg-base-200/50 text-base-content hero h-screen items-center justify-center'>
      <div className='hero-content text-neutral-content text-center'>
        <div className='max-w-md'>
          <p className='mb-5'>You will be redirected to the login page shortly...</p>
          <button className='btn btn-primary rounded-xl' onClick={() => router.push('/auth')}>
            Go to Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <SelectedRoutePresentation
      presentation={routePresentation}
      readest={<AuthErrorRouteController presentation='readest' />}
      learningbored={<AuthErrorRouteController presentation='learningbored' />}
    />
  );
}
