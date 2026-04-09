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

export async function startAudit(
    agentName: string,
    trigger: AuditTrigger,
    user?: UserContext | null,
    input?: unknown,
): Promise<string> {
    const id = randomUUID();
    startTimes.set(id, Date.now());
    await insertAuditEntry({
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

export async function finishAudit(id: string, output?: unknown): Promise<void> {
    const durationMs = Date.now() - (startTimes.get(id) ?? Date.now());
    startTimes.delete(id);
    await completeAuditEntry(id, durationMs, output ?? null);
}

export async function failAudit(id: string, error: unknown): Promise<void> {
    const durationMs = Date.now() - (startTimes.get(id) ?? Date.now());
    startTimes.delete(id);
    await failAuditEntry(id, durationMs, String(error));
}

export async function withAudit<T>(
    agentName: string,
    trigger: AuditTrigger,
    user: UserContext | null | undefined,
    fn: () => Promise<T>,
    options?: { input?: unknown; getOutput?: (result: T) => unknown },
): Promise<T> {
    const auditId = await startAudit(agentName, trigger, user, options?.input);
    try {
        const result = await fn();
        await finishAudit(auditId, options?.getOutput ? options.getOutput(result) : result ?? undefined);
        return result;
    } catch (err) {
        await failAudit(auditId, err);
        throw err;
    }
}
