import { ERROR_CODES } from '../../api/src/domain/errors';
import en from '../messages/en.json';
import pt from '../messages/pt.json';

/** Every key path of a nested messages object, e.g. "board.connection.live". */
function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('translations', () => {
  it('translate every error code of the API catalog in both languages', () => {
    const missing = ERROR_CODES.filter((code) => !(code in en.errors) || !(code in pt.errors));
    expect(missing).toEqual([]);
  });

  it('have the same keys in English and Portuguese', () => {
    expect(keys(pt).sort()).toEqual(keys(en).sort());
  });
});
