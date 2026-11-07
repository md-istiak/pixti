import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function buttonClass(variant: ButtonVariant = 'primary', extra = ''): string {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-brand-dark text-white shadow-card hover:bg-[#0d5535] active:bg-[#0a4429]',
    secondary: 'border border-brand-sky bg-white text-brand-dark hover:bg-brand-mist',
    ghost: 'text-ink-soft hover:bg-brand-mist hover:text-ink',
    danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  };
  return `${base} ${styles[variant]} ${extra}`;
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl2 border border-brand-sky/60 bg-white p-6 shadow-card ${className}`}>{children}</div>;
}

type Tone = 'error' | 'warning' | 'success' | 'info';
const TONES: Record<Tone, { box: string; icon: ReactNode }> = {
  error: { box: 'border-red-200 bg-red-50 text-red-900', icon: <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" /> },
  warning: { box: 'border-brand-sun/50 bg-brand-cream text-[#6b3f06]', icon: <AlertTriangle className="h-5 w-5 shrink-0 text-brand-sun" aria-hidden="true" /> },
  success: { box: 'border-brand/30 bg-[#EAF7F0] text-brand-dark', icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" /> },
  info: { box: 'border-brand-sky bg-brand-mist text-ink', icon: <Info className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" /> },
};

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const t = TONES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border p-4 text-sm ${t.box}`}>
      {t.icon}
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const cls: Record<Tone, string> = {
    error: 'bg-red-100 text-red-800',
    warning: 'bg-brand-cream text-[#6b3f06]',
    success: 'bg-[#DDF1E7] text-brand-dark',
    info: 'bg-brand-mist text-ink-soft',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${cls[tone]}`}>{children}</span>;
}

export function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="font-semibold text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-brand' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-brand-mist px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold text-ink">{value}</dd>
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-lg text-ink-soft">{subtitle}</p>}
    </div>
  );
}
