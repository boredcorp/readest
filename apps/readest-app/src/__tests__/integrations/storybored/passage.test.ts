import { describe, expect, it } from 'vitest';
import type { Book } from '@/types/book';
import { createStoryBoredPassage, getStoryBoredBookId } from '@/integrations/storybored/passage';
import { getSelectionContext } from '@/integrations/storybored/passage-context';
import type { TextSelection } from '@/utils/sel';

function createSelection(range: Range, text = range.toString()): TextSelection {
  return {
    key: 'selection-1',
    text,
    page: 1,
    range,
    index: 0,
  };
}

function splitContext(context: string): { before: string; after: string } {
  const match =
    /^Context before the selected passage:\n([\s\S]*?)\n\nContext after the selected passage:\n([\s\S]*)$/.exec(
      context,
    );

  expect(match).not.toBeNull();

  return {
    before: match?.[1] ?? '',
    after: match?.[2] ?? '',
  };
}

describe('getStoryBoredBookId', () => {
  it('uses the shared metadata hash across different sideloaded file revisions', () => {
    const metaHash = '8f7f66e69a4a2dfab7d2b33588d1843a';
    const firstRevision = { hash: 'first-file-hash', metaHash } as Book;
    const secondRevision = { hash: 'second-file-hash', metaHash } as Book;

    expect(getStoryBoredBookId('first-file-hash-view', firstRevision)).toBe(metaHash);
    expect(getStoryBoredBookId('second-file-hash-view', secondRevision)).toBe(metaHash);
  });

  it('keeps the API source key for marketplace books after metadata is calculated', () => {
    const marketplaceBook = {
      hash: 'entitlement-local-hash',
      metaHash: 'reader-calculated-metadata-hash',
      marketplace: {
        libraryItemId: 'library-account-a',
        listingId: 'listing-shared',
        sourceKey: 'shared-marketplace-source-key',
      },
    } as Book;

    expect(getStoryBoredBookId('entitlement-local-hash-view', marketplaceBook)).toBe(
      'shared-marketplace-source-key',
    );
  });

  it('falls back to the entitlement-local hash for legacy marketplace records', () => {
    const legacyMarketplaceBook = {
      hash: 'legacy-entitlement-hash',
      metaHash: 'reader-calculated-metadata-hash',
      marketplace: {
        libraryItemId: 'library-account-a',
        listingId: 'listing-shared',
      },
    } as Book;

    expect(getStoryBoredBookId('legacy-entitlement-hash-view', legacyMarketplaceBook)).toBe(
      'legacy-entitlement-hash',
    );
  });
});

