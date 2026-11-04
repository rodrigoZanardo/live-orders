#!/usr/bin/env node
/* global process, console, Buffer */
// Prints the outgoing webhooks Live Orders sends, after checking their signature.
//   WEBHOOK_SECRET=whsec_... node scripts/webhook-receiver.mjs   (PORT default 4000)
// Register http://localhost:4000 as a subscription on the Webhooks page; copy its secret here.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 4000);
const secret = process.env.WEBHOOK_SECRET;
if (!secret) {
  console.error('Set WEBHOOK_SECRET to the secret shown when the subscription was created.');
  process.exit(1);
}

function isGenuine(body, timestamp, signature) {
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`,
  );
  const actual = Buffer.from(signature ?? '');
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300;
  return fresh && expected.length === actual.length && timingSafeEqual(expected, actual);
}

createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    const ok = isGenuine(body, request.headers['x-timestamp'], request.headers['x-signature']);
    response.statusCode = ok ? 200 : 401;
    response.end();
    if (!ok) {
      console.log('refused: bad signature or old timestamp');
      return;
    }
    const event = JSON.parse(body);
    console.log(
      `#${event.seq} ${event.type} order #${event.order?.number} ${event.fromStatus ?? '-'} -> ${event.toStatus}`,
    );
  });
}).listen(port, () => console.log(`Listening on http://localhost:${port}`));
