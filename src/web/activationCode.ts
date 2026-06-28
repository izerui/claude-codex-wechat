// Compatibility re-export. New code should import from ./accessCode.
export {
  type AccessCodePayload,
  decodeRelayAccessCode,
  decodeRelayActivationCode,
  normalizeRelayAccessCodeError,
  RELAY_ACCESS_CODE_ERRORS,
  signActivationBodyForTest,
  signRelayAccessCodeBodyForTest,
  type ActivationPayload,
  type RelayAccessCodePayload,
} from './accessCode';
