// Form validation messages: name only what's missing.
import { describe, it, expect } from '@jest/globals';
import { missingNames, joinNames, stillNeeded } from '@/lib/validation';

describe('joinNames', () => {
  it('handles zero, one, two and many names', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['a title'])).toBe('a title');
    expect(joinNames(['a title', 'a genre'])).toBe('a title and a genre');
    expect(joinNames(['a photo', 'a title', 'a genre'])).toBe('a photo, a title and a genre');
  });
});

describe('missingNames / stillNeeded', () => {
  const reqs = [
    { ok: true, name: 'a photo' },
    { ok: false, name: 'a title' },
    { ok: true, name: 'a location' },
    { ok: false, name: 'a genre' },
  ];
  it('lists only the unmet requirements, in form order', () => {
    expect(missingNames(reqs)).toEqual(['a title', 'a genre']);
  });
  it('builds a sentence naming just those', () => {
    expect(stillNeeded(reqs)).toBe('Still needed: a title and a genre.');
  });
  it('is empty when everything is filled', () => {
    expect(stillNeeded(reqs.map((r) => ({ ...r, ok: true })))).toBe('');
  });
});
