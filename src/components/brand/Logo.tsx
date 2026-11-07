/** A 3x3 pixel grid with one sun-orange pixel. */
export function LogoMark({ size = 32 }: { size?: number }) {
  const cells = ['#168B55', '#A9DDF5', '#116B43', '#A9DDF5', '#F59B38', '#168B55', '#116B43', '#168B55', '#A9DDF5'];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="#F1F9FD" />
      {cells.map((c, i) => (
        <rect key={i} x={9 + (i % 3) * 16} y={9 + Math.floor(i / 3) * 16} width="14" height="14" rx="3" fill={c} />
      ))}
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="text-xl font-extrabold tracking-tight text-brand-dark">pixti</span>
    </span>
  );
}
