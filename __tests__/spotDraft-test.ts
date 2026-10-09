// Edit Post decisions: which photos to upload, which files to delete, what to do with the style.
import { describe, it, expect } from '@jest/globals';
import { newPhotos, droppedPaths, styleAction, type DraftPhoto } from '@/lib/spotDraft';

const stored = (path: string): DraftPhoto => ({ uri: `https://x/${path}`, width: 100, height: 100, storagePath: path });
const fresh = (uri: string): DraftPhoto => ({ uri, width: null, height: null });

describe('newPhotos', () => {
  it('returns only photos without a storage key, with their position', () => {
    const result = newPhotos([stored('a.jpg'), fresh('file://1'), stored('b.jpg'), fresh('file://2')]);
    expect(result.map((r) => [r.photo.uri, r.index])).toEqual([['file://1', 1], ['file://2', 3]]);
  });
  it('is empty when nothing new was added', () => {
    expect(newPhotos([stored('a.jpg')])).toEqual([]);
  });
});

describe('droppedPaths', () => {
  it('lists original files that are no longer used', () => {
    expect(droppedPaths(['a', 'b', 'c'], ['c', 'a', 'new'])).toEqual(['b']);
  });
  it('drops nothing when only the order changed', () => {
    expect(droppedPaths(['a', 'b'], ['b', 'a'])).toEqual([]);
  });
});

describe('styleAction', () => {
  const none = { key: 'none', caption: '', font: 'displayItalic' };
  const polaroid = { key: 'polaroid', caption: 'Dawn', font: 'displayItalic' };
  const savedPolaroid = { key: 'polaroid', caption: 'Dawn', font: 'displayItalic' };
  const noSettings = { key: null, caption: null, font: null };

  it('keeps an unchanged style on an unchanged cover', () => {
    expect(styleAction({ draft: polaroid, original: savedPolaroid, hadStyledCopy: true, coverChanged: false })).toBe('keep');
  });
  it('re-renders when the cover changes', () => {
    expect(styleAction({ draft: polaroid, original: savedPolaroid, hadStyledCopy: true, coverChanged: true })).toBe('render');
  });
  it('re-renders when the style, caption or font changes', () => {
    expect(styleAction({ draft: { ...polaroid, key: 'noir' }, original: savedPolaroid, hadStyledCopy: true, coverChanged: false })).toBe('render');
    expect(styleAction({ draft: { ...polaroid, caption: 'Dusk' }, original: savedPolaroid, hadStyledCopy: true, coverChanged: false })).toBe('render');
    expect(styleAction({ draft: { ...polaroid, font: 'mono' }, original: savedPolaroid, hadStyledCopy: true, coverChanged: false })).toBe('render');
  });
  it('renders a newly added style', () => {
    expect(styleAction({ draft: polaroid, original: noSettings, hadStyledCopy: false, coverChanged: false })).toBe('render');
  });
  it('clears the styled copy when the style is set to none', () => {
    expect(styleAction({ draft: none, original: savedPolaroid, hadStyledCopy: true, coverChanged: false })).toBe('clear');
  });
  it('does nothing when there was no style and none is chosen', () => {
    expect(styleAction({ draft: none, original: noSettings, hadStyledCopy: false, coverChanged: true })).toBe('keep');
  });
  it('keeps an older style it can\'t re-apply, until the cover changes', () => {
    expect(styleAction({ draft: none, original: noSettings, hadStyledCopy: true, coverChanged: false })).toBe('keep');
    expect(styleAction({ draft: none, original: noSettings, hadStyledCopy: true, coverChanged: true })).toBe('clear');
  });
  it('removes an older style when the user asks to, even on the same cover', () => {
    expect(styleAction({ draft: { ...none, removeOld: true }, original: noSettings, hadStyledCopy: true, coverChanged: false })).toBe('clear');
  });
  it('ignores removeOld for a spot with no older style', () => {
    expect(styleAction({ draft: { ...none, removeOld: true }, original: noSettings, hadStyledCopy: false, coverChanged: false })).toBe('keep');
  });
  it('replaces an older style when the user picks a new one', () => {
    expect(styleAction({ draft: polaroid, original: noSettings, hadStyledCopy: true, coverChanged: false })).toBe('render');
  });
});
