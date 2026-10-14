// Inline SVG icons. They draw in currentColor, so they pick up the colour of
// whatever they sit in (white in the header, brand blue in the avatar).

type IconProps = { size?: number; className?: string };

/** Fuel pump: the assistant's logo and avatar. */
export function FuelPumpIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* Pump body */}
      <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      {/* Display window */}
      <rect x="6.5" y="5.5" width="5" height="4" rx="0.8" fill="currentColor" stroke="none" />
      {/* Base */}
      <path d="M2.5 21h13" />
      {/* Hose and nozzle */}
      <path d="M14 12h1.5a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V8.6a1.5 1.5 0 0 0-.44-1.06L17.5 5" />
      <path d="M18.5 9.5h2" />
    </svg>
  );
}

export function SendIcon({ size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function LocationIcon({ size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}
