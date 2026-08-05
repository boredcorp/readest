import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import Link from './Link';
import { getLearningBoredPrivateBetaPolicy } from '@/integrations/learningbored/private-beta-policy';

const privateBetaPolicy = getLearningBoredPrivateBetaPolicy();

const LegalLinks = () => {
  const _ = useTranslation();
  const { appService } = useEnv();

  const termsUrl = privateBetaPolicy.active
    ? 'https://learningbored.com/terms'
    : appService?.isIOSApp || appService?.isMacOSApp
      ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
      : 'https://readest.com/terms-of-service';
  const privacyUrl = privateBetaPolicy.active
    ? 'https://learningbored.com/privacy'
    : 'https://readest.com/privacy-policy';

  return (
    <div className='my-2 flex flex-wrap justify-center gap-4 text-sm sm:text-xs'>
      <Link href={termsUrl} className='text-blue-500 underline hover:text-blue-600'>
        {_('Terms of Service')}
      </Link>
      <Link href={privacyUrl} className='text-blue-500 underline hover:text-blue-600'>
        {_('Privacy Policy')}
      </Link>
      {privateBetaPolicy.active && (
        <Link
          href='https://learningbored.com/cookies'
          className='text-blue-500 underline hover:text-blue-600'
        >
          {_('Cookie Notice')}
        </Link>
      )}
    </div>
  );
};

export default LegalLinks;
