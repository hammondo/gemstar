import createClient from 'openapi-fetch';
import { config } from '../config';
import type { paths } from './schema.d.ts';

export const client = createClient<paths>({ baseUrl: config.apiBaseUrl });

// Forward session cookie on every request
client.use({
    onRequest({ request }) {
        return new Request(request, { credentials: 'include' });
    },
    onResponse({ response }) {
        if (response.status === 401) {
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
        return response;
    },
});
