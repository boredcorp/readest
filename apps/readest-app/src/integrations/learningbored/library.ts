'use client';

import { useEffect, useMemo, useState } from 'react';

import type { Book, BooksGroup } from '@/types/book';
import { getLearningBoredBookId } from './book';
import type { LearningBoredDocumentSummary } from './client';
import { useLearningBoredClient } from './LearningBoredClientContext';

export type LearningBoredLibraryDocumentMap = ReadonlyMap<string, LearningBoredDocumentSummary>;

function documentForBook(
  book: Book,
  documentsByReaderBookId: LearningBoredLibraryDocumentMap,
): LearningBoredDocumentSummary | undefined {
  return documentsByReaderBookId.get(getLearningBoredBookId(book.hash, book));
}

function attentionCount(
  item: Book | BooksGroup,
  documentsByReaderBookId: LearningBoredLibraryDocumentMap,
): number {
  if ('format' in item) return documentForBook(item, documentsByReaderBookId)?.dueCount ?? 0;
  return item.books.reduce(
    (count, book) => count + (documentForBook(book, documentsByReaderBookId)?.dueCount ?? 0),
    0,
  );
}

export function sortLearningBoredLibraryItemsByAttention(
  items: readonly (Book | BooksGroup)[],
  documentsByReaderBookId: LearningBoredLibraryDocumentMap,
): (Book | BooksGroup)[] {
  return items
    .map((item, index) => ({
      item,
      index,
      dueCount: attentionCount(item, documentsByReaderBookId),
    }))
    .sort((left, right) => right.dueCount - left.dueCount || left.index - right.index)
    .map(({ item }) => {
      if ('format' in item) return item;
      const books = item.books
        .map((book, index) => ({
          book,
          index,
          dueCount: documentForBook(book, documentsByReaderBookId)?.dueCount ?? 0,
        }))
        .sort((left, right) => right.dueCount - left.dueCount || left.index - right.index)
        .map(({ book }) => book);
      return { ...item, books };
    });
}

export function useLearningBoredLibraryDocuments(): {
  documentsByReaderBookId: LearningBoredLibraryDocumentMap;
} {
  const client = useLearningBoredClient();
  const [documents, setDocuments] = useState<LearningBoredDocumentSummary[]>([]);

  useEffect(() => {
    if (!client) {
      setDocuments([]);
      return;
    }

    const controller = new AbortController();
    void client
      .listDocuments({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setDocuments(result.documents);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDocuments([]);
      });
    return () => controller.abort();
  }, [client]);

  const documentsByReaderBookId = useMemo(() => {
    const mapped = new Map<string, LearningBoredDocumentSummary>();
    for (const document of documents) {
      if (document.readerBookId) mapped.set(document.readerBookId, document);
    }
    return mapped;
  }, [documents]);

  return { documentsByReaderBookId };
}

export function getLearningBoredDocumentForBook(
  book: Book,
  documentsByReaderBookId: LearningBoredLibraryDocumentMap,
): LearningBoredDocumentSummary | undefined {
  return documentForBook(book, documentsByReaderBookId);
}
