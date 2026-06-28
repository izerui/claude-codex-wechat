import test from 'node:test';
import assert from 'node:assert/strict';

import {
  signAccessCodeBody,
  signAccessCodePayload,
  signActivationBody,
  signActivationPayload,
} from '../src/activationSigning.mjs';
import {
  encodeAccessCode,
  encodeActivationCode,
} from '../src/activationCode.mjs';

test('keeps relay-server activation signing aliases wired to access-code implementations', () => {
  assert.equal(signActivationPayload, signAccessCodePayload);
  assert.equal(signActivationBody, signAccessCodeBody);
});

test('keeps relay-server activation encoding alias wired to access-code implementation', () => {
  assert.equal(encodeActivationCode, encodeAccessCode);
});
