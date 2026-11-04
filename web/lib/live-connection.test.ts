import { parseLiveMessage, reconnectDelay } from './live-connection';

describe('live connection helpers', () => {
  it('grows the reconnect delay and then keeps the last one', () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnectDelay)).toEqual([
      1000, 2000, 5000, 10000, 10000, 10000,
    ]);
  });

  it('parses hello and event messages', () => {
    expect(parseLiveMessage('{"type":"hello","lastSeq":7}')).toEqual({ type: 'hello', lastSeq: 7 });
    const event = { seq: 8, order: { id: 'a', version: 2 } };
    expect(parseLiveMessage(JSON.stringify({ type: 'event', seq: 8, event }))).toMatchObject({
      type: 'event',
      seq: 8,
    });
  });

  it('ignores malformed or unknown messages', () => {
    expect(parseLiveMessage('not json')).toBeNull();
    expect(parseLiveMessage('{"type":"other"}')).toBeNull();
    expect(parseLiveMessage('{"type":"event","seq":1,"event":{"seq":1}}')).toBeNull();
  });
});
