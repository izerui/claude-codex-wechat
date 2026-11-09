import test from 'node:test';
import assert from 'node:assert/strict';
import { createTicketAuth, generateTicket, SESSION_COOKIE_NAME } from '../src/ticketAuth.mjs';

test('generateTicket returns 8 chars of a-z0-9', () => {
  for (let i = 0; i < 50; i++) assert.match(generateTicket(), /^[a-z0-9]{8}$/);
});

test('session cookie name is relay_session', () => {
  assert.equal(SESSION_COOKIE_NAME, 'relay_session');
});

test('ticket is one-time and bound to its auth token', () => {
  const auth = createTicketAuth();
  const t = auth.issueTicket('A');
  assert.equal(auth.redeemTicket('B', t), null);
  const sid = auth.redeemTicket('A', t);
  assert.ok(sid);
  assert.match(sid, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(auth.isValidSession('A', sid), true);
  assert.equal(auth.isValidSession('B', sid), false);
  assert.equal(auth.redeemTicket('A', t), null);
});

test('redeeming does not issue a new ticket by itself', () => {
  const auth = createTicketAuth();
  auth.redeemTicket('A', auth.issueTicket('A'));
  assert.equal(auth.currentTicket('A'), null);
});

test('issuing a new ticket invalidates the previous one', () => {
  const auth = createTicketAuth();
  const old = auth.issueTicket('A');
  const next = auth.issueTicket('A');
  assert.equal(auth.currentTicket('A'), next);
  assert.equal(auth.redeemTicket('A', old), null);
});

test('ticket expires after one day and is reported for reissue', () => {
  let clock = 0;
  const auth = createTicketAuth({ now: () => clock });
  const t = auth.issueTicket('A');
  clock = 86_400_000 + 1;
  assert.equal(auth.currentTicket('A'), null);
  assert.deepEqual(auth.takeExpiredTicketOwners(), ['A']);
  assert.deepEqual(auth.takeExpiredTicketOwners(), []);
  assert.equal(auth.redeemTicket('A', t), null);
});

test('session lasts exactly seven days without renewal', () => {
  let clock = 0;
  const auth = createTicketAuth({ now: () => clock });
  const sid = auth.redeemTicket('A', auth.issueTicket('A'));
  clock = 604_800_000 - 1;
  assert.equal(auth.isValidSession('A', sid), true);
  clock = 604_800_000 + 1;
  assert.equal(auth.isValidSession('A', sid), false);
});

test('sweep removes expired sessions', () => {
  let clock = 0;
  const auth = createTicketAuth({ now: () => clock });
  const sid = auth.redeemTicket('A', auth.issueTicket('A'));
  clock = 604_800_001;
  auth.sweep();
  clock = 0;
  // 清理后即使时钟回拨也查不到，证明记录确实被删除。
  assert.equal(auth.isValidSession('A', sid), false);
});

test('revokeTicket makes the current ticket unusable', () => {
  const auth = createTicketAuth();
  const t = auth.issueTicket('A');
  auth.revokeTicket('A');
  assert.equal(auth.redeemTicket('A', t), null);
});
