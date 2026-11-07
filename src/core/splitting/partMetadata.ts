import { toHex, bytesEqual } from '../bytes.ts';
import { FLAG_ENCRYPTED } from '../format/version.ts';
import { sharedFingerprint } from '../format/header.ts';
import type { PartHeader } from '../format/header.ts';
import type { ErrorCode } from '../errors.ts';

export interface PartLike {
  header: PartHeader;
  /** payload hash matched the header */
  hashOk: boolean;
}

export interface SetStatus {
  sessionId: string; // hex
  partCount: number;
  totalLen: number;
  encrypted: boolean;
  /** indexes with at least one intact copy */
  received: number[];
  /** indexes for which no page was supplied at all */
  missing: number[];
  /** indexes supplied more than once with identical content (harmless) */
  duplicates: number[];
  /** indexes only supplied in a damaged form */
  corrupt: number[];
  /** indexes with conflicting copies, or whose metadata disagrees with the rest of the set */
  conflicting: number[];
}

export interface SetIssue {
  severity: 'error' | 'warning';
  code: ErrorCode;
  message: string;
}

export interface SetAnalysis {
  sessions: { id: string; parts: number }[];
  status: SetStatus | null;
  issues: SetIssue[];
  /** true when the set is complete and consistent and decoding may proceed */
  ok: boolean;
}

const list = (n: number[]) => n.join(', ');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Decide whether the supplied pages form one complete, consistent set.
 * Pure function over headers, so every rule is unit-testable.
 */
export function analyzeParts(parts: PartLike[]): SetAnalysis {
  if (parts.length === 0) {
    return {
      sessions: [],
      status: null,
      ok: false,
      issues: [{ severity: 'error', code: 'NOT_PIXTI_DOCUMENT', message: 'No pixti pages were found in the selected files.' }],
    };
  }

  const groups = new Map<string, PartLike[]>();
  for (const p of parts) {
    const id = toHex(p.header.sessionId);
    const g = groups.get(id);
    if (g) g.push(p);
    else groups.set(id, [p]);
  }
  const sessions = [...groups.entries()].map(([id, g]) => ({ id, parts: g.length }));

  if (groups.size > 1) {
    const desc = sessions.map((s) => `${s.id.slice(0, 8)} (${s.parts} ${plural(s.parts, 'page', 'pages')})`).join(', ');
    return {
      sessions,
      status: null,
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'MIXED_SESSIONS',
          message: `These files belong to ${groups.size} different encodings: ${desc}. Select only the files from one set.`,
        },
      ],
    };
  }

  const [sessionHex, group] = [...groups.entries()][0];
  const ref = group[0].header;
  const refFp = sharedFingerprint(ref);
  const issues: SetIssue[] = [];
  const conflicting = new Set<number>();

  for (const p of group) {
    if (!bytesEqual(sharedFingerprint(p.header), refFp)) conflicting.add(p.header.partIndex);
  }

  const byIndex = new Map<number, PartLike[]>();
  for (const p of group) {
    const l = byIndex.get(p.header.partIndex);
    if (l) l.push(p);
    else byIndex.set(p.header.partIndex, [p]);
  }

  const received: number[] = [];
  const missing: number[] = [];
  const duplicates: number[] = [];
  const corrupt: number[] = [];
  for (let i = 1; i <= ref.partCount; i++) {
    const copies = byIndex.get(i) ?? [];
    const good = copies.filter((c) => c.hashOk);
    if (copies.length === 0) missing.push(i);
    else if (good.length === 0) corrupt.push(i);
    else {
      received.push(i);
      if (good.length > 1) {
        const distinct = new Set(good.map((g) => toHex(g.header.partSha256)));
        if (distinct.size > 1) conflicting.add(i);
        else duplicates.push(i);
      }
    }
  }

  const sortedConflicts = [...conflicting].sort((a, b) => a - b);
  if (sortedConflicts.length > 0) {
    issues.push({
      severity: 'error',
      code: 'CONFLICTING_PARTS',
      message: `Page ${list(sortedConflicts)} ${plural(sortedConflicts.length, 'does', 'do')} not match the rest of the set (different settings or different content). Remove the conflicting files.`,
    });
  }
  if (missing.length > 0) {
    issues.push({
      severity: 'error',
      code: 'MISSING_PARTS',
      message: `Missing ${plural(missing.length, 'page', 'pages')} ${list(missing)} of ${ref.partCount}. Add the remaining files to continue.`,
    });
  }
  if (corrupt.length > 0) {
    issues.push({
      severity: 'error',
      code: 'CORRUPT_PART',
      message: `${plural(corrupt.length, 'Page', 'Pages')} ${list(corrupt)} ${plural(corrupt.length, 'is', 'are')} damaged. Get a fresh copy of ${plural(corrupt.length, 'that file', 'those files')}.`,
    });
  }
  if (duplicates.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'DUPLICATE_PARTS',
      message: `${plural(duplicates.length, 'Page', 'Pages')} ${list(duplicates)} ${plural(duplicates.length, 'was', 'were')} added more than once. Identical copies are ignored.`,
    });
  }

  return {
    sessions,
    status: {
      sessionId: sessionHex,
      partCount: ref.partCount,
      totalLen: ref.totalLen,
      encrypted: (ref.flags & FLAG_ENCRYPTED) !== 0,
      received,
      missing,
      duplicates,
      corrupt,
      conflicting: sortedConflicts,
    },
    issues,
    ok: !issues.some((i) => i.severity === 'error'),
  };
}

/** After analyzeParts() said ok: first intact copy of each index, in order. */
export function selectParts<T extends PartLike>(parts: T[]): T[] {
  const picked = new Map<number, T>();
  for (const p of parts) {
    if (p.hashOk && !picked.has(p.header.partIndex)) picked.set(p.header.partIndex, p);
  }
  return [...picked.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}
