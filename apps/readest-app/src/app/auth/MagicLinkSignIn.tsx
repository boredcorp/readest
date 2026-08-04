'use client';

import { FormEvent, useState } from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/utils/supabase';

interface MagicLinkSignInProps {
  redirectTo: string;
}

export default function MagicLinkSignIn({ redirectTo }: MagicLinkSignInProps) {
  const _ = useTranslation();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail || isSubmitting) return;

    setIsSubmitting(true);
    setIsSent(false);
    setHasError(false);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });

      if (error) {
        setHasError(true);
        return;
      }

      setIsSent(true);
    } catch {
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='text-base-content w-full'>
      <div className='mb-6 text-center'>
        <h1 className='text-2xl font-semibold'>{_('Sign in')}</h1>
        <p className='text-base-content/70 mt-2 text-sm'>
          {_('Enter your email address to receive a magic link.')}
        </p>
        <p className='text-base-content/55 mt-1 text-xs'>{_('Beta access is invite only.')}</p>
      </div>

      <form className='space-y-4' aria-busy={isSubmitting} onSubmit={handleSubmit}>
        <label className='form-control w-full'>
          <span className='label-text mb-2 text-sm'>{_('Email address')}</span>
          <input
            type='email'
            name='email'
            value={email}
            autoComplete='email'
            autoCapitalize='none'
            spellCheck={false}
            required
            disabled={isSubmitting}
            className='input input-bordered h-12 w-full focus:outline-none focus:ring-0'
            placeholder={_('Your email address')}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <button
          type='submit'
          className='btn btn-primary h-12 min-h-12 w-full'
          disabled={isSubmitting}
        >
          {isSubmitting ? _('Signing in ...') : _('Send a magic link email')}
        </button>
      </form>

      <div className='mt-4 min-h-10 text-center text-sm' aria-live='polite'>
        {isSent ? (
          <p role='status' className='text-success'>
            {_('Check your email for the magic link')}
          </p>
        ) : null}
        {hasError ? (
          <p role='alert' className='text-error'>
            {_('Unable to send a magic link. Make sure this email has beta access and try again.')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
