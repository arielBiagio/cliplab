import type { SVGProps } from 'react';

const paths = {
  play: 'm9 5 11 7-11 7V5Z',
  pause: 'M8 5v14M16 5v14',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4',
  download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
  undo: 'm9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12',
  redo: 'm15 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
  keyboard: 'M3 6h18v12H3V6Zm4 4h.01M11 10h.01M15 10h.01M19 10h.01M7 14h.01M10 14h7',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  restart: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
  loop: 'm17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3',
  volume: 'M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  muted: 'M11 4 6 8H3v8h3l5 4V4Zm5 5 6 6m0-6-6 6',
  backward: 'm11 6-8 6 8 6V6Zm10 0-8 6 8 6V6Z',
  forward: 'm3 6 8 6-8 6V6Zm10 0 8 6-8 6V6Z',
  sun: 'M12 3v1m0 16v1M3 12h1m16 0h1M5.6 5.6l.7.7m11.4 11.4.7.7M5.6 18.4l.7-.7M17.7 6.3l.7-.7M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  contrast: 'M12 3a9 9 0 1 0 0 18V3Zm0 0a9 9 0 0 1 0 18',
  compare: 'M3 4h18v16H3V4Zm9 0v16m-6-11 2 3-2 3m12-6-2 3 2 3',
  fullscreen: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  minimize: 'M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5',
  drop: 'M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z',
  sliders: 'M4 7h7m4 0h5M4 17h3m4 0h9M11 4v6M7 14v6',
  film: 'M4 3h16v18H4V3Zm0 5h16M4 16h16M8 3v5m8-5v5M8 16v5m8-5v5',
  lock: 'M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 8 0v4',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  info: 'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
} satisfies Record<string, string>;

export type IconName = keyof typeof paths;

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
