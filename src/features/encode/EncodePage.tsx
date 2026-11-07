import { useState } from 'react';
import { Download, FileText, Lock, LockOpen, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { LIMITS, MiB } from '../../core/limits.ts';
import { ENCODE_STAGES } from '../../core/progress.ts';
import { Dropzone } from '../../components/upload/Dropzone.tsx';
import { ProgressPanel } from '../../components/progress/ProgressPanel.tsx';
import { Thumb } from '../../components/preview/Thumb.tsx';
import { PasswordFields } from '../../components/ui/PasswordFields.tsx';
import { Alert, Button, Card, PageTitle, Pill, Stat, Toggle } from '../../components/ui/primitives.tsx';
import { useJob } from '../../hooks/useJob.ts';
import { useSettings } from '../../hooks/useSettings.ts';
import { PAGE_SIZE_CHOICES } from '../../utils/settings.ts';
import { addHistory } from '../../utils/history.ts';
import { downloadBlob } from '../../utils/download.ts';
import { formatBytes, shortId } from '../../utils/format.ts';
import { estimateStrength } from '../../utils/passwordStrength.ts';

const select =
  'w-full rounded-xl border border-brand-sky bg-white px-4 py-3 text-base text-ink focus:border-brand disabled:opacity-60';

export default function EncodePage() {
  const [settings] = useSettings();
  const [file, setFile] = useState<File | null>(null);
  const [encrypt, setEncrypt] = useState(settings.defaultEncrypt);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [compression, setCompression] = useState<'auto' | 'off'>('auto');
  const [pageMiB, setPageMiB] = useState<number>(settings.pageMiB);
  const [docLimit, setDocLimit] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { state, run, cancel, reset } = useJob<'encode'>();

  const running = state.status === 'running';
  const tooLarge = file !== null && file.size > LIMITS.MAX_INPUT_BYTES;
  const passwordOk = !encrypt || (password.length > 0 && password === confirm);
  const canStart = file !== null && !tooLarge && passwordOk && !running;
  const weak = encrypt && password.length > 0 && estimateStrength(password).score <= 1;
  const estimatedPages = file ? Math.max(1, Math.ceil((file.size + 1024) / (pageMiB * MiB))) : 0;

  const stages = ENCODE_STAGES.filter((s) => (s.id !== 'encrypt' || encrypt) && (s.id !== 'compress' || compression === 'auto'));

  const start = async () => {
    if (!file) return;
    setDownloadError(null);
    const outcome = await run({
      type: 'encode',
      file,
      options: {
        encrypt,
        password,
        compression,
        maxPartBytes: pageMiB * MiB,
        maxDocumentBytes: docLimit === null ? null : docLimit * MiB,
      },
    });
    // The password is not needed any more: drop it from memory-held state straight away.
    setPassword('');
    setConfirm('');
    if (settings.keepHistory && (outcome.status === 'done' || outcome.status === 'error')) {
      addHistory({
        kind: 'encode',
        fileName: file.name,
        size: file.size,
        parts: outcome.status === 'done' ? outcome.result.stats.partCount : 0,
        ok: outcome.status === 'done',
      });
    }
  };

  const save = (blob: Blob, name: string) => {
    try {
      downloadBlob(blob, name);
      setDownloadError(null);
    } catch {
      setDownloadError('The download could not be started. Try again, or allow downloads for this site.');
    }
  };

  const newEncoding = () => {
    reset();
    setFile(null);
    setPassword('');
    setConfirm('');
    setDownloadError(null);
  };

  if (state.status === 'done') {
    const { stats, documents, preview } = state.result;
    const saved = stats.originalSize - stats.storedSize;
    return (
      <div>
        <PageTitle title="Your document is ready" subtitle="Verified: pixti read the finished PDF back and checked every page before showing this." />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card className="flex flex-col items-center gap-3">
            <Thumb thumb={preview} label="Preview of the first encoded page" className="w-full max-w-xs rounded-lg border border-brand-sky" />
            <p className="text-sm text-ink-soft">Preview of page 1. The pattern is your data.</p>
          </Card>
          <div className="space-y-6">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="success">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Verified
                </Pill>
                {stats.encrypted ? (
                  <Pill tone="info">
                    <Lock className="h-4 w-4" aria-hidden="true" /> Password protected
                  </Pill>
                ) : (
                  <Pill tone="warning">
                    <LockOpen className="h-4 w-4" aria-hidden="true" /> Not encrypted
                  </Pill>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="Original file" value={`${stats.originalName} (${formatBytes(stats.originalSize)})`} />
                <Stat
                  label="Compression"
                  value={stats.compression === 'deflate' ? `Saved ${formatBytes(saved)} (${Math.round((saved / Math.max(1, stats.originalSize)) * 100)}%)` : 'None (no benefit)'}
                />
                <Stat label="Pages" value={`${stats.partCount} (${stats.pages[0].width}×${stats.pages[0].height}px)`} />
                <Stat label="Document size" value={`${formatBytes(stats.documentBytes)} in ${documents.length} ${documents.length === 1 ? 'file' : 'files'}`} />
                <Stat label="Encoded payload" value={formatBytes(stats.payloadSize)} />
                <Stat label="Set ID" value={shortId(state.result.sessionId)} />
              </dl>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-lg font-bold">Download</h2>
              {documents.map((d) => (
                <Button key={d.fileName} className="w-full justify-between" onClick={() => save(d.blob, d.fileName)}>
                  <span className="flex items-center gap-2">
                    <Download className="h-5 w-5" aria-hidden="true" /> {d.fileName}
                  </span>
                  <span className="text-sm font-medium opacity-90">{formatBytes(d.byteLength)}</span>
                </Button>
              ))}
              {documents.length > 1 && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => documents.forEach((d, i) => setTimeout(() => save(d.blob, d.fileName), i * 500))}
                >
                  Download all {documents.length} files
                </Button>
              )}
              {downloadError && <Alert tone="error" title={downloadError} />}
            </Card>

            <Alert tone="info" title="Send it as a document or file, not as a photo">
              Chat and e-mail apps normally deliver documents unchanged, but often recompress photos, which would destroy the data. If a file is ever altered in transit, pixti detects it instead of returning a wrong file.
              {documents.length > 1 && ' The recipient needs all of the files.'}
              {stats.encrypted ? ' They will also need the password, which pixti cannot recover for you.' : ' Anyone who has the PDF can open it.'}
            </Alert>
            <Button variant="secondary" onClick={newEncoding}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Encode another file
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="Encode a file" subtitle="Choose a file and pixti turns it into a PDF made of pixels. Nothing leaves your device." />
      <div className="space-y-6">
        {state.status === 'running' ? (
          <ProgressPanel title="Encoding…" stages={stages} progress={{ stage: state.stage, fraction: state.fraction }} onCancel={cancel} />
        ) : (
          <>
            {state.status === 'cancelled' && <Alert tone="info" title="Cancelled. Nothing was saved." />}
            {state.status === 'error' && (
              <Alert tone="error" title="Encoding failed">
                {state.error.message}
              </Alert>
            )}

            <Card>
              <h2 className="mb-4 text-lg font-bold">1. File</h2>
              {file ? (
                <div className="flex items-center gap-4 rounded-xl bg-brand-mist p-4">
                  <FileText className="h-8 w-8 shrink-0 text-brand" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold" data-testid="selected-name">
                      {file.name}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {file.type || 'Unknown type'} · {formatBytes(file.size)}
                    </p>
                  </div>
                  <Button variant="ghost" className="!p-2" onClick={() => setFile(null)} aria-label="Remove selected file">
                    <X className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <Dropzone
                  testId="encode-input"
                  title="Drop a file here"
                  hint={`Any type of file, up to ${formatBytes(LIMITS.MAX_INPUT_BYTES)}.`}
                  onFiles={(f) => setFile(f[0])}
                />
              )}
              {tooLarge && (
                <div className="mt-4">
                  <Alert tone="error" title={`This file is larger than ${formatBytes(LIMITS.MAX_INPUT_BYTES)}`}>
                    That is more than a browser can safely process. Split it into smaller files and encode them one by one.
                  </Alert>
                </div>
              )}
            </Card>

            <Card className="space-y-5">
              <h2 className="text-lg font-bold">2. Protection</h2>
              <Toggle
                id="encrypt"
                checked={encrypt}
                onChange={setEncrypt}
                label="Protect with a password"
                description="Strong encryption (AES-256). The recipient needs the same password; it cannot be recovered if lost."
              />
              {encrypt ? (
                <PasswordFields mode="create" password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
              ) : (
                <Alert tone="warning" title="Encryption is off">
                  Anyone with the PDF can recover the file, including its name.
                </Alert>
              )}
              {weak && <Alert tone="warning" title="This password is easy to guess">Anyone holding the PDF can try passwords offline. Consider a longer passphrase.</Alert>}
            </Card>

            <Card>
              <details>
                <summary className="cursor-pointer text-lg font-bold">Advanced settings</summary>
                <div className="mt-5 grid gap-5 sm:grid-cols-3">
                  <div>
                    <label htmlFor="compression" className="mb-1.5 block text-sm font-semibold">
                      Compression
                    </label>
                    <select id="compression" className={select} value={compression} onChange={(e) => setCompression(e.target.value as 'auto' | 'off')}>
                      <option value="auto">Automatic (only if smaller)</option>
                      <option value="off">Off</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="page" className="mb-1.5 block text-sm font-semibold">
                      Data per page
                    </label>
                    <select id="page" className={select} value={pageMiB} onChange={(e) => setPageMiB(Number(e.target.value))}>
                      {PAGE_SIZE_CHOICES.map((m) => (
                        <option key={m} value={m}>
                          Up to {m} MB
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-ink-soft">Smaller pages use less memory on weak devices.</p>
                  </div>
                  <div>
                    <label htmlFor="doclimit" className="mb-1.5 block text-sm font-semibold">
                      Output files
                    </label>
                    <select
                      id="doclimit"
                      className={select}
                      value={docLimit ?? ''}
                      onChange={(e) => setDocLimit(e.target.value === '' ? null : Number(e.target.value))}
                    >
                      <option value="">One PDF (recommended)</option>
                      <option value="10">Split into files up to 10 MB</option>
                      <option value="20">Split into files up to 20 MB</option>
                    </select>
                    <p className="mt-1 text-xs text-ink-soft">Handy for e-mail size limits.</p>
                  </div>
                </div>
                {file && (
                  <p className="mt-4 text-sm text-ink-soft">
                    Estimated: up to {estimatedPages} {estimatedPages === 1 ? 'page' : 'pages'}. The final number is shown after encoding.
                  </p>
                )}
              </details>
            </Card>

            <Button className="w-full sm:w-auto" disabled={!canStart} onClick={start} data-testid="start-encode">
              <FileText className="h-5 w-5" aria-hidden="true" /> Create PDF
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
