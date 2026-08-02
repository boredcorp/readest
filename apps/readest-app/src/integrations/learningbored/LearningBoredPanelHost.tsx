'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';

import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import type { BookNote } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import { getLearningBoredBookId } from './book';
import { subscribeToLearningBoredCaptures } from './bridge';
import type { LearningBoredClient, LearningBoredReaderDocument } from './client';
import LearningBoredCapturePanel from './LearningBoredCapturePanel';
import LearningBoredReviewPanel from './LearningBoredReviewPanel';
import { resolveLearningBoredCfiLocation } from './location';
import {
  clearLearningBoredReaderSession,
  readLearningBoredReaderSession,
  writeLearningBoredReaderSession,
  type LearningBoredReaderSession,
} from './session';
import { createLearningBoredTemporaryHighlightCallbacks } from './source-span';

const LearningBoredClientContext = createContext<LearningBoredClient | null>(null);

export const LearningBoredClientProvider = LearningBoredClientContext.Provider;

interface ActiveLearningBoredPanel {
  bookKey: string;
  session: LearningBoredReaderSession;
  revision: number;
}

export interface LearningBoredPanelHostProps {
  /** Overrides the context in tests and in shallow application adapters. */
  client?: LearningBoredClient | null;
}

function persistSession(session: LearningBoredReaderSession): void {
  const { version: _version, ...value } = session;
  writeLearningBoredReaderSession(value);
}

const LearningBoredPanelHost: React.FC<LearningBoredPanelHostProps> = ({
  client: clientOverride,
}) => {
  const _ = useTranslation();
  const contextClient = useContext(LearningBoredClientContext);
  const client = clientOverride === undefined ? contextClient : clientOverride;
  const { sideBarBookKey } = useSidebarStore();
  const { getBookData } = useBookDataStore();
  const { getView } = useReaderStore();
  const activeBookData = sideBarBookKey ? getBookData(sideBarBookKey) : null;
  const [active, setActive] = useState<ActiveLearningBoredPanel | null>(null);
  const [reviewScope, setReviewScope] = useState<{ documentId: string } | null>(null);

  useEffect(() => {
    return subscribeToLearningBoredCaptures(({ bookKey, passage }) => {
      const previous = readLearningBoredReaderSession(passage.bookId);
      const session: LearningBoredReaderSession = {
        version: 2,
        bookId: passage.bookId,
        panelOpen: true,
        passage,
        generationId: null,
        boardId: null,
        showScaffold: previous?.showScaffold ?? true,
        kind: previous?.kind ?? null,
        updatedAt: Date.now(),
      };
      persistSession(session);
      setActive((current) => ({
        bookKey,
        session,
        revision: (current?.revision ?? 0) + 1,
      }));
    });
  }, []);

  useEffect(() => {
    if (!sideBarBookKey || !activeBookData?.book) {
      setActive(null);
      return;
    }
    const bookId = getLearningBoredBookId(sideBarBookKey, activeBookData.book);

    setActive((current) => {
      if (current?.bookKey === sideBarBookKey) return current;
      const restored = readLearningBoredReaderSession(bookId);
      if (!restored?.passage) return null;
      return {
        bookKey: sideBarBookKey,
        session: restored,
        revision: (current?.revision ?? 0) + 1,
      };
    });
  }, [activeBookData?.book, sideBarBookKey]);

  const panelBookData = active ? getBookData(active.bookKey) : null;
  const document = useMemo<LearningBoredReaderDocument | null>(() => {
    const book = panelBookData?.book;
    if (!active || !book) return null;
    return {
      bookId: active.session.bookId,
      title: book.title,
      ...(book.author?.trim() ? { author: book.author.trim() } : {}),
      format: book.format,
    };
  }, [active, panelBookData?.book]);

  const highlighter = useMemo(() => {
    const passage = active?.session.passage;
    const view = active ? getView(active.bookKey) : null;
    if (!passage || !view) return null;

    return createLearningBoredTemporaryHighlightCallbacks({
      resolveSelectedRange: () => {
        const resolution = resolveLearningBoredCfiLocation(
          passage.location,
          { bookId: passage.bookId, selectedText: passage.selectedText },
          {
            resolveCFI: (cfi) => view.resolveCFI(cfi),
            getDocument: (index) => {
              const contents = view.renderer.getContents?.() ?? [];
              return (
                contents.find((content) => content.index === index)?.doc ??
                (contents.length === 1 ? contents[0]?.doc : undefined)
              );
            },
          },
        );
        return resolution.ok ? resolution.range : null;
      },
      applyHighlight: (range) => {
        const cfi = view.getCFI(passage.location.pageIndex, range);
        if (!cfi) return;

        const now = Date.now();
        const annotation: BookNote = {
          id: `learningbored-anchor-${passage.bookId}`,
          type: 'annotation',
          cfi,
          text: range.toString(),
          style: 'underline',
          color: '#d9a83f',
          note: '',
          createdAt: now,
          updatedAt: now,
        };
        try {
          view.addAnnotation(annotation);
        } catch {
          return;
        }
        return () => {
          try {
            view.addAnnotation(annotation, true);
          } catch {}
        };
      },
    });
  }, [active?.bookKey, active?.session.passage, getView]);

  useEffect(() => () => highlighter?.clear(), [highlighter]);

  const patchSession = useCallback(
    (
      patch: Partial<
        Pick<LearningBoredReaderSession, 'generationId' | 'boardId' | 'showScaffold' | 'kind'>
      >,
    ) => {
      setActive((current) => {
        if (!current) return current;
        const session = { ...current.session, ...patch, updatedAt: Date.now() };
        persistSession(session);
        return { ...current, session };
      });
    },
    [],
  );

  const setPanelOpen = useCallback((panelOpen: boolean) => {
    setActive((current) => {
      if (!current) return current;
      const session = { ...current.session, panelOpen, updatedAt: Date.now() };
      persistSession(session);
      return { ...current, session };
    });
  }, []);

  const clearPanel = useCallback(() => {
    setActive((current) => {
      if (current) clearLearningBoredReaderSession(current.session.bookId);
      return null;
    });
    highlighter?.clear();
  }, [highlighter]);

  if (reviewScope && client) {
    return (
      <LearningBoredReviewPanel
        client={client}
        documentId={reviewScope.documentId}
        onClose={() => setReviewScope(null)}
      />
    );
  }

  if (!active?.session.passage) return null;

  if (!active.session.panelOpen) {
    return (
      <button
        type='button'
        className='btn btn-primary relative z-10 h-12 min-h-12 w-full shrink-0 rounded-none p-0 sm:h-12 sm:w-12'
        aria-label={_('Open LearningBored Board panel')}
        title={_('Open LearningBored Board panel')}
        onClick={() => setPanelOpen(true)}
      >
        <LayoutDashboard className='size-5' />
      </button>
    );
  }

  return (
    <LearningBoredCapturePanel
      key={`${active.bookKey}:${active.revision}`}
      isOpen={true}
      session={active.session}
      document={document}
      client={client}
      onClose={() => setPanelOpen(false)}
      onClear={clearPanel}
      onStartReview={(documentId) => setReviewScope({ documentId })}
      onSessionPatch={patchSession}
      onSourceSpanEnter={highlighter?.show}
      onSourceSpanLeave={highlighter?.clear}
    />
  );
};

export default LearningBoredPanelHost;
