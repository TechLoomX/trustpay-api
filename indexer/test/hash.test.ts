import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/hash.js';

describe('sha256Hex', () => {
  it('matches a known sha256 vector', () => {
    // echo -n "abc" | sha256sum
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic and case-sensitive', () => {
    expect(sha256Hex('Deliver wireframes')).toBe(sha256Hex('Deliver wireframes'));
    expect(sha256Hex('Deliver wireframes')).not.toBe(sha256Hex('deliver wireframes'));
  });
});
