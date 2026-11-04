// Inline SVG instead of emoji: Windows renders flag emoji as two letters ("BR").
export function Flag({ locale }: { locale: 'en' | 'pt' }) {
  return locale === 'en' ? (
    <svg viewBox="0 0 60 30" className="h-3.5 w-5 shrink-0 rounded-[2px]" aria-hidden>
      <path d="M0 0v30h60V0z" fill="#012169" />
      <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0l60 30m0-30L0 30" stroke="#C8102E" strokeWidth="2" />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5 shrink-0 rounded-[2px]" aria-hidden>
      <rect width="20" height="14" fill="#009C3B" />
      <path d="M10 1.6 18.2 7 10 12.4 1.8 7z" fill="#FFDF00" />
      <circle cx="10" cy="7" r="3.1" fill="#002776" />
    </svg>
  );
}
