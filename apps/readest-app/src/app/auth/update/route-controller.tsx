'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import LearningBoredAuthPresentation, {
  LearningBoredAuthActions,
  LearningBoredAuthButton,
  LearningBoredAuthField,
  LearningBoredAuthMessage,
  LearningBoredAuthStatus,
} from '@/integrations/learningbored/presentation/LearningBoredAuthPresentation';
import { supabase } from '@/utils/supabase';

type UpdateEmailPresentation = 'readest' | 'learningbored';

export function UpdateEmailRouteController({
  presentation,
}: {
  presentation: UpdateEmailPresentation;
}) {
  const _ = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { isDarkMode } = useThemeStore();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      router.push('/auth');
    }
  }, [user, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        email,
      });

      if (updateError) throw updateError;

      setMessage(
        _(
          'Confirmation email sent! Please check your old and new email addresses to confirm the change.',
        ),
      );
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : _('Failed to update email'));
    } finally {
      setLoading(false);
    }
  };

  if (presentation === 'learningbored') {
    if (!user) {
      return (
        <LearningBoredAuthPresentation
          description={_('Checking the active Reader session before account details are shown.')}
          heading={_('Preparing your account.')}
        >
          <LearningBoredAuthStatus title={_('Checking your session')}>
            <p>{_('You will return to sign in if this session is no longer active.')}</p>
          </LearningBoredAuthStatus>
        </LearningBoredAuthPresentation>
      );
    }

    return (
      <LearningBoredAuthPresentation
        backLabel={_('Back')}
        description={_(
          'Enter the new email address you want to use for future private-beta sign-ins.',
        )}
        heading={_('Change your sign-in email.')}
        onBack={() => router.back()}
        privacyNote={_(
          'The change is applied only after both addresses complete the confirmation steps.',
        )}
      >
        <form aria-label={_('Update sign-in email')} data-lb-auth-form onSubmit={handleSubmit}>
          <LearningBoredAuthField
            autoComplete='email'
            disabled={loading}
            hint={
              user.email
                ? `${_('Current email')}: ${user.email}`
                : _('Use an address you can access now.')
            }
            id='email'
            label={_('New Email')}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={_('Your new email')}
            required
            type='email'
            value={email}
          />

          {error && <LearningBoredAuthMessage tone='error'>{error}</LearningBoredAuthMessage>}
          {message && <LearningBoredAuthMessage tone='success'>{message}</LearningBoredAuthMessage>}

          <LearningBoredAuthActions>
            <LearningBoredAuthButton disabled={loading || !email} type='submit'>
              {loading ? _('Updating email ...') : _('Update email')}
            </LearningBoredAuthButton>
            <LearningBoredAuthButton
              disabled={loading}
              onClick={() => router.back()}
              type='button'
              variant='secondary'
            >
              {_('Cancel')}
            </LearningBoredAuthButton>
          </LearningBoredAuthActions>
        </form>
      </LearningBoredAuthPresentation>
    );
  }

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-md p-8'>
        <div className={`rounded-md p-8`}>
          <form onSubmit={handleSubmit} className='space-y-6'>
            <div className='space-y-1'>
              <label
                htmlFor='email'
                className={`block text-sm font-normal ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`}
              >
                {_('New Email')}
              </label>
              <input
                id='email'
                type='email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={_('Your new email')}
                required
                disabled={loading}
                className={`w-full rounded-md border bg-transparent px-4 py-2.5 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 ${isDarkMode ? 'text-gray-300' : 'text-gray-400'}`}
              />
            </div>

            {error && <div className={`text-sm text-red-500`}>{error}</div>}

            {message && <div className={`text-base-content text-sm`}>{message}</div>}

            <button
              type='submit'
              disabled={loading || !email}
              className={`w-full rounded-md bg-green-400 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed`}
            >
              {loading ? _('Updating email ...') : _('Update email')}
            </button>

            <button
              onClick={() => router.back()}
              className={`flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm transition-colors ${
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
          </form>

          {user?.email && (
            <div className={`mt-6 text-center text-sm text-gray-300`}>
              {_('Current email')}: {user.email}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
