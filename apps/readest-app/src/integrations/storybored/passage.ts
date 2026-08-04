import type { Book, BookProgress } from '@/types/book';
import type { BookDoc } from '@/libs/document';
import { findTocItemBS } from '@/services/nav';
import type { TextSelection } from '@/utils/sel';
import { getSelectionContext } from './passage-context';
import type { StoryBoredPassage } from './types';

interface CreateStoryBoredPassageInput {
  bookKey: string;
  book?: Book;
  bookDoc?: BookDoc;
  progress?: BookProgress;
  selection: TextSelection;
}

export function getStoryBoredBookId(bookKey: string, book?: Book): string {
  if (book?.marketplace) {
    return book.marketplace.sourceKey || book.hash;
  }
  return book?.metaHash || book?.hash || bookKey.split('-')[0] || bookKey;
}

function getChapter(bookDoc: BookDoc | undefined, selection: TextSelection): string | undefined {
  if (!bookDoc?.toc?.length || !selection.cfi) return undefined;
  return findTocItemBS(bookDoc.toc, selection.cfi)?.label;
}

function getLocation(selection: TextSelection, progress?: BookProgress): string | undefined {
  const parts = [
    selection.cfi ? `cfi:${selection.cfi}` : undefined,
    progress?.sectionHref ? `href:${progress.sectionHref}` : undefined,
    selection.page ? `page:${selection.page}` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function createStoryBoredPassage({
  bookKey,
  book,
  bookDoc,
  progress,
  selection,
}: CreateStoryBoredPassageInput): StoryBoredPassage {
  const passage: StoryBoredPassage = {
    bookId: getStoryBoredBookId(bookKey, book),
    selectedText: selection.text.trim(),
    stylePreset: 'cinematic-literary',
  };
  const surroundingContext = getSelectionContext(selection.range, book?.primaryLanguage);
  const chapter = getChapter(bookDoc, selection);
  const location = getLocation(selection, progress);

  if (book?.title) passage.bookTitle = book.title;
  if (surroundingContext) passage.surroundingContext = surroundingContext;
  if (chapter) passage.chapter = chapter;
  if (location) passage.location = location;

  return passage;
}
