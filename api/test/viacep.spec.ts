import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { ViaCepClient } from '../src/infra/viacep.client';

/** A local stand-in for ViaCEP, so the client's parsing and failure handling run without network. */
describe('ViaCepClient against a fake server', () => {
  let server: Server;
  let client: ViaCepClient;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/01001000/json/') {
        response.end(
          JSON.stringify({
            logradouro: 'Praça da Sé',
            bairro: 'Sé',
            localidade: 'São Paulo',
            uf: 'SP',
          }),
        );
      } else if (request.url === '/99999999/json/') {
        response.end(JSON.stringify({ erro: true }));
      } else {
        response.statusCode = 500;
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address: AddressInfo | string | null = server.address();
    if (!address || typeof address === 'string') throw new Error('fake server has no port');
    client = new ViaCepClient(`http://127.0.0.1:${address.port}`);
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('maps a known CEP to an address', async () => {
    expect(await client.lookup('01001-000')).toEqual({
      found: true,
      address: { street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP' },
    });
  });

  it('treats { erro: true } as not found', async () => {
    expect(await client.lookup('99999999')).toEqual({ found: false });
  });

  it('treats a server error as not found instead of failing', async () => {
    expect(await client.lookup('12345678')).toEqual({ found: false });
  });

  it('does not call the server for a malformed CEP', async () => {
    expect(await client.lookup('123')).toEqual({ found: false });
  });
});

// The real API: only with NETWORK_TESTS=1, so offline runs and CI without network stay green.
const describeWithNetwork = process.env.NETWORK_TESTS === '1' ? describe : describe.skip;

describeWithNetwork('ViaCepClient against the real ViaCEP', () => {
  it('finds Praça da Sé', async () => {
    const result = await new ViaCepClient().lookup('01001000');
    expect(result).toMatchObject({ found: true, address: { city: 'São Paulo', state: 'SP' } });
  });
});
