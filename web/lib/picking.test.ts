import { pickingList } from './picking';

const item = (sku: string) => ({ sku, name: `Part ${sku}`, quantity: 1 });

describe('pickingList', () => {
  it('sorts by location ascending and puts lines without a location last, keeping their order', () => {
    const products = [
      { sku: 'A', name: 'A', quantity: 5, location: 'R02-B01-A01-P010-N1' },
      { sku: 'B', name: 'B', quantity: 5, location: null },
      { sku: 'C', name: 'C', quantity: 5, location: 'R01-B03-A04-P060-N1' },
      { sku: 'D', name: 'D', quantity: 5 },
      { sku: 'E', name: 'E', quantity: 5, location: 'R01-B03-A04-P060-N2' },
    ];
    const lines = pickingList(
      [item('A'), item('B'), item('C'), item('D'), item('E'), item('X')],
      products,
    );
    expect(lines.map((line) => [line.sku, line.location])).toEqual([
      ['C', 'R01-B03-A04-P060-N1'],
      ['E', 'R01-B03-A04-P060-N2'],
      ['A', 'R02-B01-A01-P010-N1'],
      ['B', null],
      ['D', null],
      ['X', null],
    ]);
  });

  it('compares numbers by value, not by digit', () => {
    const products = [
      { sku: 'A', name: 'A', quantity: 1, location: 'R10-B01' },
      { sku: 'B', name: 'B', quantity: 1, location: 'R9-B01' },
    ];
    expect(pickingList([item('A'), item('B')], products).map((line) => line.sku)).toEqual([
      'B',
      'A',
    ]);
  });
});
