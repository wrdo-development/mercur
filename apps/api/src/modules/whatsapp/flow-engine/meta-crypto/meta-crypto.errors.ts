/**
 * Error type for Meta Flow endpoint decryption / token failures.
 *
 * Carries the Meta-mandated HTTP status code so the route handler can return
 * the exact wire-protocol error code without leaking server detail.
 */

import { FLOW_DECRYPTION_FAILED } from './meta-crypto.types';

export class FlowEndpointError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'FlowEndpointError';
    this.statusCode = statusCode;
  }

  static decryptFailed(reason: string): FlowEndpointError {
    return new FlowEndpointError(
      FLOW_DECRYPTION_FAILED,
      `Failed to decrypt the Flows request: ${reason}`,
    );
  }
}
