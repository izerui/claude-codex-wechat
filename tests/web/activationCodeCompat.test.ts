/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';

import {
  decodeRelayAccessCode,
  decodeRelayActivationCode,
  signActivationBodyForTest,
  signRelayAccessCodeBodyForTest,
} from '../../src/web/activationCode';

describe('activationCode compatibility exports', () => {
  it('keeps legacy helpers wired to the access-code implementations', () => {
    expect(decodeRelayActivationCode).toBe(decodeRelayAccessCode);
    expect(signActivationBodyForTest).toBe(signRelayAccessCodeBodyForTest);
  });
});
