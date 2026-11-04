/* global process, console */
// Stand-in for the Stock Manager stock service, for the local stack and CI e2e only.
// Answers GET /products with the SKUs the tests use, and refuses any token but STOCK_API_TOKEN.
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 3040);
const TOKEN = process.env.STOCK_API_TOKEN ?? '';
const PRODUCTS = [
  { sku: 'E2E-1', name: 'Test burger', quantity: 1000 },
  { sku: 'BRG-01', name: 'Burger', quantity: 50 },
  { sku: 'KB-001', name: 'Keyboard', quantity: 20 },
];

http
  .createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/products') {
      response.writeHead(404).end();
      return;
    }
    if (!TOKEN || request.headers.authorization !== `Bearer ${TOKEN}`) {
      response
        .writeHead(401, { 'content-type': 'application/json' })
        .end('{"code":"SESSION_INVALID"}');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(PRODUCTS));
  })
  .listen(PORT, () => console.log(`stock stub on ${PORT}`));
