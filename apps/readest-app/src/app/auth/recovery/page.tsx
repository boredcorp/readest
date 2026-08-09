'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';

import { useAuth } from '@/context/AuthContext';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import LearningBoredAuthPresentation, {
  LearningBoredAuthActions,
  LearningBoredAuthButton,
  LearningBoredAuthStatus,
} from '@/integrations/learningbored/presentation/LearningBoredAuthPresentation';
import SelectedRoutePresentation from '@/integrations/learningbored/presentation/SelectedRoutePresentation';
import { getLearningBoredRoutePresentation } from '@/integrations/learningbored/presentation/selection';
import { supabase } from '@/utils/supabase';

type RecoveryPresentation = 'readest' | 'learningbored';
type RecoveryState = 'checking' | 'ready' | 'success' | 'invalid' | 'check-error';

const routePresentation = getLearningBoredRoutePresentation();

function RecoveryRouteController({ presentation }: { presentation: RecoveryPresentation }) {
  const _ = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const { isDarkMode } = useThemeStore();
  const [recoveryState, setRecoveryState] = useState<RecoveryState>(
    presentation === 'learningbored' ? 'checking' : 'ready',
  );
  const [validationAttempt, setValidationAttempt] = useState(0);

  const getAuthLocalization = () => {
    return {
      variables: {
        update_password: {
          password_label: _('New Password'),
          password_input_placeholder: _('Your new password'),
          button_label: _('Update password'),
          loading_button_label: _('Updating password ...'),
          confirmation_text: _('Your password has been updated'),
        },
      },
    };
  };

  useEffect(() => {
    let cancelled = false;

    const validateRecoverySession = async () => {
      if (presentation !== 'learningbored') return;

      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setRecoveryState('check-error');
          return;
        }
        setRecoveryState(data.session ? 'ready' : 'invalid');
      } catch {
        if (!cancelled) setRecoveryState('check-error');
      }
    };

    void validateRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [presentation, validationAttempt]);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token && session.user && event === 'USER_UPDATED') {
        if (presentation === 'learningbored') setRecoveryState('success');
        login(session.access_token, session.user);
        const redirectTo = new URLSearchParams(window.location.search).get('redirect');
        router.push(redirectTo ?? '/library');
      }
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
    // login is intentionally omitted to preserve the canonical subscription lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation, router]);

  const retryRecoverySessionCheck = () => {
    setRecoveryState('checking');
    setValidationAttempt((attempt) => attempt + 1);
  };

  const recoveryForm = (
    <Auth
      supabaseClient={supabase}
      view='update_password'
      appearance={{ theme: ThemeSupa }}
      theme={isDarkMode ? 'dark' : 'light'}
      magicLink={false}
      providers={[]}
      localization={getAuthLocalization()}
    />
  );

  if (presentation === 'learningbored') {
    if (recoveryState === 'checking') {
      return (
        <LearningBoredAuthPresentation
          description={_(
            'Checking that this recovery link belongs to an active private-beta session.',
          )}
          heading={_('Verifying your recovery link.')}
          privacyNote={_(
            'Recovery links are single-use and should only be opened on a device you trust.',
          )}
        >
          <LearningBoredAuthStatus title={_('Checking link validity')}>
            <p>{_('Keep this page open. No action is needed yet.')}</p>
          </LearningBoredAuthStatus>
        </LearningBoredAuthPresentation>
      );
    }

    if (recoveryState === 'invalid') {
      return (
        <LearningBoredAuthPresentation
          description={_('This single-use link is invalid, expired, or has already been used.')}
          heading={_('Request a fresh recovery link.')}
          privacyNote={_('Your password and private library have not been changed.')}
        >
          <LearningBoredAuthStatus
            actions={
              <LearningBoredAuthActions>
                <LearningBoredAuthButton
                  onClick={() => router.push('/auth?task=reset')}
                  type='button'
                >
                  {_('Request another link')}
                </LearningBoredAuthButton>
                <LearningBoredAuthButton
                  onClick={() => router.push('/auth')}
                  type='button'
                  variant='secondary'
                >
                  {_('Back to sign in')}
                </LearningBoredAuthButton>
              </LearningBoredAuthActions>
            }
            title={_('Invalid or expired recovery link')}
            tone='error'
          >
            <p>{_('Only the newest recovery email will contain a usable link.')}</p>
          </LearningBoredAuthStatus>
        </LearningBoredAuthPresentation>
      );
    }

    if (recoveryState === 'check-error') {
      return (
        <LearningBoredAuthPresentation
          description={_(
            'The authentication service did not answer, so LearningBored cannot verify this link yet.',
          )}
          heading={_('Keep this recovery link open.')}
          privacyNote={_(
            'This link may still be valid. Retry the check here before requesting or opening another link.',
          )}
        >
          <LearningBoredAuthStatus
            actions={
              <LearningBoredAuthActions align='start'>
                <LearningBoredAuthButton onClick={retryRecoverySessionCheck} type='button'>
                  {_('Retry link check')}
                </LearningBoredAuthButton>
              </LearningBoredAuthActions>
            }
            title={_('Recovery link check unavailable')}
            tone='error'
          >
            <p>{_('A temporary connection or provider problem prevented the check.')}</p>
          </LearningBoredAuthStatus>
        </LearningBoredAuthPresentation>
      );
    }

    if (recoveryState === 'success') {
      return (
        <LearningBoredAuthPresentation
          description={_('Your new password is active and your private-beta session is ready.')}
          heading={_('Password updated.')}
        >
          <LearningBoredAuthStatus title={_('Opening your library')} tone='success'>
            <p>{_('You will continue automatically.')}</p>
          </LearningBoredAuthStatus>
        </LearningBoredAuthPresentation>
      );
    }

    return (
      <LearningBoredAuthPresentation
        backLabel={_('Back')}
        description={_('Choose a new password for the account connected to this recovery link.')}
        heading={_('Set a new password.')}
        onBack={() => router.back()}
        privacyNote={_(
          'Updating your password does not change your library, Boards, or review history.',
        )}
      >
        {recoveryForm}
      </LearningBoredAuthPresentation>
    );
  }

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-md p-8'>
        {recoveryForm}

        <button
          onClick={() => router.back()}
          className={`mt-6 flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm transition-colors ${
            isDarkMode
              ? 'border-gray-600 text-gray-300 hover:bg-gray-800'
              : 'border-gray-300 text-gray-700 hover:bg-gray-100'
          }`}
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='h-4 w-4'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M15 19l-7-7 7-7'
            />
          </svg>
          {_('Back')}
        </button>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <SelectedRoutePresentation
      presentation={routePresentation}
      readest={<RecoveryRouteController presentation='readest' />}
      learningbored={<RecoveryRouteController presentation='learningbored' />}
    />
  );
}
