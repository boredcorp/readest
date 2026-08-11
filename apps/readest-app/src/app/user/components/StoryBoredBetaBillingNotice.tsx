import { useTranslation } from '@/hooks/useTranslation';

interface StoryBoredStripeSandboxNoticeProps {
  includeTeamNotice?: boolean;
}

export const StoryBoredStripeSandboxNotice: React.FC<StoryBoredStripeSandboxNoticeProps> = ({
  includeTeamNotice = false,
}) => {
  const _ = useTranslation();

  return (
    <div
      aria-label={_('Private beta billing notice')}
      className='mx-4 space-y-1 rounded-lg bg-amber-100 px-4 py-3 text-center text-sm font-medium text-amber-900 sm:mx-0'
      role='note'
    >
      <p>{_('Stripe sandbox during private beta — no real charges will be made.')}</p>
      {includeTeamNotice ? (
        <p>
          {_(
            'Team and Education plans are coming soon and are not available during the private beta.',
          )}
        </p>
      ) : null}
    </div>
  );
};

const StoryBoredBetaBillingNotice: React.FC = () => (
  <StoryBoredStripeSandboxNotice includeTeamNotice />
);

export default StoryBoredBetaBillingNotice;
