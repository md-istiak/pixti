import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Upload } from 'lucide-react';

interface Props {
  onFiles: (files: File[]) => void;
  title: string;
  hint?: ReactNode;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  testId?: string;
}

export function Dropzone({ onFiles, title, hint, accept, multiple = false, disabled = false, testId }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    if (list && list.length > 0) onFiles(multiple ? Array.from(list) : [list[0]]);
  };
  const open = () => {
    if (!disabled) input.current?.click();
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={title}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl2 border-2 border-dashed px-6 py-12 text-center transition-colors ${
        over ? 'border-brand bg-[#E4F4EC]' : 'border-brand-sky bg-brand-mist hover:border-brand'
      } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-card">
        <Upload className="h-7 w-7 text-brand" aria-hidden="true" />
      </span>
      <p className="text-lg font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-md text-sm text-ink-soft">{hint}</p>}
      <span className="mt-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-dark shadow-card">Browse files</span>
      <input
        ref={input}
        data-testid={testId}
        type="file"
        tabIndex={-1}
        className="sr-only"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
