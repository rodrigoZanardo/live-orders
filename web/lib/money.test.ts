import { formatCents, parseReais } from './money';

describe('formatCents', () => {
  it('formats cents as reais in the locale', () => {
    expect(formatCents(1250, 'pt').replace(/\s/g, ' ')).toBe('R$ 12,50');
    expect(formatCents(1250, 'en')).toBe('R$12.50');
  });
});

describe('parseReais', () => {
  it.each([
    ['50', 5000],
    ['50,00', 5000],
    ['R$ 50.5', 5050],
    ['0,99', 99],
  ])('reads %p as %p cents', (text, cents) => {
    expect(parseReais(text)).toBe(cents);
  });

  it.each(['', 'abc', '1.234,00', '-5', '5,123'])('refuses %p', (text) => {
    expect(parseReais(text)).toBeNull();
  });
});
