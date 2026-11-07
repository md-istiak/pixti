import { describe, expect, it } from 'vitest';
import { estimateStrength } from '../src/utils/passwordStrength.ts';

describe('password strength estimate', () => {
  it('empty and trivially common passwords are very weak', () => {
    expect(estimateStrength('').score).toBe(0);
    for (const p of ['password', 'Password1', '123456', 'qwerty', 'letmein!', 'aaaaaaaaaaaa']) {
      expect(estimateStrength(p).score).toBeLessThanOrEqual(1);
    }
  });
  it('length alone never earns a high rating', () => {
    expect(estimateStrength('1111111111111111111111111').score).toBeLessThanOrEqual(1);
    expect(estimateStrength('abcdefghijklmnopqrstuvwxyz').score).toBeLessThanOrEqual(2);
  });
  it('short passwords are capped even with every character class', () => {
    expect(estimateStrength('aB3$xY9!').score).toBeLessThanOrEqual(2);
  });
  it('long mixed passphrases rate well', () => {
    expect(estimateStrength('vT7#kq2!Zr9&mLw4pX').score).toBeGreaterThanOrEqual(3);
    expect(estimateStrength('seven plum anchors drift quietly 82').score).toBeGreaterThanOrEqual(3);
  });
  it('gives actionable hints', () => {
    expect(estimateStrength('abc').hints.join(' ')).toMatch(/12 characters/);
  });
});
