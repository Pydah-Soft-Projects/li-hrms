/**
 * Shared gender helpers for OT / auto-edge slabs.
 */
const {
  normalizeSlabGender,
  sanitizeSlabGender,
  pickByGender,
  slabAppliesToGender,
} = require('../slabGender');

describe('slabGender helpers', () => {
  it('normalizes empty / unknown to All', () => {
    expect(normalizeSlabGender(null)).toBe('All');
    expect(normalizeSlabGender('')).toBe('All');
    expect(normalizeSlabGender('unknown')).toBe('All');
    expect(sanitizeSlabGender('female')).toBe('Female');
    expect(sanitizeSlabGender('MALE')).toBe('Male');
  });

  it('pickByGender prefers exact gender over All', () => {
    const candidates = [
      { id: 'all', gender: 'All', v: 1 },
      { id: 'f', gender: 'Female', v: 2 },
      { id: 'm', gender: 'Male', v: 3 },
    ];
    expect(pickByGender(candidates, 'Female').id).toBe('f');
    expect(pickByGender(candidates, 'Male').id).toBe('m');
  });

  it('pickByGender falls back to All when exact missing', () => {
    const candidates = [
      { id: 'all', gender: 'All', v: 1 },
      { id: 'f', gender: 'Female', v: 2 },
    ];
    expect(pickByGender(candidates, 'Male').id).toBe('all');
    expect(pickByGender(candidates, null).id).toBe('all');
  });

  it('pickByGender never steals another gender slab', () => {
    const candidates = [{ id: 'f', gender: 'Female', v: 2 }];
    expect(pickByGender(candidates, 'Male')).toBeNull();
    expect(pickByGender(candidates, 'Other')).toBeNull();
  });

  it('slabAppliesToGender', () => {
    expect(slabAppliesToGender({ gender: 'All' }, 'Male')).toBe(true);
    expect(slabAppliesToGender({ gender: 'Female' }, 'Female')).toBe(true);
    expect(slabAppliesToGender({ gender: 'Female' }, 'Male')).toBe(false);
    expect(slabAppliesToGender({ gender: 'Male' }, null)).toBe(false);
  });
});
