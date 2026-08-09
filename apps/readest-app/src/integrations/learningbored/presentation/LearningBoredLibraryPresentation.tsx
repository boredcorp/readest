'use client';

import Link from 'next/link';
import { BookOpen, LoaderCircle, LockKeyhole, SearchX, Upload, UserRound } from 'lucide-react';
import { useMemo, type ReactNode, type Ref } from 'react';

import type { BookshelfPresentation } from '@/app/library/components/bookshelfPresentation';
import type { Book } from '@/types/book';
import LearningBoredLibraryStatus, {
  getLearningBoredLibraryStatusLabels,
} from './LearningBoredLibraryStatus';
import {
  getLearningBoredDocumentForBook,
  useLearningBoredLibraryDocuments,
  type LearningBoredLibraryEnrichmentStatus,
} from '@/integrations/learningbored/library';

import LearningBoredBrandMark from './LearningBoredBrandMark';
import { useLearningBoredPresentationTheme, useLearningBoredTranslation } from './context';
import { learningBoredDirectionContractAttributes } from './direction-contract';
import styles from './LearningBoredLibraryPresentation.module.css';

export interface LearningBoredLibraryPresentationContext {
  bookshelfPresentation: BookshelfPresentation;
  documentCount: number | null;
  dueCount: number | null;
  enrichmentStatus: LearningBoredLibraryEnrichmentStatus;
}

interface LearningBoredLibraryPresentationProps {
  children: ReactNode | ((context: LearningBoredLibraryPresentationContext) => ReactNode);
}

export interface LearningBoredLibrarySurfaceProps {
  pageRef: Ref<HTMLDivElement>;
  className?: string;
  title: string;
  controlBar: ReactNode;
  breadcrumbs?: ReactNode;
  groupHeading?: ReactNode;
  children: ReactNode;
  overlays?: ReactNode;
  busy: boolean;
  syncing: boolean;
  syncProgress: number;
  documentCount: number | null;
  dueCount: number | null;
  enrichmentStatus: LearningBoredLibraryEnrichmentStatus;
  onNavigate?: (destination: 'account' | 'library') => void;
}

export interface LearningBoredLibraryEmptyStateProps {
  onImport: () => void;
}

export function LearningBoredLibraryLoadingState() {
  const _ = useLearningBoredTranslation();
  return (
    <div className={styles['loadingState']} role='status' aria-live='polite'>
      <LoaderCircle aria-hidden='true' />
      <div>
        <h2>{_('Updating your library')}</h2>
        <p>{_('Your books will appear here as soon as the local library is ready.')}</p>
      </div>
    </div>
  );
}

export function LearningBoredLibraryEmptyState({ onImport }: LearningBoredLibraryEmptyStateProps) {
  const _ = useLearningBoredTranslation();
  return (
    <div className={styles['emptyState']}>
      <div className={styles['emptyCopy']}>
        <BookOpen aria-hidden='true' />
        <div>
          <h2>{_('Bring in your first book')}</h2>
          <p>
            {_(
              'Import a supported book to read it here. When a passage gets difficult, select it and Board it.',
            )}
          </p>
        </div>
      </div>
      <button type='button' className={styles['importButton']} onClick={onImport}>
        <Upload aria-hidden='true' />
        <span>{_('Import Books')}</span>
      </button>
      <p className={styles['emptyPrivacy']}>
        <LockKeyhole aria-hidden='true' />
        <span>{_('Your books and study artifacts stay private to your account.')}</span>
      </p>
    </div>
  );
}

type Translate = (message: string, values?: Record<string, string | number>) => string;

function getStatusMessage(
  translate: Translate,
  {
    syncing,
    syncProgress,
    enrichmentStatus,
    documentCount,
    dueCount,
  }: Pick<
    LearningBoredLibrarySurfaceProps,
    'syncing' | 'syncProgress' | 'enrichmentStatus' | 'documentCount' | 'dueCount'
  >,
): string {
  if (syncing) {
    return translate('Syncing library {{progress}}%', {
      progress: Math.round(syncProgress * 100),
    });
  }
  if (enrichmentStatus === 'loading') return translate('Updating study status');
  if (enrichmentStatus === 'unavailable') {
    return translate('Study status unavailable. Your library still works.');
  }
  if (documentCount === 0) return translate('No study records yet');
  if (dueCount === 0) return translate('Nothing due');
  if (dueCount === 1) return translate('1 review due');
  return translate('{{count}} reviews due', { count: dueCount ?? 0 });
}

