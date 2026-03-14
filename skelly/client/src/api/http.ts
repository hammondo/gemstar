const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

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
    const response = await fetch(`${API_BASE_URL}${path}`);
    return handleResponse<T>(response);
}

export async function postJson<T>(path: string, body: unknown = {}): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    return handleResponse<T>(response);
}

export interface SSECallbacks<T> {
    onProgress?: (data: T) => void;
    onComplete?: () => void;
    onError?: (error: string) => void;
}

export function streamSSE<T>(path: string, callbacks: SSECallbacks<T>): () => void {
    const source = new EventSource(`${API_BASE_URL}${path}`);

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
