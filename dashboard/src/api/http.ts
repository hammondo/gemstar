import { config } from '../config';

const { apiBaseUrl } = config;

async function handleResponse<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
        if (response.status === 401) {
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
        throw new Error(payload.error ?? `Request failed with status ${response.status}`);
    }
    return payload as T;
}

export async function fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, { credentials: 'include' });
    return handleResponse<T>(response);
}

export async function patchJson<T>(path: string, body: unknown = {}): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
}

export async function postJson<T>(path: string, body: unknown = {}): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
}

export async function putJson<T>(path: string, body: unknown = {}): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
}

export async function postForm<T>(path: string, body: FormData): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        credentials: 'include',
        body,
    });
    return handleResponse<T>(response);
}

export interface SSECallbacks<T> {
    onProgress?: (data: T) => void;
    onComplete?: () => void;
    onError?: (error: string) => void;
}

/** SSE stream initiated via POST (allows sending a body, unlike EventSource). */
export function streamSSEPost<T>(path: string, body: unknown, callbacks: SSECallbacks<T>): () => void {
    const controller = new AbortController();
    let completed = false;

    const run = async () => {
        const res = await fetch(`${apiBaseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok || !res.body) {
            const payload = (await res.json().catch(() => ({}))) as { error?: string };
            callbacks.onError?.(payload.error ?? `HTTP ${res.status}`);
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const messages = buffer.split('\n\n');
            // The last part might be an incomplete message, keep it in the buffer
            buffer = messages.pop() ?? '';

            for (const msg of messages) {
                if (!msg.trim()) continue;

                let eventType = '';
                let data = '';
                for (const line of msg.split('\n')) {
                    if (line.startsWith('event: ')) eventType = line.slice(7).trim();
                    else if (line.startsWith('data: ')) {
                        const content = line.slice(6).trim();
                        if (content) data = content;
                    }
                }

                if (eventType === 'progress' && data) {
                    try {
                        callbacks.onProgress?.(JSON.parse(data) as T);
                    } catch (e) {
                        console.error('Failed to parse SSE progress data:', data, e);
                    }
                } else if (eventType === 'complete') {
                    completed = true;
                    callbacks.onComplete?.();
                } else if (eventType === 'error' && data) {
                    try {
                        const parsed = JSON.parse(data) as { message?: string };
                        callbacks.onError?.(parsed.message ?? 'Unknown error');
                    } catch (e) {
                        callbacks.onError?.(data);
                    }
                }
            }
        }

        if (!completed) callbacks.onComplete?.();
    };

    void run().catch((err: unknown) => {
        if ((err as Error)?.name !== 'AbortError') {
            callbacks.onError?.((err as Error)?.message ?? 'Connection failed');
        }
    });

    return () => controller.abort();
}

export function streamSSE<T>(path: string, callbacks: SSECallbacks<T>): () => void {
    const source = new EventSource(`${apiBaseUrl}${path}`, { withCredentials: true });

    source.addEventListener('progress', (event) => {
        callbacks.onProgress?.(JSON.parse((event as MessageEvent).data) as T);
    });

    source.addEventListener('complete', () => {
        source.close();
        callbacks.onComplete?.();
    });

    source.addEventListener('error', (event) => {
        if (event instanceof MessageEvent) {
            const data = JSON.parse(event.data) as { message: string };
            callbacks.onError?.(data.message);
        } else {
            callbacks.onError?.('Connection lost');
        }
        source.close();
    });

    return () => source.close();
}
