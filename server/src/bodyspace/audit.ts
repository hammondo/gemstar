import { randomUUID } from 'crypto';
import { completeAuditEntry, failAuditEntry, insertAuditEntry } from './db.js';

export type AuditTrigger = 'cron' | 'api' | 'background';

export interface UserContext {
    id: string;
    name: string;
    email: string;
}

// Track start times in memory so duration_ms is accurate
const startTimes = new Map<string, number>();

export function startAudit(
    agentName: string,
    trigger: AuditTrigger,
    user?: UserContext | null,
    input?: unknown,
): string {
    const id = randomUUID();
    startTimes.set(id, Date.now());
    insertAuditEntry({
        id,
        agentName,
        trigger,
        userId: user?.id ?? null,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
        startedAt: new Date().toISOString(),
        input,
    });
    return id;
}

export function finishAudit(id: string, output?: unknown): void {
    const durationMs = Date.now() - (startTimes.get(id) ?? Date.now());
    startTimes.delete(id);
    completeAuditEntry(id, durationMs, output ?? null);
}

export function failAudit(id: string, error: unknown): void {
    const durationMs = Date.now() - (startTimes.get(id) ?? Date.now());
    startTimes.delete(id);
    failAuditEntry(id, durationMs, String(error));
}

export async function withAudit<T>(
    agentName: string,
    trigger: AuditTrigger,
    user: UserContext | null | undefined,
    fn: () => Promise<T>,
    options?: { input?: unknown; getOutput?: (result: T) => unknown },
): Promise<T> {
    const auditId = startAudit(agentName, trigger, user, options?.input);
    try {
        const result = await fn();
        finishAudit(auditId, options?.getOutput ? options.getOutput(result) : result ?? undefined);
        return result;
    } catch (err) {
        failAudit(auditId, err);
        throw err;
    }
}
