import type { PermissionChoice, PermissionRequest } from '../providers/types';

export type PermissionDecision = PermissionChoice;

export type StoredPermissionRequest = PermissionRequest & {
  status: 'pending' | 'decided';
  requestedAt: number;
  decidedAt?: number;
  decidedBy?: string;
  decision?: PermissionDecision;
};

export class PermissionRouter {
  private readonly requests = new Map<string, StoredPermissionRequest>();

  addRequest(request: PermissionRequest): StoredPermissionRequest {
    const stored: StoredPermissionRequest = {
      ...request,
      status: 'pending',
      requestedAt: Date.now(),
    };
    this.requests.set(request.id, stored);
    return stored;
  }

  getPendingRequests(): StoredPermissionRequest[] {
    return [...this.requests.values()].filter((request) => request.status === 'pending');
  }

  getRequest(requestId: string): StoredPermissionRequest | null {
    return this.requests.get(requestId) ?? null;
  }

  decide(input: { requestId: string; userId: string; decision: PermissionDecision }): { ok: true } | { ok: false; error: string } {
    const request = this.requests.get(input.requestId);
    if (!request) return { ok: false, error: 'permission_request_not_found' };
    if (request.status !== 'pending') return { ok: false, error: 'permission_request_already_decided' };
    if (!request.choices.includes(input.decision)) return { ok: false, error: 'permission_decision_not_allowed' };
    this.requests.set(input.requestId, {
      ...request,
      status: 'decided',
      decidedAt: Date.now(),
      decidedBy: input.userId,
      decision: input.decision,
    });
    return { ok: true };
  }
}
