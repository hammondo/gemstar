import { useState } from 'react';
import { streamSSEPostTest, streamSSETest } from '../api/appApi';

export default function SSETestPage() {
    const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
    const [messages, setMessages] = useState<string[]>([]);
    const [mode, setMode] = useState<'GET' | 'POST'>('GET');

    const startTest = () => {
        setStatus('running');
        setMessages(['Starting test...']);

        const callbacks = {
            onProgress: (data: { message: string; count: number }) => {
                setMessages((prev) => [...prev, `[PROGRESS] ${data.message}`]);
            },
            onComplete: () => {
                setMessages((prev) => [...prev, '[COMPLETE] Stream ended']);
                setStatus('complete');
            },
            onError: (err: string) => {
                setMessages((prev) => [...prev, `[ERROR] ${err}`]);
                setStatus('error');
            },
        };

        const stop = mode === 'GET' ? streamSSETest(callbacks) : streamSSEPostTest(5, callbacks);

        return stop;
    };

    return (
        <div className="p-6">
            <h1 className="mb-6 text-2xl font-bold">SSE Connection Test</h1>

            <div className="max-w-2xl rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="mb-6 flex gap-4">
                    <label className="flex cursor-pointer items-center gap-2">
                        <input type="radio" name="mode" checked={mode === 'GET'} onChange={() => setMode('GET')} />
                        Standard SSE (GET)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                        <input type="radio" name="mode" checked={mode === 'POST'} onChange={() => setMode('POST')} />
                        SSE via fetch-POST
                    </label>
                </div>

                <button
                    onClick={startTest}
                    disabled={status === 'running'}
                    className="rounded-lg bg-teal-500 px-6 py-2 font-semibold transition hover:bg-teal-400 disabled:bg-white/10"
                >
                    {status === 'running' ? 'Running...' : 'Start 5s Test'}
                </button>

                <div className="mt-6 h-64 overflow-y-auto rounded-lg border border-white/5 bg-black/40 p-4 font-mono text-sm">
                    {messages.length === 0 && <p className="/30 italic">No events yet</p>}
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`mb-1 ${
                                msg.includes('[COMPLETE]')
                                    ? 'font-bold text-teal-400'
                                    : msg.includes('[ERROR]')
                                      ? 'text-red-400'
                                      : '/80'
                            }`}
                        >
                            {msg}
                        </div>
                    ))}
                </div>

                {status === 'complete' && (
                    <p className="mt-4 text-sm font-semibold text-teal-400">
                        Success! "onComplete" was called and the connection closed.
                    </p>
                )}
            </div>

            <div className="/50 mt-8 max-w-2xl text-sm">
                <p>This page tests if the SSE implementation correctly handles the full lifecycle of a stream:</p>
                <ul className="mt-2 ml-5 list-disc space-y-1">
                    <li>Connects to server</li>
                    <li>Receives multiple progress events</li>
                    <li>Receives the final 'complete' event</li>
                    <li>Triggers the onComplete callback</li>
                    <li>Closes the connection correctly</li>
                </ul>
            </div>
        </div>
    );
}
