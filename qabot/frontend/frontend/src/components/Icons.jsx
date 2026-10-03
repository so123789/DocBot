function Svg({ children, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const UploadIcon = (p) => (
  <Svg {...p}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" /></Svg>
)
export const SendIcon = (p) => (
  <Svg {...p}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></Svg>
)
export const FileIcon = (p) => (
  <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></Svg>
)
export const ChatIcon = (p) => (
  <Svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" /></Svg>
)
export const SparkleIcon = (p) => (
  <Svg {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Svg>
)
export const CheckIcon = (p) => (
  <Svg {...p}><path d="m5 12 5 5L20 7" /></Svg>
)
export const AlertIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></Svg>
)
export const InfoIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5h.01" /></Svg>
)
export const ImageIcon = (p) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></Svg>
)
export const ScanIcon = (p) => (
  <Svg {...p}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></Svg>
)
export const CloseIcon = (p) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
)
export const ChevronIcon = (p) => (
  <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>
)
export const PlusIcon = (p) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
)
export const CopyIcon = (p) => (
  <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Svg>
)
export const RefreshIcon = (p) => (
  <Svg {...p}><path d="M20 11a8 8 0 0 0-14.9-3.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.9L20 16" /><path d="M20 20v-4h-4" /></Svg>
)
export const BookIcon = (p) => (
  <Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /><path d="M9 7h6" /></Svg>
)
export const ShieldIcon = (p) => (
  <Svg {...p}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></Svg>
)
export const BoltIcon = (p) => (
  <Svg {...p}><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></Svg>
)
export const MenuIcon = (p) => (
  <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
)

export function Logo({ size = 32 }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width={size} height={size}>
        <rect width="32" height="32" rx="9" fill="url(#lg)" />
        <path d="M10 9h8l4 4v10a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z" fill="#fff" opacity=".95" />
        <path d="M12.5 16h7M12.5 19.5h4.5" stroke="#5b4cf5" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="23.5" cy="9" r="3" fill="#ffc94d" />
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32">
            <stop stopColor="#6d5dfc" />
            <stop offset="1" stopColor="#9b5cf6" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  )
}
