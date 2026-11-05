import { isOpen, statusSteps } from './timeline';

describe('statusSteps', () => {
  it('marks the steps before the current one as done', () => {
    expect(statusSteps('READY')).toEqual([
      { status: 'RECEIVED', state: 'done' },
      { status: 'PREPARING', state: 'done' },
      { status: 'READY', state: 'current' },
      { status: 'DELIVERED', state: 'todo' },
    ]);
  });

  it('shows a cancelled order as received then cancelled', () => {
    expect(statusSteps('CANCELLED').map((step) => step.status)).toEqual(['RECEIVED', 'CANCELLED']);
  });
});

describe('isOpen', () => {
  it('is open until delivered or cancelled', () => {
    expect(isOpen('PREPARING')).toBe(true);
    expect(isOpen('DELIVERED')).toBe(false);
    expect(isOpen('CANCELLED')).toBe(false);
  });
});
