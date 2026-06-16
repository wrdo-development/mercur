/**
 * Flow executor helpers — data extraction, edge traversal, condition evaluation.
 */

import type { FlowEdge, FlowNodeData } from './flow-engine.types';

/** Safely extract a string value from a dynamic FlowNodeData key */
export function str(data: FlowNodeData, key: string, fallback: string): string {
  // eslint-disable-next-line security/detect-object-injection
  const val = data[key];
  if (typeof val === 'string') {
    return val;
  }
  return fallback;
}

/** Safely extract a number value from a dynamic FlowNodeData key */
export function num(data: FlowNodeData, key: string, fallback: number): number {
  // eslint-disable-next-line security/detect-object-injection
  const val = data[key];
  if (typeof val === 'number') {
    return val;
  }
  return fallback;
}

/**
 * Find the next target node ID from the edge list.
 * Optionally matches a specific edge label (for interactive button responses).
 */
export function findNextNodeId(
  currentNodeId: string,
  edges: FlowEdge[],
  matchLabel?: string,
): string | null {
  const outgoing = edges.filter((e) => e.source === currentNodeId);
  if (outgoing.length === 0) {
    return null;
  }

  if (matchLabel !== undefined) {
    const matched = outgoing.find((e) => e.label === matchLabel);
    if (matched !== undefined) {
      return matched.target;
    }
  }

  return outgoing[0]?.target ?? null;
}

/**
 * Evaluate a condition node expression.
 */
/* eslint-disable complexity -- operator matrix is explicit by design */
export function evaluateCondition(
  value: unknown,
  operator: string,
  compareValue: unknown,
): boolean {
  switch (operator) {
    case 'exists':
      return value !== undefined && value !== null;
    case 'not_exists':
      return value === undefined || value === null;
    case 'eq':
      return value === compareValue;
    case 'neq':
      return value !== compareValue;
    case 'contains':
      return (
        typeof value === 'string' &&
        typeof compareValue === 'string' &&
        value.includes(compareValue)
      );
    case 'gt':
      return typeof value === 'number' && typeof compareValue === 'number' && value > compareValue;
    case 'lt':
      return typeof value === 'number' && typeof compareValue === 'number' && value < compareValue;
    default:
      return false;
  }
}
/* eslint-enable complexity */
