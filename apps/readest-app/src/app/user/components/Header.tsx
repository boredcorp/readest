import clsx from 'clsx';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { IoArrowBack } from 'react-icons/io5';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useTrafficLightStore } from '@/store/trafficLightStore';
import WindowButtons from '@/components/WindowButtons';

interface ProfileHeaderProps {
  onGoBack: () => void;
  className?: string;
  buttonClassName?: string;
  iconClassName?: string;
  title?: ReactNode;
  style?: CSSProperties;
  fixed?: boolean;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  onGoBack,
  className,
  buttonClassName,
  iconClassName,
  title,
  style,
  fixed = true,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { isTrafficLightVisible } = useTrafficLightStore();
  const headerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={headerRef}
      className={clsx(
        fixed && 'fixed',
        'z-30 flex w-full items-center justify-between py-2 pe-6 ps-4',
        appService?.hasTrafficLight && 'pt-11',
        className,
      )}
      style={style}
    >
      <button
        aria-label={_('Go Back')}
        onClick={onGoBack}
        className={clsx(
          'btn btn-ghost h-12 min-h-12 w-12 p-0 sm:h-8 sm:min-h-8 sm:w-8',
          buttonClassName,
        )}
      >
        <IoArrowBack className={clsx('text-base-content', iconClassName)} />
      </button>

      {title}

      {appService?.hasWindowBar && (
        <WindowButtons
          headerRef={headerRef}
          showMinimize={!isTrafficLightVisible}
          showMaximize={!isTrafficLightVisible}
          showClose={!isTrafficLightVisible}
          onClose={onGoBack}
        />
      )}
    </div>
  );
};
export default ProfileHeader;
