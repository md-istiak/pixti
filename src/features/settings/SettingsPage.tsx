import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { LIMITS } from '../../core/limits.ts';
import { FORMAT_VERSION } from '../../core/format/version.ts';
import { Button, Card, PageTitle, Stat, Toggle } from '../../components/ui/primitives.tsx';
import { useSettings } from '../../hooks/useSettings.ts';
import { PAGE_SIZE_CHOICES } from '../../utils/settings.ts';
import { clearHistory } from '../../utils/history.ts';
import { formatBytes } from '../../utils/format.ts';

export default function SettingsPage() {
  const [settings, update] = useSettings();
  const [cleared, setCleared] = useState(false);

  return (
    <div>
      <PageTitle title="Settings" subtitle="Saved only in this browser. Passwords and file contents are never stored." />
      <div className="space-y-6">
        <Card className="space-y-6">
          <Toggle
            id="default-encrypt"
            checked={settings.defaultEncrypt}
            onChange={(v) => update({ defaultEncrypt: v })}
            label="Encrypt by default"
            description="New encodings start with password protection switched on."
          />
          <div>
            <label htmlFor="page-size" className="font-semibold">
              Default data per page
            </label>
            <p className="mb-2 text-sm text-ink-soft">Smaller pages use less memory, which helps on phones and older computers.</p>
            <select
              id="page-size"
              className="w-full rounded-xl border border-brand-sky bg-white px-4 py-3 sm:w-64"
              value={settings.pageMiB}
              onChange={(e) => update({ pageMiB: Number(e.target.value) })}
            >
              {PAGE_SIZE_CHOICES.map((m) => (
                <option key={m} value={m}>
                  Up to {m} MB
                </option>
              ))}
            </select>
          </div>
          <Toggle
            id="keep-history"
            checked={settings.keepHistory}
            onChange={(v) => update({ keepHistory: v })}
            label="Keep a local history"
            description="Remember file names, sizes and dates on this device only."
          />
          <div>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('Clear the local history on this device? This cannot be undone.')) {
                  clearHistory();
                  setCleared(true);
                }
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Clear local history
            </Button>
            {cleared && (
              <p role="status" className="mt-2 text-sm font-semibold text-brand-dark">
                History cleared.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-bold">About pixti</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Format version" value={FORMAT_VERSION} />
            <Stat label="Largest file" value={formatBytes(LIMITS.MAX_INPUT_BYTES)} />
            <Stat label="Key derivation" value={`PBKDF2-SHA-256, ${LIMITS.DEFAULT_KDF_ITERATIONS.toLocaleString()} rounds`} />
            <Stat label="Encryption" value="AES-256-GCM" />
            <Stat label="Compression" value="DEFLATE (automatic)" />
            <Stat label="Output" value="PDF of raw pixel data" />
          </dl>
          <p className="mt-4 text-sm text-ink-soft">
            pixti is free, open source and runs entirely in your browser. It is not a substitute for proper long-term backups.
          </p>
        </Card>
      </div>
    </div>
  );
}
