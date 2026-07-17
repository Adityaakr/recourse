// The vara.eth "VE" mark, recourse runs on vara.eth and has no mark of its
// own, so we use theirs. Recreated as a crisp inline SVG (dark rounded square,
// mint V, white E, the small corner dots) so it scales cleanly at any size.

export function VaraLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" role="img" aria-label="vara.eth">
      <rect width="56" height="56" rx="15" fill="#2E2740" />
      {/* corner dots */}
      <circle cx="11" cy="10" r="1.3" fill="#fff" opacity=".55" />
      <circle cx="45" cy="13" r="1.3" fill="#fff" opacity=".35" />
      <circle cx="13" cy="45" r="1.3" fill="#fff" opacity=".35" />
      <circle cx="44" cy="44" r="1.3" fill="#fff" opacity=".55" />
      {/* V, mint */}
      <path d="M7 16h7l6 16 6-16h7l-9.5 24h-7z" fill="#8FEFC0" />
      {/* E, white */}
      <path d="M33 16h16v5.5h-10v3.2h8.5v5.4H39v3.4h10V40H33z" fill="#F7F8FA" />
    </svg>
  );
}
