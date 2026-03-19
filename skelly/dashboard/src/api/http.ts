import { config } from '../config';

const { apiBaseUrl } = config;

async function handleResponse<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
    });
    return handleResponse<T>(response);
}
