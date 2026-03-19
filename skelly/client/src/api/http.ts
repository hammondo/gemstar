import { config } from '../config';

const { apiBaseUrl } = config;

async function handleResponse<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
    };

    if (!response.ok) {
        throw new Error(payload.error ?? `Request failed with status ${response.status}`);
    }

    return payload as T;
}

export async function fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, { credentials: 'include' });
    return handleResponse<T>(response);
}

export async function postJson<T>(path: string, body: unknown = {}): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
    });

    return handleResponse<T>(response);
}

export async function postFormBody<T>(path: string, body: FormData): Promise<T> {
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

export function streamSSE<T>(path: string, callbacks: SSECallbacks<T>): () => void {
    const source = new EventSource(`${apiBaseUrl}${path}`);

    source.addEventListener('progress', (event) => {
        const data = JSON.parse(event.data) as T;
        callbacks.onProgress?.(data);
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
