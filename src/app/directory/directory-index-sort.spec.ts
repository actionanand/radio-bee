import { defaultIndexOrder, indexOrder, sortIndexDestinations } from './directory-index-sort';

const rows = [
  { id: 'z', name: 'Zulu', count: 5 },
  { id: 'b', name: 'Beta', count: 10 },
  { id: 'a', name: 'Alpha', count: 10 },
  { id: 'n', name: 'No stations', count: 0 },
];

describe('Language and artist index sorting', () => {
  it('defaults languages to most stations and artists to name A–Z', () => {
    expect(defaultIndexOrder('languages')).toBe('count-desc');
    expect(defaultIndexOrder('artists')).toBe('name-asc');
    expect(indexOrder('languages', null)).toBe('count-desc');
    expect(indexOrder('artists', null)).toBe('name-asc');
    expect(indexOrder('languages', 'nonsense')).toBe('count-desc');
    expect(indexOrder('artists', 'count-desc')).toBe('name-asc');
  });

  it('breaks equal station counts by name A–Z in both count orders', () => {
    expect(sortIndexDestinations(rows, 'count-desc', 'en').map(x => x.id)).toEqual(['a', 'b', 'z', 'n']);
    expect(sortIndexDestinations(rows, 'count-asc', 'en').map(x => x.id)).toEqual(['n', 'z', 'a', 'b']);
  });

  it('supports both alphabetical directions with stable ID tie breaks', () => {
    expect(sortIndexDestinations(rows, 'name-asc', 'en').map(x => x.id)).toEqual(['a', 'b', 'n', 'z']);
    expect(sortIndexDestinations(rows, 'name-desc', 'en').map(x => x.id)).toEqual(['z', 'n', 'b', 'a']);
    const tied = [
      { id: 'second', name: 'Same', count: 3 },
      { id: 'first', name: 'same', count: 3 },
    ];
    expect(sortIndexDestinations(tied, 'count-desc', 'en').map(x => x.id)).toEqual(['first', 'second']);
    expect(sortIndexDestinations(tied, 'name-desc', 'en').map(x => x.id)).toEqual(['second', 'first']);
  });

  it('uses locale-aware sorting and does not mutate the original catalogue order', () => {
    const original = structuredClone(rows);
    const sorted = sortIndexDestinations(rows, 'name-asc', 'ta');
    expect(sorted).not.toBe(rows);
    expect(rows).toEqual(original);
    expect(indexOrder('languages', 'name-desc')).toBe('name-desc');
    expect(indexOrder('artists', 'name-desc')).toBe('name-desc');
  });
});
