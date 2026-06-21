import type { PermissionChoice, PermissionRequest } from '../providers/types';

export type PermissionDecision = PermissionChoice;

export type StoredPermissionRequest = PermissionRequest & {
  status: 'pending' | 'decided';
  requestedAt: number;
  userId?: string;
  decision?: PermissionDecision;
};

// Compatibility-only shim: the bridge no longer surfaces permission approval
// flows to WeChat, but some older tests and construction paths still instantiate
// this router. Keep it inert and local so those paths compile without reviving
// the removed product behavior.
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
    request.status = 'decided';
    request.userId = input.userId;
    request.decision = input.decision;
    return { ok: true };
  }
}
