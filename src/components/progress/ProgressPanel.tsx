import { CheckCircle2, Loader2, X } from 'lucide-react';
import type { Stage, StageInfo } from '../../core/progress.ts';
import { Button, Card } from '../ui/primitives.tsx';

export interface ProgressState {
  stage: Stage | null;
  fraction: number | null;
}

interface Props {
  title: string;
  stages: StageInfo[];
  progress: ProgressState;
  onCancel: () => void;
}

/** Stage list driven by real worker progress. Unknown progress is shown as indeterminate, never faked. */
export function ProgressPanel({ title, stages, progress, onCancel }: Props) {
  const found = progress.stage ? stages.findIndex((s) => s.id === progress.stage) : 0;
  const active = Math.max(0, found);
  const pct = progress.fraction === null ? null : Math.round(Math.min(1, Math.max(0, progress.fraction)) * 100);

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-ink">{title}</h2>
        <Button variant="secondary" className="!px-4 !py-2 text-sm" onClick={onCancel}>
          <X className="h-4 w-4" aria-hidden="true" /> Cancel
        </Button>
      </div>
      <ol className="mt-5 space-y-3" aria-live="polite">
        {stages.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li key={s.id} className="flex items-center gap-3" aria-current={current ? 'step' : undefined}>
              {done ? (
                <CheckCircle2 className="h-5 w-5 text-brand" aria-label="Done" />
              ) : current ? (
                <Loader2 className="h-5 w-5 animate-spin text-brand-sun" aria-hidden="true" />
              ) : (
                <span className="h-5 w-5 rounded-full border-2 border-brand-sky" aria-hidden="true" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-semibold ${done || current ? 'text-ink' : 'text-ink-soft'}`}>
                  {s.label}
                  {current && pct !== null ? ` — ${pct}%` : ''}
                </p>
                {current && (
                  <div
                    className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-cream"
                    role="progressbar"
                    aria-label={s.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct ?? undefined}
                  >
                    {pct === null ? (
                      <div className="animate-indeterminate h-full w-1/3 rounded-full bg-brand-sun" />
                    ) : (
                      <div className="h-full rounded-full bg-brand-sun transition-[width]" style={{ width: `${pct}%` }} />
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