export function LearningBoredLibrarySurface({
  pageRef,
  className,
  title,
  controlBar,
  breadcrumbs,
  groupHeading,
  children,
  overlays,
  busy,
  syncing,
  syncProgress,
  documentCount,
  dueCount,
  enrichmentStatus,
  onNavigate,
}: LearningBoredLibrarySurfaceProps) {
  const _ = useLearningBoredTranslation();
  const statusMessage = getStatusMessage(_, {
    syncing,
    syncProgress,
    enrichmentStatus,
    documentCount,
    dueCount,
  });

  return (
    <div ref={pageRef} className={`${styles['surface']} ${className ?? ''}`}>
      <aside className={styles['rail']} aria-label={_('LearningBored navigation')}>
        {onNavigate ? (
          <button
            aria-label={_('LearningBored library')}
            className={styles['brand']}
            onClick={() => onNavigate('library')}
            type='button'
          >
            <LearningBoredBrandMark className={styles['brandMark']} />
            <span>LearningBored</span>
          </button>
        ) : (
          <Link href='/library' className={styles['brand']} aria-label={_('LearningBored library')}>
            <LearningBoredBrandMark className={styles['brandMark']} />
            <span>LearningBored</span>
          </Link>
        )}
        <nav className={styles['navigation']} aria-label={_('Primary')}>
          {onNavigate ? (
            <>
              <button
                aria-current='page'
                className={styles['navItem']}
                onClick={() => onNavigate('library')}
                type='button'
              >
                <BookOpen aria-hidden='true' />
                <span>{_('Library')}</span>
              </button>
              <button
                className={styles['navItem']}
                onClick={() => onNavigate('account')}
                type='button'
              >
                <UserRound aria-hidden='true' />
                <span>{_('Account')}</span>
              </button>
            </>
          ) : (
            <>
              <Link href='/library' className={styles['navItem']} aria-current='page'>
                <BookOpen aria-hidden='true' />
                <span>{_('Library')}</span>
              </Link>
              <Link href='/user' className={styles['navItem']}>
                <UserRound aria-hidden='true' />
                <span>{_('Account')}</span>
              </Link>
            </>
          )}
        </nav>
        <p className={styles['privacyNote']}>
          <LockKeyhole aria-hidden='true' />
          <span>{_('Private to your account')}</span>
        </p>
      </aside>

      <main
        className={styles['workPlane']}
        aria-labelledby='learningbored-library-title'
        aria-busy={busy || syncing}
      >
        <div className={styles['topologyHeader']}>
          <div className={styles['headingBlock']}>
            <h1 id='learningbored-library-title'>{title}</h1>
            <p className={styles['studyStatus']} role='status' aria-live='polite'>
              {statusMessage}
            </p>
          </div>
          <div className={styles['controlBar']}>{controlBar}</div>
        </div>
        {(breadcrumbs || groupHeading) && (
          <div className={styles['contextRail']}>
            {breadcrumbs}
            {groupHeading}
          </div>
        )}
        <div className={styles['libraryContent']}>{children}</div>
      </main>
      {overlays}
    </div>
  );
}

export default function LearningBoredLibraryPresentation({
  children,
}: LearningBoredLibraryPresentationProps) {
  const _ = useLearningBoredTranslation();
  const theme = useLearningBoredPresentationTheme();
  const { documentsByReaderBookId, status } = useLearningBoredLibraryDocuments();

  const context = useMemo<LearningBoredLibraryPresentationContext>(() => {
    const documents = Array.from(documentsByReaderBookId.values());
    return {
      enrichmentStatus: status,
      documentCount: status === 'available' ? documents.length : null,
      dueCount:
        status === 'available'
          ? documents.reduce((total, document) => total + document.dueCount, 0)
          : null,
      bookshelfPresentation: {
        getItemPriority: (item) => {
          const books = 'format' in item ? [item] : item.books;
          return books.reduce((total, book) => {
            const document = getLearningBoredDocumentForBook(book, documentsByReaderBookId);
            return total + (document?.dueCount ?? 0);
          }, 0);
        },
        emptyResult: (
          <div className={styles['noResults']} role='status'>
            <SearchX aria-hidden='true' />
            <div>
              <h2>{_('No books match this search')}</h2>
              <p>{_('Clear or change the search to return to your library.')}</p>
            </div>
          </div>
        ),
        presentItem: (item) => {
          if (!('format' in item)) return undefined;
          const document = getLearningBoredDocumentForBook(item as Book, documentsByReaderBookId);
          if (!document) {
            return {
              status: <span className={styles['documentStatus']} aria-hidden='true' />,
            };
          }
          const labels = getLearningBoredLibraryStatusLabels(document, _);
          return {
            accessibleDescription: labels?.accessibleLabel,
            status: (
              <LearningBoredLibraryStatus
                document={document}
                className={styles['documentStatus']}
              />
            ),
          };
        },
      },
    };
  }, [_, documentsByReaderBookId, status]);

  return (
    <div
      {...learningBoredDirectionContractAttributes}
      className='lb-presentation'
      data-lb-presentation='library'
      data-lb-theme={theme}
    >
      {typeof children === 'function' ? children(context) : children}
    </div>
  );
}
