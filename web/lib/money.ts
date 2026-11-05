/** Cents as Brazilian reais in the reader's locale (R$ 12,50 in pt, R$12.50 in en). */
export function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

/** What a customer types as cash ("50", "50,00", "R$ 50.5") in cents; null when it is not an amount. */
export function parseReais(text: string): number | null {
  const plain = text.replace(/R\$|\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return null;
  return Math.round(Number(plain) * 100);
}
