import { useRouter } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { openAccountDeletion } from '@/libs/user';
import { saveSysSettings } from '@/helpers/settings';
import { navigateToLibrary, navigateToResetPassword, navigateToUpdatePassword } from '@/utils/nav';

export const useUserActions = () => {
  const router = useRouter();
  const { envConfig } = useEnv();
  const { logout } = useAuth();

  const handleLogout = () => {
    void logout().catch((error) => {
      console.error('Failed to revoke the local Supabase session:', error);
    });
    saveSysSettings(envConfig, 'keepLogin', false);
    navigateToLibrary(router);
  };

  const handleResetPassword = () => {
    navigateToResetPassword(router);
  };

  const handleUpdateEmail = () => {
    navigateToUpdatePassword(router);
  };

  const handleConfirmDelete = () => {
    openAccountDeletion();
  };

  return {
    handleLogout,
    handleUpdateEmail,
    handleResetPassword,
    handleConfirmDelete,
  };
};
