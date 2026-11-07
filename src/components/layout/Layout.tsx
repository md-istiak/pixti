import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Logo } from '../brand/Logo.tsx';
import { routes } from '../../app/routes.tsx';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-brand-sky/50 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="pixti home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            {routes
              .filter((r) => r.nav)
              .map((r) => (
                <NavLink
                  key={r.path}
                  to={r.path}
                  className={({ isActive }: { isActive: boolean }) =>
                    `rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      isActive ? 'bg-brand-mist text-brand-dark' : 'text-ink-soft hover:bg-brand-mist hover:text-ink'
                    }`
                  }
                >
                  {r.label}
                </NavLink>
              ))}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        {children}
      </main>

      <footer className="border-t border-brand-sky/50 bg-brand-mist">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-ink-soft sm:px-6">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-brand" aria-hidden="true" /> Everything happens on your device. Files are never uploaded.
          </p>
          <p>pixti is a convenient way to move files around, not a substitute for backups.</p>
        </div>
      </footer>
    </div>
  );
}
