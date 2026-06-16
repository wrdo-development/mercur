/**
 * Type definitions for the Meta WhatsApp Flows Data Exchange protocol.
 *
 * Wire format reference:
 *   https://developers.facebook.com/docs/whatsapp/flows/reference/implementingyourflowendpoint
 *
 * Encryption contract (hard requirements, verified from Meta's reference):
 *   - AES-128-GCM, 16-byte IV, 16-byte authentication tag appended to ciphertext
 *   - RSA-2048-OAEP with SHA-256 hash and SHA-256 MGF1 for the AES key wrap
 *   - The response is encrypted with the SAME AES key and an IV that is the
 *     bitwise NOT of the request IV (never re-derive a fresh key/IV)
 *   - All transport fields are base64 strings
 */

/** Raw, on-the-wire payload that Meta sends to the data exchange endpoint. */
export interface MetaFlowEncryptedRequestBody {
  encrypted_aes_key: string;
  encrypted_flow_data: string;
  initial_vector: string;
}

/** The four canonical Meta-defined actions on the decrypted body. */
export type MetaFlowAction = 'INIT' | 'BACK' | 'data_exchange' | 'ping';

/**
 * Decrypted Meta payload. Only `action` and `version` are required by Meta;
 * the other fields are populated depending on which action fired.
 */
export interface MetaFlowDecryptedRequest {
  version: string;
  action: MetaFlowAction;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
}

/**
 * Result of decrypting an inbound payload — `aesKeyBuffer` and
 * `initialVectorBuffer` MUST be reused to encrypt the response.
 */
export interface MetaFlowDecryptResult {
  decryptedBody: MetaFlowDecryptedRequest;
  aesKeyBuffer: Buffer;
  initialVectorBuffer: Buffer;
}

/**
 * Cleartext shape of a Meta Flows response. The Meta runtime accepts either
 * `{ screen, data }` (for INIT / data_exchange / BACK) or `{ data }` (for ping
 * health checks and error acks). We model both via optional fields.
 */
export interface MetaFlowResponse {
  screen?: string;
  data?: Record<string, unknown>;
  version?: string;
}

/**
 * Meta-defined endpoint error codes. Returned as bare HTTP status (no body).
 *
 *   421 — Decryption failed (typically a stale private key)
 *   427 — Flow token is invalid / expired
 *   432 — Request signature mismatch (X-Hub-Signature-256 did not verify)
 *   500 — Generic server failure (fallback)
 *
 * @see https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes#endpoint_error_codes
 */
export const FLOW_DECRYPTION_FAILED = 421;
export const FLOW_TOKEN_INVALID = 427;
export const FLOW_SIGNATURE_MISMATCH = 432;
