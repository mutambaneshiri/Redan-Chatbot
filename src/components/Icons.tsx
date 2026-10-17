// Icons. They draw in currentColor, so they pick up the colour of whatever
// they sit in (white in the header, brand blue in the avatar).

type IconProps = { size?: number; className?: string };

/**
 * The Redan lion: the assistant's logo and avatar. The artwork
 * (public/redan-lion.svg, from Redan's website) is used as a mask, so the lion
 * takes the colour of whatever it sits in — white in the header, brand blue in
 * the avatar.
 */
export function RedanLogo({ size = 20, className }: IconProps) {
  return (
    <span
      role="img"
      aria-label="Redan"
      className={["redan-logo", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
    />
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
