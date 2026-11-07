export interface Strength {
  /** 0 = very weak … 4 = strong */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  bits: number;
  hints: string[];
}

const COMMON = [
  'password', 'passw0rd', 'letmein', 'welcome', 'admin', 'login', 'qwerty', 'qwertyuiop', 'asdfgh', 'zxcvbn',
  'iloveyou', 'monkey', 'dragon', 'master', 'shadow', 'sunshine', 'princess', 'football', 'baseball', 'superman',
  'batman', 'trustno1', 'whatever', 'freedom', 'hello', 'secret', 'abc123', 'pixti', 'changeme', 'default',
];

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiopasdfghjklzxcvbnm'];
const LEET: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

function isSequential(a: string, b: string): boolean {
  for (const seq of SEQUENCES) {
    const i = seq.indexOf(a);
    if (i >= 0 && (seq[i + 1] === b || seq[i - 1] === b)) return true;
  }
  return false;
}

/**
 * Rough, honest estimate (NOT a guarantee): character-pool entropy reduced for repeats,
 * sequences and common words. A high score additionally requires real length, so a
 * short password can never be rated strong.
 */
export function estimateStrength(pw: string): Strength {
  if (pw.length === 0) return { score: 0, label: 'Enter a password', bits: 0, hints: [] };

  const chars = Array.from(pw);
  const lower = pw.toLowerCase();
  const normalised = Array.from(lower, (c) => LEET[c] ?? c).join('');
  const hints: string[] = [];

  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(pw)) pool += 33;
  if (/[^\x20-\x7e]/.test(pw)) pool += 100;
  const perChar = Math.log2(Math.max(pool, 2));

  // Count effective characters: repeats and runs add little.
  let eff = 0;
  for (let i = 0; i < chars.length; i++) {
    if (i > 0 && chars[i] === chars[i - 1]) eff += 0.1;
    else if (i > 0 && isSequential(chars[i - 1].toLowerCase(), chars[i].toLowerCase())) eff += 0.3;
    else eff += 1;
  }
  let bits = eff * perChar;

  // Common words (also after de-leeting) are worth a flat ~12 bits each, whatever their length.
  let rest = normalised;
  let words = 0;
  for (const w of COMMON) {
    while (rest.includes(w)) {
      rest = rest.replace(w, '');
      words++;
    }
  }
  if (words > 0) {
    const remaining = Math.max(0, rest.length) * perChar * 0.8;
    bits = Math.min(bits, words * 12 + remaining);
    hints.push('Avoid common words and predictable substitutions.');
  }
  if (COMMON.includes(normalised)) bits = Math.min(bits, 10);

  if (chars.length < 12) hints.push('Use at least 12 characters; a long passphrase of unrelated words works well.');
  if (new Set(chars).size < chars.length / 2) hints.push('Avoid repeated characters.');

  let score: Strength['score'] = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  if (chars.length < 12 && score > 2) score = 2;
  if (chars.length < 14 && score > 3) score = 3;

  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score], bits: Math.round(bits), hints };
}
