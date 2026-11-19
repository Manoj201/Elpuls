/**
 * Small line icons (24px grid, 2px stroke, in the style of Tabler / Lucide),
 * drawn inline so the site needs no icon library. Decorative: always paired
 * with visible text, so they're hidden from screen readers.
 */
const PATHS: Record<string, string> = {
  bolt: 'M13 3 4 14h7l-1 7 9-11h-7l1-7z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2z M10 20a2 2 0 0 0 4 0',
  hand: 'M8 13V5a1.5 1.5 0 0 1 3 0v6 M11 11V4a1.5 1.5 0 0 1 3 0v7 M14 11V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.3 14a1.5 1.5 0 0 1 2.4-1.8L8 15',
  plug: 'M9 3v5 M15 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4',
  cloud: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z M9 12l2 2 4-4',
  check: 'M5 12l5 5L20 7',
  server: 'M4 4h16v6H4z M4 14h16v6H4z M8 7h.01 M8 17h.01',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2',
  chevron: 'M6 9l6 6 6-6',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  apple:
    'M16.4 12.6c0-2 1.6-3 1.7-3.1a3.7 3.7 0 0 0-2.9-1.6c-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7a3.9 3.9 0 0 0-3.3 2c-1.4 2.4-.4 6 1 8 .7 1 1.5 2 2.5 2s1.4-.6 2.6-.6 1.5.6 2.6.6 1.7-1 2.4-2a8 8 0 0 0 1.1-2.2 3.4 3.4 0 0 1-2-3.1z M14.5 6.4a3.4 3.4 0 0 0 .8-2.5 3.5 3.5 0 0 0-2.3 1.2 3.3 3.3 0 0 0-.8 2.4 2.9 2.9 0 0 0 2.3-1.1z',
};

export function Icon({ name, size = 22, filled = false }: { name: keyof typeof PATHS | string; size?: number; filled?: boolean }) {
  const d = PATHS[name] ?? PATHS.bolt;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
