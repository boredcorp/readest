import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import Link from './Link';
import { getStoryBoredLegalLinks } from './storyboredLegalLinks';

const LegalLinks = () => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const legalLinks = getStoryBoredLegalLinks(process.env['NEXT_PUBLIC_MARKETPLACE_URL']);

  if (!legalLinks) {
    return (
      <p className='text-base-content/70 my-2 text-center text-sm sm:text-xs' role='status'>
        {_('StoryBored Terms and Privacy links are pending owner approval.')}
      </p>
    );
  }

  const termsUrl =
    appService?.isIOSApp || appService?.isMacOSApp
      ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
      : legalLinks.termsUrl;
  const termsLabel =
    appService?.isIOSApp || appService?.isMacOSApp
      ? _('Apple Terms of Use')
      : _('Terms publication status');

  return (
    <div className='my-2 text-center text-sm sm:text-xs'>
      <p className='text-base-content/70' role='status'>
        {_(
          'StoryBored legal documents are pending owner approval; these links show publication status.',
        )}
      </p>
      <div className='mt-2 flex flex-wrap justify-center gap-4'>
        <Link href={termsUrl} className='text-blue-500 underline hover:text-blue-600'>
          {termsLabel}
        </Link>
        <Link href={legalLinks.privacyUrl} className='text-blue-500 underline hover:text-blue-600'>
          {_('Privacy notice status')}
        </Link>
      </div>
    </div>
  );
};

export default LegalLinks;
