#!/usr/bin/env node
// Plays the delivery platform for the demo: signs orders and sends them to the incoming webhook.
//   node scripts/delivery-platform.mjs          one random order every 5 seconds
//   node scripts/delivery-platform.mjs --once   a single order
// Env: API_URL (default http://localhost:3001), WEBHOOK_INCOMING_SECRET (required).
import { createHmac, randomUUID } from 'node:crypto';

const apiUrl = process.env.API_URL ?? 'http://localhost:3001';
const secret = process.env.WEBHOOK_INCOMING_SECRET;
if (!secret) {
  console.error('Set WEBHOOK_INCOMING_SECRET (the same value the API uses).');
  process.exit(1);
}

// SKUs match products of the Stock Manager demo (PLAN.md phase 16)
const products = [
  { sku: 'KB-001', name: 'Mechanical keyboard' },
  { sku: 'MS-002', name: 'Wireless mouse' },
  { sku: 'HS-003', name: 'Headset' },
  { sku: 'MN-004', name: '27" monitor' },
];
const customers = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe'];
const ceps = ['01001-000', '20040-020', '30130-010', '70040-010'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function randomOrder() {
  const items = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({
    ...pick(products),
    quantity: 1 + Math.floor(Math.random() * 2),
  }));
  return {
    externalId: `platform-${randomUUID().slice(0, 8)}`,
    customerName: pick(customers),
    items,
    delivery: { cep: pick(ceps), number: String(1 + Math.floor(Math.random() * 900)) },
  };
}

async function send() {
  const body = JSON.stringify(randomOrder());
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
  const response = await fetch(`${apiUrl}/webhooks/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      'Idempotency-Key': randomUUID(),
    },
    body,
  });
  const answer = await response.json();
  console.log(
    response.status,
    answer.number ? `order #${answer.number} for ${answer.customerName}` : answer,
  );
}

if (process.argv.includes('--once')) {
  await send();
} else {
  console.log(`Sending an order to ${apiUrl} every 5 s. Ctrl+C to stop.`);
  await send();
  setInterval(() => send().catch((error) => console.error(error.message)), 5000);
}
