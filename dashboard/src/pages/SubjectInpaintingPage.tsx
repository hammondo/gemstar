// SubjectInpaintingPage.tsx
// Tool for placing a subject image verbatim into an AI-generated scene.
//
// Pipeline (server-side):
//   1. rembg  — removes background from subject
//   2. FLUX Fill Dev — inpaints the scene description around the subject

import { useRef, useState } from 'react';
import { type InpaintAspectRatio, generateSubjectInpainting } from '../api/appApi';
import PageHeader from '../components/PageHeader';

const ASPECT_RATIOS: { value: InpaintAspectRatio; label: string; hint: string }[] = [
    { value: '1:1',  label: 'Square',   hint: '1080 × 1080 — Instagram feed' },
    { value: '4:5',  label: 'Portrait', hint: '1080 × 1350 — Instagram portrait' },
    { value: '9:16', label: 'Story',    hint: '1080 × 1920 — Stories / Reels' },
    { value: '16:9', label: 'Wide',     hint: '1920 × 1080 — Facebook feed' },
];

type Stage = 'idle' | 'generating' | 'done' | 'error';

export default function SubjectInpaintingPage() {
    // ── Subject image ────────────────────────────────────────────────────────
    const [subjectFile, setSubjectFile] = useState<File | null>(null);
    const [subjectPreview, setSubjectPreview] = useState<string | null>(null);
    const subjectInputRef = useRef<HTMLInputElement>(null);

    // ── Reference images ─────────────────────────────────────────────────────
    const [refFiles, setRefFiles] = useState<File[]>([]);
    const refInputRef = useRef<HTMLInputElement>(null);

    // ── Scene description ────────────────────────────────────────────────────
    const [sceneDescription, setSceneDescription] = useState('');

    // ── Output options ───────────────────────────────────────────────────────
    const [aspectRatio, setAspectRatio] = useState<InpaintAspectRatio>('1:1');

    // ── State ────────────────────────────────────────────────────────────────
    const [stage, setStage] = useState<Stage>('idle');
    const [error, setError] = useState<string | null>(null);
    const [resultUrl, setResultUrl] = useState<string | null>(null);

    // ── Handlers ─────────────────────────────────────────────────────────────

    function handleSubjectChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setSubjectFile(file);
        if (file) {
            const url = URL.createObjectURL(file);
            setSubjectPreview(url);
        } else {
            setSubjectPreview(null);
        }
        // Reset result when subject changes
        setResultUrl(null);
        setStage('idle');
        setError(null);
    }

    function handleRemoveSubject() {
        setSubjectFile(null);
        setSubjectPreview(null);
        if (subjectInputRef.current) subjectInputRef.current.value = '';
        setResultUrl(null);
        setStage('idle');
        setError(null);
    }

    function handleRefChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        setRefFiles((prev) => [...prev, ...files].slice(0, 5));
        if (refInputRef.current) refInputRef.current.value = '';
    }

    function removeRef(index: number) {
        setRefFiles((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleGenerate() {
        if (!subjectFile) return;
        if (!sceneDescription.trim()) {
            setError('Please describe the scene you want the subject placed in.');
            return;
        }

        setStage('generating');
        setError(null);
        setResultUrl(null);

        try {
            const result = await generateSubjectInpainting({
                subjectImage: subjectFile,
                sceneDescription: sceneDescription.trim(),
                aspectRatio,
                referenceImages: refFiles.length ? refFiles : undefined,
            });
            setResultUrl(result.imageUrl);
            setStage('done');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Generation failed');
            setStage('error');
        }
    }

    function handleDownload() {
        if (!resultUrl) return;
        const a = document.createElement('a');
        a.href = resultUrl;
        a.download = 'inpainting-result.webp';
        a.click();
    }

    const canGenerate = !!subjectFile && sceneDescription.trim().length > 0 && stage !== 'generating';

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            <PageHeader title="Subject Inpainting" />

            <div className="mx-auto max-w-4xl space-y-6">
                {/* ── Explainer ── */}
                <p className="text-sm text-muted">
                    Upload a subject photo, describe the scene, and the AI will place your subject
                    verbatim into a freshly generated background.
                    <br />
                    <span className="text-xs text-muted/70">
                        Pipeline: background removal (rembg) → scene inpainting (FLUX Fill Dev)
                    </span>
                </p>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* ── Left column: inputs ── */}
                    <div className="space-y-5">

                        {/* Subject image */}
                        <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                                Subject image <span className="text-red-400">*</span>
                            </p>

                            {subjectPreview ? (
                                <div className="relative mb-3">
                                    <img
                                        src={subjectPreview}
                                        alt="Subject preview"
                                        className="w-full rounded-xl border border-warm-200 object-contain"
                                        style={{ maxHeight: '280px' }}
                                    />
                                    <button
                                        onClick={handleRemoveSubject}
                                        className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-black/70"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ) : (
                                <label className="mb-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-warm-200 bg-warm-50 py-10 transition hover:border-teal-400 hover:bg-teal-50/30">
                                    <svg
                                        className="h-8 w-8 text-warm-300"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={1.5}
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                                        />
                                    </svg>
                                    <span className="text-xs text-muted">Click to upload subject photo</span>
                                    <input
                                        ref={subjectInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={handleSubjectChange}
                                    />
                                </label>
                            )}

                            <p className="text-[10px] text-muted">
                                The subject will be extracted (background removed) and placed into the generated scene.
                            </p>
                        </div>

                        {/* Scene description */}
                        <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                                Scene description <span className="text-red-400">*</span>
                            </p>
                            <textarea
                                value={sceneDescription}
                                onChange={(e) => setSceneDescription(e.target.value)}
                                placeholder="e.g. Serene forest clearing at golden hour, soft dappled light, wildflowers in the foreground, misty mountains in the background…"
                                rows={5}
                                className="w-full resize-none rounded-xl border border-warm-200 bg-warm-100 px-3 py-2.5 text-xs text-charcoal placeholder:text-muted focus:border-teal-400 focus:outline-none"
                            />
                            <p className="mt-1 text-[10px] text-muted">
                                Describe what you want behind the subject. Be specific about lighting, setting, and mood.
                            </p>
                        </div>

                        {/* Output format */}
                        <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                                Output format
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {ASPECT_RATIOS.map(({ value, label, hint }) => (
                                    <button
                                        key={value}
                                        onClick={() => setAspectRatio(value)}
                                        className={`rounded-xl border px-3 py-2.5 text-left transition ${
                                            aspectRatio === value
                                                ? 'border-teal-400 bg-teal-400/10 text-teal-700'
                                                : 'border-warm-200 bg-warm-50 text-charcoal hover:border-teal-300'
                                        }`}
                                    >
                                        <p className="text-xs font-semibold">{label}</p>
                                        <p className="text-[10px] text-muted">{hint}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Reference images (optional) */}
                        <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                                Style references <span className="text-[10px] font-normal normal-case text-muted/70">(optional, up to 5)</span>
                            </p>
                            <p className="mb-3 text-[10px] text-muted">
                                Extra images to guide the mood or style of the generated scene.
                            </p>

                            {refFiles.length > 0 && (
                                <div className="mb-3 flex flex-wrap gap-2">
                                    {refFiles.map((f, i) => (
                                        <div key={i} className="flex items-center gap-1.5 rounded-lg border border-warm-200 bg-warm-50 pl-2.5 pr-1 py-1">
                                            <span className="max-w-[120px] truncate text-[10px] text-charcoal">{f.name}</span>
                                            <button
                                                onClick={() => removeRef(i)}
                                                className="rounded p-0.5 text-muted hover:text-red-500"
                                            >
                                                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {refFiles.length < 5 && (
                                <label className="cursor-pointer rounded-lg border border-warm-200 bg-warm-50 px-3 py-1.5 text-xs font-medium text-charcoal transition hover:bg-warm-100">
                                    Add reference image
                                    <input
                                        ref={refInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="sr-only"
                                        onChange={handleRefChange}
                                    />
                                </label>
                            )}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                                {error}
                            </div>
                        )}

                        {/* Generate button */}
                        <button
                            onClick={() => void handleGenerate()}
                            disabled={!canGenerate}
                            className="w-full rounded-xl bg-teal-400 px-4 py-3 text-sm font-semibold text-charcoal transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {stage === 'generating' ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-charcoal border-t-transparent" />
                                    Generating… (this takes 30–90 s)
                                </span>
                            ) : (
                                'Generate scene'
                            )}
                        </button>
                    </div>

                    {/* ── Right column: result ── */}
                    <div className="flex flex-col gap-5">
                        <div className="flex-1 rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Result</p>

                            {stage === 'generating' && (
                                <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted">
                                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                                    <p className="text-xs">Running pipeline…</p>
                                    <ol className="mt-1 space-y-1 text-[10px] text-muted/70">
                                        <li>1. Removing background (rembg)</li>
                                        <li>2. Building subject mask</li>
                                        <li>3. Inpainting scene (FLUX Fill Dev)</li>
                                    </ol>
                                </div>
                            )}

                            {stage === 'done' && resultUrl && (
                                <div className="space-y-3">
                                    <img
                                        src={resultUrl}
                                        alt="Inpainting result"
                                        className="w-full rounded-xl border border-warm-200 object-contain"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleDownload}
                                            className="flex-1 rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 text-xs font-semibold text-charcoal transition hover:bg-warm-100"
                                        >
                                            Download
                                        </button>
                                        <button
                                            onClick={() => void handleGenerate()}
                                            disabled={!canGenerate}
                                            className="flex-1 rounded-lg border border-teal-400 bg-teal-400/10 px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-400/20 disabled:opacity-40"
                                        >
                                            Regenerate
                                        </button>
                                    </div>
                                </div>
                            )}

                            {(stage === 'idle' || stage === 'error') && !resultUrl && (
                                <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted">
                                    <svg
                                        className="h-10 w-10 text-warm-200"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={1}
                                        viewBox="0 0 24 24"
                                    >
                                        <rect x="3" y="3" width="18" height="18" rx="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <polyline points="21 15 16 10 5 21" />
                                    </svg>
                                    <p className="text-xs">Result will appear here</p>
                                </div>
                            )}
                        </div>

                        {/* Tips */}
                        <div className="rounded-2xl border border-warm-200 bg-warm-50 p-4">
                            <p className="mb-2 text-xs font-semibold text-muted">Tips for best results</p>
                            <ul className="space-y-1 text-[11px] text-muted">
                                <li>• Use a photo with a clearly separated subject (person, product, object)</li>
                                <li>• Good front-lighting on the subject makes compositing more natural</li>
                                <li>• Describe lighting in the scene to match your subject (e.g. "soft afternoon sun")</li>
                                <li>• FLUX Fill may subtly blend subject edges — this is intentional for realism</li>
                                <li>• Try multiple runs; results vary with each generation</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
