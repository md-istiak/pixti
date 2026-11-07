import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Trash2, XCircle } from 'lucide-react';
import { Alert, Button, Card, PageTitle } from '../../components/ui/primitives.tsx';
import { useSettings } from '../../hooks/useSettings.ts';
import { clearHistory, loadHistory } from '../../utils/history.ts';
import type { HistoryEntry } from '../../utils/history.ts';
import { formatBytes, formatDate } from '../../utils/format.ts';

export default function HistoryPage() {
  const [settings] = useSettings();
  const [items, setItems] = useState<HistoryEntry[]>(loadHistory);

  const clear = () => {
    if (window.confirm('Clear the local history on this device? This cannot be undone.')) {
      clearHistory();
      setItems([]);
    }
  };

  return (
    <div>
      <PageTitle title="History" subtitle="A private list kept only in this browser: names, sizes and dates. Never your files, passwords or keys." />
      <div className="space-y-6">
        {!settings.keepHistory && (
          <Alert tone="info" title="History is turned off">
            New activity is not being recorded. You can turn it on in <Link className="font-semibold underline" to="/settings">Settings</Link>.
          </Alert>
        )}
        {items.length === 0 ? (
          <Card className="text-center text-ink-soft">Nothing here yet.</Card>
        ) : (
          <Card className="space-y-4">
            <ul className="divide-y divide-brand-sky/50">
              {items.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-3">
                  {h.ok ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" aria-label="Succeeded" />
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-label="Failed" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{h.fileName}</p>
                    <p className="text-sm text-ink-soft">
                      {h.kind === 'encode' ? 'Encoded' : 'Decoded'} · {h.size > 0 ? `${formatBytes(h.size)} · ` : ''}
                      {h.parts > 0 ? `${h.parts} ${h.parts === 1 ? 'page' : 'pages'} · ` : ''}
                      {formatDate(h.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <Button variant="danger" onClick={clear}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Clear history
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
