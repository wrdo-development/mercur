/**
 * Meta WhatsApp Flows encryption — TypeScript port of Meta's reference.
 *
 * Original source (MIT licensed):
 *   https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/examples/endpoint/nodejs/basic/src/encryption.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Port notes:
 *   - Strict TypeScript, named exports, explicit return types.
 *   - Errors are thrown as FlowEndpointError so the route handler can map them
 *     to the Meta-mandated HTTP status codes (421 / 427 / 432) directly.
 *   - The bitwise NOT of the request IV is computed via Buffer.map() so it
 *     stays allocation-cheap and lint-safe (no per-index assertions).
 *
 * Crypto contract (NON-NEGOTIABLE):
 *   - AES-128-GCM with a 16-byte IV and a 16-byte auth tag appended to the
 *     ciphertext (NOT concatenated with the IV).
 *   - RSA-2048 OAEP with SHA-256 hash and SHA-256 MGF1.
 *   - Response IV = bitwise NOT of request IV; same AES key. Never re-derive.
 */

import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  constants as cryptoConstants,
  privateDecrypt,
} from 'node:crypto';
import { FlowEndpointError } from './meta-crypto.errors';
import type {
  MetaFlowDecryptedRequest,
  MetaFlowDecryptResult,
  MetaFlowEncryptedRequestBody,
  MetaFlowResponse,
} from './meta-crypto.types';

/** AES-GCM auth-tag length per Meta's contract (16 bytes / 128 bits). */
const TAG_LENGTH = 16;

/** AES key length wrapped by RSA-OAEP per Meta's contract (16 bytes / 128 bits). */
const AES_KEY_LENGTH = 16;

/** AES IV length per Meta's contract (16 bytes / 128 bits). */
const IV_LENGTH = 16;

/**
 * Decrypt an inbound Flow Data Exchange payload.
 *
 * Throws {@link FlowEndpointError} with `statusCode = 421` on any failure;
 * the caller MUST surface this as bare HTTP 421 (no body) so Meta refreshes
 * the public key on its side.
 */
export function decryptRequest(
  body: MetaFlowEncryptedRequestBody,
  privatePem: string,
  passphrase: string,
): MetaFlowDecryptResult {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;

  if (
    typeof encrypted_aes_key !== 'string' ||
    typeof encrypted_flow_data !== 'string' ||
    typeof initial_vector !== 'string'
  ) {
    throw FlowEndpointError.decryptFailed('missing required encrypted fields');
  }

  let aesKeyBuffer: Buffer;
  try {
    const privateKey = createPrivateKey({ key: privatePem, passphrase });
    aesKeyBuffer = privateDecrypt(
      {
        key: privateKey,
        padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encrypted_aes_key, 'base64'),
    );
  } catch (err) {
    throw FlowEndpointError.decryptFailed(
      `RSA unwrap failed: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }

  if (aesKeyBuffer.length !== AES_KEY_LENGTH) {
    throw FlowEndpointError.decryptFailed(
      `AES key length ${String(aesKeyBuffer.length)} is not ${String(AES_KEY_LENGTH)}`,
    );
  }

  const initialVectorBuffer = Buffer.from(initial_vector, 'base64');
  if (initialVectorBuffer.length !== IV_LENGTH) {
    throw FlowEndpointError.decryptFailed(
      `IV length ${String(initialVectorBuffer.length)} is not ${String(IV_LENGTH)}`,
    );
  }

  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  if (flowDataBuffer.length <= TAG_LENGTH) {
    throw FlowEndpointError.decryptFailed('encrypted flow data shorter than auth tag');
  }
  const ciphertext = flowDataBuffer.subarray(0, flowDataBuffer.length - TAG_LENGTH);
  const authTag = flowDataBuffer.subarray(flowDataBuffer.length - TAG_LENGTH);

  let plaintext: string;
  try {
    const decipher = createDecipheriv('aes-128-gcm', aesKeyBuffer, initialVectorBuffer);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
  } catch (err) {
    throw FlowEndpointError.decryptFailed(
      `AES-GCM decrypt failed: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }

  let parsed: MetaFlowDecryptedRequest;
  try {
    parsed = JSON.parse(plaintext) as MetaFlowDecryptedRequest;
  } catch (err) {
    throw FlowEndpointError.decryptFailed(
      `plaintext is not valid JSON: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }

  return {
    decryptedBody: parsed,
    aesKeyBuffer,
    initialVectorBuffer,
  };
}

/**
 * Encrypt the cleartext Flow response.
 *
 * Reuses the AES key from the request and uses an IV equal to the bitwise NOT
 * of the request IV. The return value is a base64 string of `ciphertext ||
 * authTag` — i.e. the auth tag is appended directly to the ciphertext per
 * Meta's wire format.
 */
export function encryptResponse(
  response: MetaFlowResponse,
  aesKeyBuffer: Buffer,
  initialVectorBuffer: Buffer,
): string {
  const flippedIv = flipIv(initialVectorBuffer);
  const cipher = createCipheriv('aes-128-gcm', aesKeyBuffer, flippedIv);
  const cipherText = Buffer.concat([
    cipher.update(JSON.stringify(response), 'utf-8'),
    cipher.final(),
  ]);
  return Buffer.concat([cipherText, cipher.getAuthTag()]).toString('base64');
}

/**
 * Compute the response IV as the bitwise NOT of every byte of the request IV.
 *
 * Exported for testability — IV-flipping is a contract requirement of the Meta
 * protocol and is a frequent source of integration bugs.
 */
export function flipIv(iv: Buffer): Buffer {
  return Buffer.from(iv.map((byte) => ~byte & 0xff));
}
