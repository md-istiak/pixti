import { Link } from 'react-router-dom';
import { ArrowRight, Cpu, FileText, Layers, Lock, ShieldCheck } from 'lucide-react';
import { buttonClass, Card } from '../../components/ui/primitives.tsx';

const PIXELS = [
  '#168B55', '#A9DDF5', '#116B43', '#F59B38', '#A9DDF5', '#168B55',
  '#116B43', '#F59B38', '#168B55', '#A9DDF5', '#116B43', '#A9DDF5',
  '#A9DDF5', '#168B55', '#A9DDF5', '#116B43', '#F59B38', '#168B55',
  '#F59B38', '#116B43', '#168B55', '#A9DDF5', '#168B55', '#116B43',
];

function Illustration() {
  return (
    <svg viewBox="0 0 640 200" role="img" aria-label="A file becomes a grid of coloured pixels inside a PDF page" className="mx-auto w-full max-w-2xl">
      <rect x="20" y="40" width="100" height="120" rx="14" fill="#F1F9FD" stroke="#A9DDF5" strokeWidth="3" />
      <path d="M45 80h50M45 100h50M45 120h32" stroke="#168B55" strokeWidth="6" strokeLinecap="round" />
      <path d="M150 100h60m-14-14 14 14-14 14" fill="none" stroke="#F59B38" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(250 50)">
        {PIXELS.map((c, i) => (
          <rect key={i} x={(i % 6) * 22} y={Math.floor(i / 6) * 22} width="20" height="20" rx="4" fill={c} />
        ))}
      </g>
      <path d="M400 100h60m-14-14 14 14-14 14" fill="none" stroke="#F59B38" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="500" y="30" width="110" height="140" rx="12" fill="#FFFFFF" stroke="#A9DDF5" strokeWidth="3" />
      <rect x="500" y="30" width="110" height="26" rx="12" fill="#F1F9FD" />
      <rect x="512" y="44" width="22" height="6" rx="3" fill="#F59B38" />
      <g transform="translate(518 68)">
        {PIXELS.slice(0, 16).map((c, i) => (
          <rect key={i} x={(i % 4) * 20} y={Math.floor(i / 4) * 20} width="18" height="18" rx="3" fill={c} />
        ))}
      </g>
    </svg>
  );
}

const STEPS = [
  { n: 1, title: 'Pick a file', body: 'Any file works: documents, photos, videos, archives, programs.' },
  { n: 2, title: 'Protect it (optional)', body: 'Lock it with a password. Strong encryption runs right in your browser.' },
  { n: 3, title: 'Get a PDF', body: 'Your file becomes pages of pixel data in a PDF, which apps normally send unchanged.' },
  { n: 4, title: 'Decode anywhere', body: 'Open the PDF in pixti and get back the exact original, checked against its fingerprint.' },
];

export default function HomePage() {
  return (
    <div className="space-y-16">
      <section className="text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Your files, transformed into images.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-soft">
          Turn any file into a shareable image document (a PDF of pixels). Recover it whenever you need, with exact file integrity.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/encode" className={buttonClass('primary')}>
            Encode a file <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link to="/decode" className={buttonClass('secondary')}>
            Decode a document
          </Link>
        </div>
        <div className="mt-12 rounded-xl2 bg-brand-mist p-6">
          <Illustration />
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="mb-6 text-2xl font-bold text-ink">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n}>
              <Card className="h-full !p-5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-cream font-bold text-[#8a4b00]">{s.n}</span>
                <h3 className="mt-3 font-bold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="why" className="grid gap-4 md:grid-cols-3">
        <h2 id="why" className="sr-only">
          Why pixti
        </h2>
        <Card>
          <ShieldCheck className="h-7 w-7 text-brand" aria-hidden="true" />
          <h3 className="mt-3 font-bold">Private by design</h3>
          <p className="mt-1 text-sm text-ink-soft">No accounts, no servers, no tracking. Your files never leave your device.</p>
        </Card>
        <Card>
          <Lock className="h-7 w-7 text-brand" aria-hidden="true" />
          <h3 className="mt-3 font-bold">Real encryption</h3>
          <p className="mt-1 text-sm text-ink-soft">AES-256-GCM with a password-derived key. A wrong password or edited data simply fails.</p>
        </Card>
        <Card>
          <FileText className="h-7 w-7 text-brand" aria-hidden="true" />
          <h3 className="mt-3 font-bold">Sent as a document</h3>
          <p className="mt-1 text-sm text-ink-soft">Chat and e-mail apps normally deliver PDFs unchanged, unlike photos, which they often recompress.</p>
        </Card>
        <Card>
          <Layers className="h-7 w-7 text-brand" aria-hidden="true" />
          <h3 className="mt-3 font-bold">Big files, handled</h3>
          <p className="mt-1 text-sm text-ink-soft">Large files become multi-page PDFs, or several PDFs if you need smaller attachments.</p>
        </Card>
        <Card>
          <Cpu className="h-7 w-7 text-brand" aria-hidden="true" />
          <h3 className="mt-3 font-bold">Stays responsive</h3>
          <p className="mt-1 text-sm text-ink-soft">Heavy work runs in the background with real progress and a cancel button.</p>
        </Card>
        <Card>
          <ShieldCheck className="h-7 w-7 text-brand" aria-hidden="true" />
          <h3 className="mt-3 font-bold">Verified recovery</h3>
          <p className="mt-1 text-sm text-ink-soft">A file is only offered once its SHA-256 matches the original. Never a half-recovered file.</p>
        </Card>
      </section>
    </div>
  );
}
