import type { ReactNode } from 'react';

import type { Book, BooksGroup } from '@/types/book';

export interface BookshelfItemPresentation {
  accessibleDescription?: string;
  status?: ReactNode;
}

/**
 * Optional presentation data owned by a selected route renderer.
 *
 * The generic shelf never knows where enrichment came from. When this
 * contract is absent, Readest keeps its canonical ordering and item DOM.
 */
export interface BookshelfPresentation {
  presentItem?: (item: Book | BooksGroup) => BookshelfItemPresentation | undefined;
  emptyResult?: ReactNode;
}

export function getBookshelfScrollBehavior(
  prefersReducedMotion: boolean,
  isEink: boolean,
): ScrollBehavior {
  return prefersReducedMotion || isEink ? 'auto' : 'smooth';
}
