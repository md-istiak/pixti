import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, Download, FileText, KeyRound, Loader2, RotateCcw, X } from 'lucide-react';
import { LIMITS } from '../../core/limits.ts';
import { DECODE_STAGES } from '../../core/progress.ts';
import type { ErrorCode } from '../../core/errors.ts';
import { Dropzone } from '../../components/upload/Dropzone.tsx';
import { ProgressPanel } from '../../components/progress/ProgressPanel.tsx';
import { Thumb } from '../../components/preview/Thumb.tsx';
import { PasswordFields } from '../../components/ui/PasswordFields.tsx';
import { Alert, Button, Card, PageTitle, Pill, Stat } from '../../components/ui/primitives.tsx';
import { useJob } from '../../hooks/useJob.ts';
import { useSettings } from '../../hooks/useSettings.ts';
import { addHistory } from '../../utils/history.ts';
import { downloadBlob } from '../../utils/download.ts';
import { formatBytes, shortId } from '../../utils/format.ts';
import type { InspectReport } from './decodeService.ts';

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

const STATUS_LABEL: Partial<Record<ErrorCode, string>> = {
  MISSING_PARTS: 'Missing parts',
  CORRUPT_PART: 'Damaged pages',
  MIXED_SESSIONS: 'Mixed sets',
  CONFLICTING_PARTS: 'Conflicting pages',
  NOT_PIXTI_DOCUMENT: 'Not a pixti document',
};

function SetStatus({ report }: { report: InspectReport }) {
  const firstError = report.issues.find((i) => i.severity === 'error');
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        {report.canDecode ? (
          <Pill tone="success">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" /> Complete set · {report.set?.partCount} {report.set?.partCount === 1 ? 'page' : 'pages'}
          </Pill>
        ) : (
          <Pill tone="error">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {firstError ? (STATUS_LABEL[firstError.code] ?? 'Cannot decode') : 'Cannot decode'}
          </Pill>
        )}
        {report.canDecode && report.needsPassword && (
          <Pill tone="warning">
            <KeyRound className="h-4 w-4" aria-hidden="true" /> Password required
          </Pill>
        )}
        {report.set && <span className="text-sm text-ink-soft">Set {shortId(report.set.sessionId)}</span>}
      </div>
      {report.issues.map((i) => (
        <Alert key={i.code + i.message} tone={i.severity === 'error' ? 'error' : 'warning'}>
          {i.message}
        </Alert>
      ))}
    </div>
  );
}

