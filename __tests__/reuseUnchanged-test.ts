// The Feed keeps unchanged posts' object identity so memoized cards skip re-rendering.
import { describe, it, expect } from '@jest/globals';
import { reuseUnchangedRows, reuseUnchangedPhotos } from '@/lib/reuseUnchanged';

type Row = { id: string; like_count: number; title: string };

describe('reuseUnchangedRows', () => {
  const a: Row = { id: 'a', like_count: 1, title: 'Sela Pass' };
  const b: Row = { id: 'b', like_count: 0, title: 'Tawang' };

  it('returns the previous object when nothing changed', () => {
    const next = reuseUnchangedRows([a, b], [{ ...a }, { ...b }]);
    expect(next[0]).toBe(a);
    expect(next[1]).toBe(b);
  });
  it('uses the new object when a field changed', () => {
    const liked = { ...a, like_count: 2 };
    const next = reuseUnchangedRows([a, b], [liked, { ...b }]);
    expect(next[0]).toBe(liked);
    expect(next[1]).toBe(b);
  });
  it('follows the new order and includes new rows', () => {
    const c: Row = { id: 'c', like_count: 5, title: 'Pangong' };
    const next = reuseUnchangedRows([a, b], [c, { ...b }]);
    expect(next.map((r) => r.id)).toEqual(['c', 'b']);
    expect(next[0]).toBe(c);
    expect(next[1]).toBe(b);
  });
  it('treats an added field as a change', () => {
    const withExtra = { ...a, extra: true } as Row;
    expect(reuseUnchangedRows([a], [withExtra])[0]).toBe(withExtra);
  });
});

describe('reuseUnchangedPhotos', () => {
  const p = (url: string) => ({ photo_url: url, width: 100, height: 100 });

  it('keeps the previous array when the URLs match in order', () => {
    const old = [p('1'), p('2')];
    const out = reuseUnchangedPhotos(new Map([['s', old]]), new Map([['s', [p('1'), p('2')]]]));
    expect(out.get('s')).toBe(old);
  });
  it('uses the new array when photos were reordered or changed', () => {
    const old = [p('1'), p('2')];
    const reordered = [p('2'), p('1')];
    expect(reuseUnchangedPhotos(new Map([['s', old]]), new Map([['s', reordered]])).get('s')).toBe(reordered);
    const fewer = [p('1')];
    expect(reuseUnchangedPhotos(new Map([['s', old]]), new Map([['s', fewer]])).get('s')).toBe(fewer);
  });
  it('drops spots that are no longer in the feed', () => {
    const out = reuseUnchangedPhotos(new Map([['gone', [p('1')]]]), new Map());
    expect(out.has('gone')).toBe(false);
  });
});
