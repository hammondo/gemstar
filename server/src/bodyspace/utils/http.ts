import type pino from 'pino';
import { withBestEffortAudit } from '../audit.js';

interface OutboundMeta {
    system: string;
    operation: string;
    postId?: string;
    campaignId?: string;
}

function getBodyBytes(body: BodyInit | null | undefined): number | undefined {
    if (!body) return undefined;
    if (typeof body === 'string') return Buffer.byteLength(body);
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (ArrayBuffer.isView(body)) return body.byteLength;
    return undefined;
}

export async function fetchWithLogging(
    log: pino.Logger,
    url: string,
    init: RequestInit | undefined,
    meta: OutboundMeta
): Promise<Response> {
    const method = init?.method ?? 'GET';
    return withBestEffortAudit(
        {
            agentName: `outbound:${meta.system}`,
            trigger: 'system',
            input: {
                ...meta,
                method,
                url,
                hasBody: Boolean(init?.body),
                bodyBytes: getBodyBytes(init?.body as BodyInit | null | undefined),
            },
            getOutput: (response) => ({
                ...meta,
                method,
                url,
                status: response.status,
                ok: response.ok,
            }),
        },
        async () => {
            const startedAt = Date.now();

            log.info(
                {
                    event: 'outbound.request',
                    ...meta,
                    method,
                    url,
                    hasBody: Boolean(init?.body),
                    bodyBytes: getBodyBytes(init?.body as BodyInit | null | undefined),
                },
                'Outbound request started'
            );

            try {
                const response = await fetch(url, init);
                const durationMs = Date.now() - startedAt;

                const level = response.ok ? 'info' : 'warn';
                log[level](
                    {
                        event: 'outbound.response',
                        ...meta,
                        method,
                        url,
                        status: response.status,
                        ok: response.ok,
                        durationMs,
                        contentType: response.headers.get('content-type') ?? undefined,
                        contentLength: response.headers.get('content-length') ?? undefined,
                    },
                    'Outbound response received'
                );

                return response;
            } catch (error) {
                log.error(
                    {
                        event: 'outbound.error',
                        ...meta,
                        method,
                        url,
                        durationMs: Date.now() - startedAt,
                        error: String(error),
                    },
                    'Outbound request failed'
                );
                throw error;
            }
        }
    );
}
