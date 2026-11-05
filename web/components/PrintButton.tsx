'use client';

/** Opens the browser print dialog; hidden on paper. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn-primary print:hidden" onClick={() => window.print()}>
      {label}
    </button>
  );
}
