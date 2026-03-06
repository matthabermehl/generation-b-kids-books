#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';

const API_BASE_URL = process.env.API_BASE_URL ?? 'https://ufm4cqfnqe.execute-api.us-east-1.amazonaws.com';
const SSM_PREFIX = process.env.SSM_PREFIX ?? '/ai-childrens-book/dev';
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
const EMAIL = process.env.SMOKE_EMAIL ?? `markpaid-${Date.now()}@example.com`;

const ssm = new SSMClient({ region: AWS_REGION });

function normalizeName(name) {
  return name.startsWith(`${SSM_PREFIX}/`) ? name.slice(SSM_PREFIX.length + 1).toLowerCase() : name.toLowerCase();
}

async function loadSsm() {
  let nextToken;
  const byName = {};
  do {
    const response = await ssm.send(new GetParametersByPathCommand({ Path: SSM_PREFIX, Recursive: true, WithDecryption: true, NextToken: nextToken }));
    for (const p of response.Parameters ?? []) {
      if (!p.Name || p.Value === undefined) continue;
      byName[normalizeName(p.Name)] = p.Value;
    }
    nextToken = response.NextToken;
  } while (nextToken);
  return byName;
}

async function post(path, body, token, headers = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  if (!response.ok) {
    throw new Error(`POST ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function get(path, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  if (!response.ok) {
    throw new Error(`GET ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(orderInput, options = {}) {
  const cfg = await loadSsm();
  const jwtSecret = cfg.jwt_signing_secret;
  const ttlMinutes = Number(cfg.auth_link_ttl_minutes ?? '15');
  if (!jwtSecret) throw new Error('Missing jwt_signing_secret');

  await post('/v1/auth/request-link', { email: EMAIL }, null, { 'idempotency-key': randomUUID() });
  const loginToken = jwt.sign({ email: EMAIL, purpose: 'login' }, jwtSecret, { expiresIn: `${ttlMinutes}m` });
  const verified = await post('/v1/auth/verify-link', { token: loginToken }, null, { 'idempotency-key': randomUUID() });
  const session = verified.token;

  const order = await post('/v1/orders', orderInput, session, { 'idempotency-key': randomUUID() });
  console.log('ORDER', order.orderId, order.bookId);

  const markPaidHeaders = {
    'idempotency-key': randomUUID(),
    ...(options.mockRunTag ? { 'x-mock-run-tag': options.mockRunTag } : {})
  };

  const started = await post(`/v1/orders/${order.orderId}/mark-paid`, {}, session, markPaidHeaders);
  console.log('MARK_PAID', started);

  const timeoutAt = Date.now() + 25 * 60_000;
  while (Date.now() < timeoutAt) {
    const status = await get(`/v1/orders/${order.orderId}`, session);
    console.log('STATUS', status.status, status.bookStatus, status.bookId);
    if (status.status === 'ready' && status.bookStatus === 'ready') {
      const download = await get(`/v1/books/${status.bookId}/download?format=pdf`, session);
      console.log('READY', JSON.stringify({ orderId: order.orderId, bookId: status.bookId, url: download.url }));
      return { orderId: order.orderId, bookId: status.bookId, url: download.url };
    }
    if (status.status === 'failed' || status.bookStatus === 'failed') {
      throw new Error(`Order failed: ${JSON.stringify(status)}`);
    }
    await sleep(10000);
  }

  throw new Error('Timed out waiting for ready');
}

const input = {
  childFirstName: process.env.CHILD_NAME ?? 'Maya',
  pronouns: process.env.PRONOUNS ?? 'she/her',
  ageYears: Number(process.env.AGE ?? '7'),
  moneyLessonKey: process.env.LESSON ?? 'saving_later',
  interestTags: (process.env.INTERESTS ?? 'soccer,puzzles,space').split(',').map((x) => x.trim()).filter(Boolean),
  readingProfileId: process.env.PROFILE ?? 'early_decoder_5_7'
};

run(input, { mockRunTag: process.env.MOCK_RUN_TAG }).catch((error) => {
  console.error('RUN_FAIL', error.message);
  process.exitCode = 1;
});
