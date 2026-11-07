import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { estimateStrength } from '../../utils/passwordStrength.ts';

interface Props {
  password: string;
  confirm?: string;
  onPassword: (v: string) => void;
  onConfirm?: (v: string) => void;
  /** Encode: password + confirmation + strength meter. Decode: single field. */
  mode: 'create' | 'enter';
  disabled?: boolean;
}

const BAR = ['bg-red-500', 'bg-orange-500', 'bg-brand-sun', 'bg-lime-600', 'bg-brand'];

export function PasswordFields({ password, confirm = '', onPassword, onConfirm, mode, disabled }: Props) {
  const [show, setShow] = useState(false);
  const id = useId();
  const strength = estimateStrength(password);
  const mismatch = mode === 'create' && confirm.length > 0 && confirm !== password;
  const field =
    'w-full rounded-xl border border-brand-sky bg-white px-4 py-3 pr-12 text-base text-ink placeholder:text-ink-soft/70 focus:border-brand disabled:opacity-60';

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${id}-pw`} className="mb-1.5 block text-sm font-semibold text-ink">
          Password
        </label>
        <div className="relative">
          <input
            id={`${id}-pw`}
            data-testid="password"
            type={show ? 'text' : 'password'}
            value={password}
            disabled={disabled}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            spellCheck={false}
            autoCapitalize="off"
            className={field}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-soft hover:bg-brand-mist"
          >
            {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mode === 'create' && (
        <>
          {password.length > 0 && (
            <div aria-live="polite">
              <div className="flex gap-1.5" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength.score ? BAR[strength.score] : 'bg-slate-200'}`} />
                ))}
              </div>
              <p className="mt-1.5 text-sm text-ink-soft">
                <span className="font-semibold text-ink">{strength.label}</span> (rough estimate).{' '}
                {strength.hints[0] ?? 'Long, unique passphrases are best.'}
              </p>
            </div>
          )}
          <div>
            <label htmlFor={`${id}-confirm`} className="mb-1.5 block text-sm font-semibold text-ink">
              Confirm password
            </label>
            <input
              id={`${id}-confirm`}
              data-testid="password-confirm"
              type={show ? 'text' : 'password'}
              value={confirm}
              disabled={disabled}
              onChange={(e) => onConfirm?.(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              aria-invalid={mismatch}
              className={field}
            />
            {mismatch && (
              <p role="alert" className="mt-1.5 text-sm font-semibold text-red-700">
                The passwords do not match.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