describe('createStoryBoredPassage', () => {
  it('anchors context to the exact selected occurrence across the full rendered section', () => {
    document.body.innerHTML = `
      <main>
        <p>The lantern keeper opened the eastern gate.</p>
        <p class="first">The bell rang twice beneath the hill.</p>
        <p>A silver fox crossed between the two echoes.</p>
        <p class="second">The bell rang twice beneath the hill.</p>
        <p>Only then did the hidden stair appear.</p>
      </main>
    `;
    const selectedNode = document.querySelector('.second')?.firstChild;
    expect(selectedNode).toBeInstanceOf(Text);

    const range = document.createRange();
    range.selectNodeContents(selectedNode!);

    const passage = createStoryBoredPassage({
      bookKey: 'book-1',
      selection: createSelection(range),
    });
    const { before, after } = splitContext(passage.surroundingContext ?? '');

    expect(passage.selectedText).toBe('The bell rang twice beneath the hill.');
    expect(before).toContain('A silver fox crossed between the two echoes.');
    expect(after).toContain('Only then did the hidden stair appear.');
    expect(after).not.toContain('A silver fox crossed between the two echoes.');
  });

  it('uses deterministic sentence boundaries within bounded before and after windows', () => {
    const before = Array.from(
      { length: 90 },
      (_, index) =>
        `Before sentence ${String(index).padStart(2, '0')} establishes the old observatory.`,
    ).join(' ');
    const after = Array.from(
      { length: 40 },
      (_, index) => `After sentence ${String(index).padStart(2, '0')} follows the falling star.`,
    ).join(' ');

    document.body.innerHTML = `<main><p>${before}</p><p id="selected">Mira raised the brass telescope.</p><p>${after}</p></main>`;
    const selectedNode = document.querySelector('#selected')?.firstChild;
    expect(selectedNode).toBeInstanceOf(Text);

    const range = document.createRange();
    range.selectNodeContents(selectedNode!);

    const passage = createStoryBoredPassage({
      bookKey: 'book-1',
      selection: createSelection(range),
    });
    const context = splitContext(passage.surroundingContext ?? '');

    expect(context.before.length).toBeLessThanOrEqual(2400);
    expect(context.after.length).toBeLessThanOrEqual(800);
    expect(context.before).toMatch(/^Before sentence \d{2} establishes/);
    expect(context.before).toMatch(/observatory\.$/);
    expect(context.after).toMatch(/^After sentence 00 follows/);
    expect(context.after).toMatch(/star\.$/);
    expect(context.before).not.toContain('Mira raised the brass telescope.');
    expect(context.after).not.toContain('Mira raised the brass telescope.');
  });

  it('preserves the exact selected text while excluding non-content section elements', () => {
    document.body.innerHTML = `
      <header><h1>Chapter Twelve</h1></header>
      <div role="toolbar"><button>Reader controls should not become story context.</button></div>
      <article>
        <p>Rain stitched bright lines across the courtyard.</p>
        <p id="selected">the clockmaker's blue-glass bird</p>
        <p>It fluttered once and became still.</p>
      </article>
      <script>ignoreThisInstruction()</script>
    `;
    const selectedNode = document.querySelector('#selected')?.firstChild;
    expect(selectedNode).toBeInstanceOf(Text);

    const range = document.createRange();
    range.selectNodeContents(selectedNode!);

    const selectionText = 'the clockmaker’s blue-glass bird';
    const passage = createStoryBoredPassage({
      bookKey: 'book-1',
      selection: createSelection(range, selectionText),
    });

    expect(passage.selectedText).toBe(selectionText);
    expect(passage.surroundingContext).toContain('Chapter Twelve');
    expect(passage.surroundingContext).toContain('Rain stitched bright lines');
    expect(passage.surroundingContext).toContain('It fluttered once');
    expect(passage.surroundingContext).not.toContain('Reader controls');
    expect(passage.surroundingContext).not.toContain('ignoreThisInstruction');
  });

  it('keeps partial-paragraph context on the correct side without duplicating the selection', () => {
    document.body.innerHTML =
      '<p id="scene">The storm paused when Mira stepped beneath the arch and lifted the lantern.</p>';
    const textNode = document.querySelector('#scene')?.firstChild;
    expect(textNode).toBeInstanceOf(Text);

    const selectedText = 'Mira stepped beneath the arch';
    const sourceText = textNode?.textContent ?? '';
    const start = sourceText.indexOf(selectedText);
    const range = document.createRange();
    range.setStart(textNode!, start);
    range.setEnd(textNode!, start + selectedText.length);

    const context = splitContext(getSelectionContext(range) ?? '');

    expect(context.before).toBe('The storm paused when');
    expect(context.after).toBe('and lifted the lantern.');
    expect(context.before).not.toContain(selectedText);
    expect(context.after).not.toContain(selectedText);
  });

  it('returns only the available context side at section boundaries', () => {
    document.body.innerHTML = '<p id="first">First selected line.</p><p>Context after it.</p>';
    const firstNode = document.querySelector('#first')?.firstChild;
    const firstRange = document.createRange();
    firstRange.selectNodeContents(firstNode!);

    expect(getSelectionContext(firstRange)).toBe(
      'Context after the selected passage:\nContext after it.',
    );

    document.body.innerHTML = '<p>Context before it.</p><p id="last">Last selected line.</p>';
    const lastNode = document.querySelector('#last')?.firstChild;
    const lastRange = document.createRange();
    lastRange.selectNodeContents(lastNode!);

    expect(getSelectionContext(lastRange)).toBe(
      'Context before the selected passage:\nContext before it.',
    );
  });

  it('uses the book language for bounded CJK sentence context', () => {
    const before = Array.from(
      { length: 180 },
      (_, index) => `前の文${String(index).padStart(3, '0')}で古い天文台を描く。`,
    ).join('');
    const after = Array.from(
      { length: 80 },
      (_, index) => `後の文${String(index).padStart(3, '0')}で星の動きを追う。`,
    ).join('');
    document.body.innerHTML = `<p>${before}</p><p id="selected">美羅は望遠鏡を上げた。</p><p>${after}</p>`;
    const selectedNode = document.querySelector('#selected')?.firstChild;
    const range = document.createRange();
    range.selectNodeContents(selectedNode!);

    const context = splitContext(getSelectionContext(range, 'ja') ?? '');

    expect(context.before.length).toBeLessThanOrEqual(2400);
    expect(context.before).toMatch(/^前の文\d{3}/);
    expect(context.before).toMatch(/。$/);
    expect(context.after.length).toBeLessThanOrEqual(800);
    expect(context.after).toMatch(/^後の文000/);
    expect(context.after).toMatch(/。$/);
  });
});
