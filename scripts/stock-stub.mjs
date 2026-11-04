/* global process, console */
// Stand-in for the Stock Manager stock service, for the local stack and CI e2e only.
// Signs in STOCK_API_EMAIL / STOCK_API_PASSWORD (POST /auth/login) and answers GET /products with the
// SKUs the tests use, refusing any other token.
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 3040);
const EMAIL = process.env.STOCK_API_EMAIL ?? '';
const PASSWORD = process.env.STOCK_API_PASSWORD ?? '';
const TOKEN = 'stub-viewer-token';
const PRODUCTS = [
  { sku: 'E2E-1', name: 'Test burger', quantity: 1000 },
  { sku: 'BRG-01', name: 'Burger', quantity: 50 },
  { sku: 'KB-001', name: 'Keyboard', quantity: 20 },
];

http
  .createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/auth/login') {
      let raw = '';
      request.on('data', (chunk) => (raw += chunk));
      request.on('end', () => {
        let body = {};
        try {
          body = JSON.parse(raw);
        } catch {
          // invalid JSON is refused below
        }
        const ok = EMAIL && body.email === EMAIL && body.password === PASSWORD;
        response
          .writeHead(ok ? 200 : 401, { 'content-type': 'application/json' })
          .end(ok ? JSON.stringify({ accessToken: TOKEN }) : '{"code":"INVALID_CREDENTIALS"}');
      });
      return;
    }
    if (request.method !== 'GET' || request.url !== '/products') {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response
        .writeHead(401, { 'content-type': 'application/json' })
        .end('{"code":"SESSION_INVALID"}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(PRODUCTS));
  })
  .listen(PORT, () => console.log(`stock stub on ${PORT}`));
