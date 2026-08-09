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
  /**
   * Returns a presentation-only priority for an already canonically sorted item.
   * The shelf evaluates this once per item and derives a stable copy; it never
   * mutates the Reader collection or its persisted sort preference.
   */
  getItemPriority?: (item: Book | BooksGroup) => number;
  presentItem?: (item: Book | BooksGroup) => BookshelfItemPresentation | undefined;
  emptyResult?: ReactNode;
}

export function orderBookshelfItemsForPresentation<TItem extends Book | BooksGroup>(
  items: readonly TItem[],
  presentation?: BookshelfPresentation,
): readonly TItem[] {
  const getItemPriority = presentation?.getItemPriority;
  if (!getItemPriority) return items;

  return items
    .map((item, canonicalIndex) => ({
      item,
      canonicalIndex,
      priority: getItemPriority(item),
    }))
    .sort(
      (left, right) => right.priority - left.priority || left.canonicalIndex - right.canonicalIndex,
    )
    .map(({ item }) => item);
}

export function getBookshelfScrollBehavior(
  prefersReducedMotion: boolean,
  isEink: boolean,
): ScrollBehavior {
  return prefersReducedMotion || isEink ? 'auto' : 'smooth';
}