export default function DecodePage() {
  const [settings] = useSettings();
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const inspect = useJob<'inspect'>();
  const decode = useJob<'decode'>();
  const { run: runInspect, reset: resetInspect } = inspect;
  const { reset: resetDecode } = decode;

  useEffect(() => {
    resetDecode();
    if (files.length === 0) resetInspect();
    else void runInspect({ type: 'inspect', files });
  }, [files, runInspect, resetInspect, resetDecode]);

  const addFiles = useCallback((incoming: File[]) => {
    setFiles((prev) => {
      const next = [...prev];
      for (const f of incoming) if (!next.some((g) => sameFile(f, g))) next.push(f);
      return next.slice(0, LIMITS.MAX_FILES_PER_DECODE);
    });
  }, []);

  const report = inspect.state.status === 'done' ? inspect.state.result : null;
  const decoding = decode.state.status === 'running';
  const canRecover = report?.canDecode === true && (!report.needsPassword || password.length > 0) && !decoding;

  const stages = DECODE_STAGES.filter((s) => s.id !== 'decrypt' || report?.needsPassword);

  const recover = async () => {
    setDownloadError(null);
    const outcome = await decode.run({ type: 'decode', files, password: report?.needsPassword ? password : undefined });
    setPassword('');
    if (settings.keepHistory && (outcome.status === 'done' || outcome.status === 'error')) {
      addHistory({
        kind: 'decode',
        fileName: outcome.status === 'done' ? outcome.result.fileName : (files[0]?.name ?? 'unknown'),
        size: outcome.status === 'done' ? outcome.result.size : 0,
        parts: report?.set?.partCount ?? 0,
        ok: outcome.status === 'done',
      });
    }
  };

  const startOver = () => {
    decode.reset();
    setFiles([]);
    setPassword('');
    setDownloadError(null);
  };

  if (decode.state.status === 'done') {
    const r = decode.state.result;
    return (
      <div>
        <PageTitle title="File recovered" subtitle="It matches the original byte for byte." />
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="success">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" /> Verified: matches the original checksum
              </Pill>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="File name" value={<span data-testid="recovered-name">{r.fileName}</span>} />
              <Stat label="Type" value={r.mime || 'Unknown'} />
              <Stat label="Size" value={formatBytes(r.size)} />
              <Stat label="Compression" value={r.compression === 'deflate' ? `Yes (${formatBytes(r.storedSize)} stored)` : 'None'} />
              <Stat label="Encryption" value={r.encrypted ? 'Password protected' : 'None'} />
              <Stat label="Pages" value={r.partCount} />
            </dl>
            <details className="mt-4 text-sm text-ink-soft">
              <summary className="cursor-pointer font-semibold text-ink">Technical details</summary>
              <p className="mt-2 break-all font-mono text-xs">SHA-256: {r.sha256}</p>
            </details>
          </Card>
          <Alert tone="info" title="Only open files you trust">
            pixti restores exactly what was encoded. It cannot tell you whether the file itself is safe.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="download-recovered"
              onClick={() => {
                try {
                  downloadBlob(r.blob, r.fileName);
                  setDownloadError(null);
                } catch {
                  setDownloadError('The download could not be started. Try again, or allow downloads for this site.');
                }
              }}
            >
              <Download className="h-5 w-5" aria-hidden="true" /> Download {r.fileName}
            </Button>
            <Button variant="secondary" onClick={startOver}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Decode another
            </Button>
          </div>
          {downloadError && <Alert tone="error" title={downloadError} />}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="Decode a document" subtitle="Add the pixti PDF (or all PDFs of a set, in any order) to get your original file back." />
      <div className="space-y-6">
        {decode.state.status === 'running' ? (
          <ProgressPanel title="Recovering…" stages={stages} progress={{ stage: decode.state.stage, fraction: decode.state.fraction }} onCancel={decode.cancel} />
        ) : (
          <>
            {decode.state.status === 'cancelled' && <Alert tone="info" title="Cancelled." />}
            {decode.state.status === 'error' && (
              <Alert tone="error" title={decode.state.error.code === 'DECRYPT_FAILED' ? 'Could not decrypt' : 'Recovery failed'}>
                {decode.state.error.message}
              </Alert>
            )}

            <Dropzone
              testId="decode-input"
              multiple
              accept="application/pdf,.pdf"
              title={files.length > 0 ? 'Add more files' : 'Drop pixti PDFs here'}
              hint="Select every file of a set at once. They can be in any order."
              onFiles={addFiles}
            />

            {files.length > 0 && (
              <Card className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">
                    {files.length} {files.length === 1 ? 'file' : 'files'}
                  </h2>
                  <Button variant="ghost" className="!px-3 !py-1.5 text-sm" onClick={() => setFiles([])}>
                    Remove all
                  </Button>
                </div>

                {inspect.state.status === 'running' && (
                  <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-sun" aria-hidden="true" /> Reading files…
                  </p>
                )}
                {inspect.state.status === 'error' && <Alert tone="error">{inspect.state.error.message}</Alert>}
                {report && <SetStatus report={report} />}

                <ul className="space-y-3">
                  {files.map((f, idx) => {
                    const fr = report?.files[idx];
                    return (
                      <li key={`${f.name}-${f.size}-${f.lastModified}-${idx}`} className="rounded-xl border border-brand-sky/60 p-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{f.name}</p>
                            <p className="text-sm text-ink-soft">{formatBytes(f.size)}</p>
                          </div>
                          <Button variant="ghost" className="!p-2" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, i) => i !== idx))}>
                            <X className="h-5 w-5" aria-hidden="true" />
                          </Button>
                        </div>
                        {fr?.error && (
                          <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
                            {fr.error}
                          </p>
                        )}
                        {fr && fr.pages.length > 0 && (
                          <ul className="mt-3 flex flex-wrap gap-3">
                            {fr.pages.map((p) => {
                              const dup = p.index !== undefined && report?.set?.duplicates.includes(p.index);
                              return (
                                <li key={p.page} className="w-24 text-center">
                                  <Thumb
                                    thumb={p.thumb}
                                    label={p.index ? `Page ${p.index} of ${p.count}` : `Unreadable page ${p.page}`}
                                    className={`mx-auto h-24 w-24 rounded-md border-2 object-cover ${p.status === 'ok' ? 'border-brand-sky' : 'border-red-400'}`}
                                  />
                                  <p className="mt-1 text-xs font-semibold text-ink">{p.index ? `Part ${p.index}/${p.count}` : 'Unreadable'}</p>
                                  {p.status !== 'ok' && <p className="text-xs text-red-700">{p.status === 'corrupt' ? 'Damaged' : 'Invalid'}</p>}
                                  {dup && <p className="text-xs text-[#6b3f06]">Duplicate</p>}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {report?.canDecode && report.needsPassword && (
              <Card>
                <h2 className="mb-4 text-lg font-bold">This file is password protected</h2>
                <PasswordFields mode="enter" password={password} onPassword={setPassword} />
              </Card>
            )}

            {files.length > 0 && (
              <Button className="w-full sm:w-auto" disabled={!canRecover} onClick={recover} data-testid="start-decode">
                Recover file
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
