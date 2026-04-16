import { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function svg(
  { size = 14, strokeWidth = 1.6, ...rest }: P,
  path: React.ReactNode,
) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {path}
    </svg>
  );
}

export const Icon = {
  Terminal: (p: P) =>
    svg(
      p,
      <>
        <polyline points="4 7 9 12 4 17" />
        <line x1="13" y1="17" x2="20" y2="17" />
      </>,
    ),
  Globe: (p: P) =>
    svg(
      p,
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
      </>,
    ),
  Folder: (p: P) =>
    svg(
      p,
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
    ),
  Close: (p: P) =>
    svg(
      p,
      <>
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </>,
    ),
  Plus: (p: P) =>
    svg(
      p,
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </>,
    ),
  Chevron: (p: P) => svg(p, <polyline points="9 6 15 12 9 18" />),
  ChevronLeft: (p: P) => svg(p, <polyline points="15 6 9 12 15 18" />),
  Play: (p: P) =>
    svg({ ...p, fill: "currentColor", stroke: "none" }, <polygon points="7 5 19 12 7 19 7 5" />),
  Trash: (p: P) =>
    svg(
      p,
      <>
        <polyline points="4 7 20 7" />
        <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
        <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      </>,
    ),
  Search: (p: P) =>
    svg(
      p,
      <>
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>,
    ),
  Sparkle: (p: P) =>
    svg(
      p,
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />,
    ),
  Fork: (p: P) =>
    svg(
      p,
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="9" r="2" />
        <path d="M6 7v10" />
        <path d="M6 11a6 6 0 0 0 6 -6h4" />
      </>,
    ),
  Clock: (p: P) =>
    svg(
      p,
      <>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 14" />
      </>,
    ),
  Files: (p: P) =>
    svg(
      p,
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="14 3 14 9 20 9" />
      </>,
    ),
  Panel: (p: P) =>
    svg(
      p,
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="15" y1="4" x2="15" y2="20" />
      </>,
    ),
};
