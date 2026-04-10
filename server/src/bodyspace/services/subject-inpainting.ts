// subject-inpainting.ts
// Places a user-supplied subject image verbatim into an AI-generated scene.
//
// Pipeline:
//   1. Background removal  — Replicate `lucataco/remove-bg` (rembg)
//   2. Mask + composite    — sharp: subject on neutral canvas + binary mask
//   3. Scene inpainting    — Replicate `black-forest-labs/flux-fill-dev`
//      • mask white  = generate background here
//      • mask black  = keep subject here (verbatim)
//
// Supports MOCK_IMAGE_GENERATION=true for dev / tests.

import { mkdirSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import sharp from 'sharp';
import { settings } from '../config.js';
import { fetchWithLogging } from '../utils/http.js';
import { getAgentLogger } from '../utils/logger.js';

const log = getAgentLogger('SubjectInpainting');

// ── Replicate model paths ─────────────────────────────────────────────────────

const REMBG_MODEL = 'lucataco/remove-bg';
const FLUX_FILL_MODEL = 'black-forest-labs/flux-fill-dev';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReplicatePrediction {
    id: string;
    status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    output?: string[] | string;
    error?: string;
    urls?: { get: string; cancel: string };
}

export type InpaintAspectRatio = '1:1' | '16:9' | '9:16' | '4:5';

export interface SubjectInpaintingOptions {
    /** Raw bytes of the uploaded subject image */
    subjectBuffer: Buffer;
    subjectMimeType: string;
    /** Natural-language scene description (what the background should look like) */
    sceneDescription: string;
    aspectRatio: InpaintAspectRatio;
    /** Optional style/context reference images (base64 data URLs or remote URLs) */
    referenceImageUrls?: string[];
}

export interface SubjectInpaintingResult {
    requestId: string;
    imageUrl: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function toDataUrl(buffer: Buffer, mimeType: string): string {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function getOutputDimensions(ratio: InpaintAspectRatio): { width: number; height: number } {
    switch (ratio) {
        case '9:16': return { width: 1080, height: 1920 };
        case '16:9': return { width: 1920, height: 1080 };
        case '4:5':  return { width: 1080, height: 1350 };
        case '1:1':
        default:     return { width: 1080, height: 1080 };
    }
}

// ── Replicate polling ─────────────────────────────────────────────────────────

async function pollUntilDone(prediction: ReplicatePrediction, token: string): Promise<ReplicatePrediction> {
    const getUrl = prediction.urls?.get;
    if (!getUrl) throw new Error('No polling URL in Replicate prediction response');

    for (let i = 0; i < 60; i++) {
        await sleep(2_000);
        const res = await fetchWithLogging(
            log,
            getUrl,
            { headers: { Authorization: `Bearer ${token}` } },
            { system: 'replicate', operation: 'poll_prediction' }
        );
        if (!res.ok) continue;
        const updated = (await res.json()) as ReplicatePrediction;
        if (['succeeded', 'failed', 'canceled'].includes(updated.status)) return updated;
    }
    throw new Error(`Replicate prediction ${prediction.id} timed out`);
}

async function downloadBuffer(url: string): Promise<Buffer> {
    const res = await fetchWithLogging(log, url, undefined, {
        system: 'replicate',
        operation: 'download_generated_image',
    });
    if (!res.ok) throw new Error(`Failed to download from Replicate: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

// ── Step 1: background removal ────────────────────────────────────────────────

async function removeBackground(buffer: Buffer, mimeType: string, token: string): Promise<Buffer> {
    log.info('Removing background with rembg');

    const res = await fetchWithLogging(
        log,
        `https://api.replicate.com/v1/models/${REMBG_MODEL}/predictions`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Prefer: 'wait=60',
            },
            body: JSON.stringify({ input: { image: toDataUrl(buffer, mimeType) } }),
        },
        { system: 'replicate', operation: 'remove_background' }
    );

    if (res.status === 429) throw new Error('Replicate rate limit during background removal');
    if (!res.ok) throw new Error(`rembg API ${res.status}: ${await res.text()}`);

    let pred = (await res.json()) as ReplicatePrediction;
    if (pred.status !== 'succeeded') pred = await pollUntilDone(pred, token);
    if (pred.status !== 'succeeded') throw new Error(`Background removal failed: ${pred.error ?? 'unknown'}`);

    // rembg returns a single URL string (not an array)
    const outputUrl = Array.isArray(pred.output) ? pred.output[0] : (pred.output as string);
    return downloadBuffer(outputUrl);
}

// ── Step 2: prepare canvas + mask ─────────────────────────────────────────────
//
// Subject (transparent PNG) is centred on the target canvas at ~70% of
// the shorter dimension, then:
//   • subjectOnCanvas  — RGB PNG (white fill behind subject)
//   • maskImage        — grayscale PNG (white = generate, black = keep)

interface PreparedImages {
    subjectOnCanvas: Buffer; // RGB PNG, white background
    maskImage: Buffer;       // Grayscale PNG, white = inpaint area
}

async function prepareImages(
    subjectPng: Buffer,
    width: number,
    height: number,
): Promise<PreparedImages> {
    // Resize subject to 70% of the shorter canvas dimension
    const maxDim = Math.round(Math.min(width, height) * 0.70);
    const resized = await sharp(subjectPng)
        .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();

    const { width: sw = maxDim, height: sh = maxDim } = await sharp(resized).metadata();
    const left = Math.round((width - sw) / 2);
    const top  = Math.round((height - sh) / 2);

    // ── Subject on white canvas ─────────────────────────────────────────────
    const subjectOnCanvas = await sharp({
        create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
        .png()
        .composite([{ input: resized, left, top }])
        .toBuffer();

    // ── Mask: extract alpha, binarise, invert, place on white canvas ─────────
    // sharp 0.33+ supports extractChannel by name or index (3 = alpha)
    const alphaGrey = await sharp(resized)
        .extractChannel(3)   // alpha channel → greyscale
        .threshold(128)      // binarise: 0 or 255
        .negate()            // invert: subject=255→0(black=keep), bg=0→255(white=fill)
        .toBuffer();

    // Place the subject-sized mask on a full-white canvas so borders = fill
    // channels must be 3 or 4; white RGB = inpaint everything by default
    const maskImage = await sharp({
        create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
        .png()
        .composite([{ input: alphaGrey, left, top }])
        .toBuffer();

    return { subjectOnCanvas, maskImage };
}

// ── Step 3: FLUX Fill inpainting ──────────────────────────────────────────────

async function runFluxFill(
    subjectOnCanvas: Buffer,
    maskImage: Buffer,
    prompt: string,
    token: string,
): Promise<Buffer> {
    log.info('Running FLUX Fill Dev inpainting');

    const res = await fetchWithLogging(
        log,
        `https://api.replicate.com/v1/models/${FLUX_FILL_MODEL}/predictions`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Prefer: 'wait=120',
            },
            body: JSON.stringify({
                input: {
                    image:          toDataUrl(subjectOnCanvas, 'image/png'),
                    mask:           toDataUrl(maskImage, 'image/png'),
                    prompt,
                    steps:          28,
                    guidance:       30,
                    output_format:  'webp',
                    output_quality: 90,
                },
            }),
        },
        { system: 'replicate', operation: 'flux_fill_inpainting' }
    );

    if (res.status === 429) throw new Error('Replicate rate limit during FLUX Fill inpainting');
    if (!res.ok) throw new Error(`FLUX Fill API ${res.status}: ${await res.text()}`);

    let pred = (await res.json()) as ReplicatePrediction;
    if (pred.status !== 'succeeded') pred = await pollUntilDone(pred, token);
    if (pred.status !== 'succeeded' || !pred.output?.length) {
        throw new Error(`FLUX Fill failed: ${pred.error ?? 'no output'}`);
    }

    const outputUrl = Array.isArray(pred.output) ? pred.output[0] : (pred.output as string);
    return downloadBuffer(outputUrl);
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runSubjectInpainting(
    options: SubjectInpaintingOptions,
): Promise<SubjectInpaintingResult> {
    const requestId = randomUUID();
    const { subjectBuffer, subjectMimeType, sceneDescription, aspectRatio, referenceImageUrls } = options;

    // ── Mock mode ───────────────────────────────────────────────────────────
    if (settings.mockImageGeneration) {
        log.info({ requestId }, 'Mock mode — returning placeholder');
        return {
            requestId,
            imageUrl: `${settings.apiBaseUrl}/api/bodyspace/inpainting/results/mock-${requestId}.webp`,
        };
    }

    const token = settings.replicateApiToken;
    if (!token) throw new Error('REPLICATE_API_TOKEN is required for subject inpainting');

    log.info({ requestId, aspectRatio }, 'Starting subject inpainting pipeline');

    // Step 1 — remove background
    const subjectPng = await removeBackground(subjectBuffer, subjectMimeType, token);

    // Step 2 — build canvas + mask
    const { width, height } = getOutputDimensions(aspectRatio);
    const { subjectOnCanvas, maskImage } = await prepareImages(subjectPng, width, height);

    // Step 3 — build prompt (include reference context if provided)
    const refNote = referenceImageUrls?.length
        ? `Scene style references provided. `
        : '';
    const prompt = `${refNote}${sceneDescription}. High-quality photography, natural lighting, realistic environment, professional composition, no text overlays.`;

    // Step 4 — FLUX Fill inpainting
    const resultBuffer = await runFluxFill(subjectOnCanvas, maskImage, prompt, token);

    // Step 5 — save locally
    const outputDir = resolve(settings.dataDir, 'inpainting');
    mkdirSync(outputDir, { recursive: true });
    const filename = `${requestId}.webp`;
    writeFileSync(resolve(outputDir, filename), resultBuffer);

    const imageUrl = `${settings.apiBaseUrl}/api/bodyspace/inpainting/results/${filename}`;
    log.info({ requestId, imageUrl }, 'Subject inpainting complete');

    return { requestId, imageUrl };
}
