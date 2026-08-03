import { useEnv } from '@/context/EnvContext';
import { useRouter } from 'next/navigation';
import { useTransitionRouter } from 'next-view-transitions';
import { useMemo } from 'react';

const isReaderRoute = (href: string) => {
  const pathname = href.split(/[?#]/, 1)[0] ?? '';
  return pathname === '/reader' || pathname.startsWith('/reader/');
};

export const useAppRouter = () => {
  const { appService } = useEnv();
  const transitionRouter = useTransitionRouter();
  const plainRouter = useRouter();

  const router = useMemo<ReturnType<typeof useRouter>>(
    () => ({
      ...transitionRouter,
      push: (href, options) => {
        const targetRouter = isReaderRoute(href) ? plainRouter : transitionRouter;
        targetRouter.push(href, options);
      },
      replace: (href, options) => {
        const targetRouter = isReaderRoute(href) ? plainRouter : transitionRouter;
        targetRouter.replace(href, options);
      },
    }),
    [plainRouter, transitionRouter],
  );

  // View Transitions API crashes WebKitGTK 4.1 on Linux
  if (appService?.isLinuxApp) return plainRouter;

  // Opening a book mounts and lays out the complete reader. That work can exceed
  // the browser View Transition API's DOM-update budget, which rejects the
  // transition with a TimeoutError even though navigation succeeds. Keep the
  // transition router for lighter routes and navigate into the reader plainly.
  return router;
};
