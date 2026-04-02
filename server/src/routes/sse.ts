// routes/sse.ts — Shared Server-Sent Events helper
//
// Sets up an SSE response and returns a `send` helper + teardown.
// Sends `: ping` comments every 25s so proxies don't close idle connections.

import type { IncomingMessage, ServerResponse } from 'node:http';

export function setupSSE(req: IncomingMessage, res: ServerResponse) {
    req.setTimeout(0);
    res.socket?.setTimeout(0);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    let closed = false;
    const keepalive = setInterval(() => { if (!closed) res.write(': ping\n\n'); }, 25_000);

    req.on('close', () => { closed = true; clearInterval(keepalive); });

    const send = (event: string, data: unknown) => {
        if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const done = () => { clearInterval(keepalive); if (!closed) res.end(); };

    return { send, done, isClosed: () => closed };
}
