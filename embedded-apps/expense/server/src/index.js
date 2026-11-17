import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const PORT = process.env.PORT || 4102;
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000,http://localhost:8081')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: FRONTEND_ORIGINS, methods: ['GET', 'POST', 'OPTIONS'] }));
// Attachments reaching here have already gone through the frontend's own compression budget
// (~70KB/file), so 10mb is generous headroom, not a working limit.
app.use(express.json({ limit: '10mb' }));

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// Opt-in, free alternative to Claude for document extraction. Revert to Claude-only at any time
// by unsetting EXTRACTION_PROVIDER (or setting it to anything other than 'groq') and restarting -
// no code change needed. Only ever used for images (Groq's vision endpoint doesn't take PDFs);
// PDFs always go through Claude regardless of this setting. Any Groq failure (rate limit, bad
// JSON, network error) falls back to the same Claude call used today, so a request is never
// worse off than before this existed - just sometimes free instead of billed.
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const EXTRACTION_PROVIDER = process.env.EXTRACTION_PROVIDER || 'anthropic';
const GROQ_MODEL = 'qwen/qwen3.8-27b';

// Same opt-in/fallback pattern as Groq above, but calls a separate, self-hosted Ollama process
// on this same machine (pm2 name 'ollama-glm-service', running the quantized glm-ocr:q8_0 model -
// not this process) instead of an external API. Images only, same reasoning as Groq (untested on
// PDFs).
const GLM_SERVICE_URL = process.env.GLM_SERVICE_URL || 'http://127.0.0.1:4200';
const GLM_MODEL = 'glm-ocr:q8_0';

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    gstin: { anyOf: [{ type: 'string' }, { type: 'null' }], description: "The 15-character GSTIN printed on the document, if present. Null if none is visible." },
    hsnSac: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'The HSN or SAC code printed on the document, if present. Null if none is visible.' },
    totalAmount: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'The final total amount payable on the document, INCLUSIVE of any GST/tax. Null if no total amount is readable.' },
    // Non-CTC: Mobile Exp — the invoice's own printed date, used to auto-fill that month's Claim
    // Period instead of the employee typing it. Every other field/flow ignores this.
    invoiceDate: { anyOf: [{ type: 'string' }, { type: 'null' }], description: "The invoice/bill date printed on the document, in YYYY-MM-DD format. Null if no date is readable." },
  },
  required: ['gstin', 'hsnSac', 'totalAmount', 'invoiceDate'],
  additionalProperties: false,
};

const EXTRACTION_PROMPT = `This is a scanned expense receipt or invoice. Read it and extract exactly these four fields:
1. GSTIN - the vendor's 15-character GST registration number, if printed on the document.
2. HSN/SAC code - the HSN or SAC classification code for the goods/service billed, if printed.
3. Total amount - the final total amount payable, including any GST/tax (not the pre-tax subtotal).
4. Invoice date - the invoice/bill date printed on the document, in YYYY-MM-DD format.

If a field is not printed anywhere on the document, return null for it rather than guessing.`;

const JSON_EXTRACTION_PROMPT = `${EXTRACTION_PROMPT}

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"gstin": string or null, "hsnSac": string or null, "totalAmount": number or null, "invoiceDate": string or null}`;

async function extractWithClaude(mimeType, data, isImage) {
  const documentBlock = isImage
    ? { type: 'image', source: { type: 'base64', media_type: mimeType, data } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };

  const response = await anthropic.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [documentBlock, { type: 'text', text: EXTRACTION_PROMPT }],
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
    },
  });

  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new Error('claude_refusal_or_empty');
  }
  return response.parsed_output;
}

async function extractWithGroq(mimeType, data) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } },
            { type: 'text', text: JSON_EXTRACTION_PROMPT },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1024,
    }),
  });

  if (!res.ok) throw new Error(`groq_http_${res.status}`);
  const body = await res.json();
  const parsed = JSON.parse(body?.choices?.[0]?.message?.content || '');
  return {
    gstin: parsed.gstin ?? null,
    hsnSac: parsed.hsnSac ?? null,
    totalAmount: typeof parsed.totalAmount === 'number' ? parsed.totalAmount : null,
    invoiceDate: parsed.invoiceDate ?? null,
  };
}

// GLM/Ollama only accepts images, not raw PDF bytes - renders the PDF's first page (the only page
// a receipt/invoice ever needs) to a PNG via poppler's pdftoppm, already installed on this box,
// same way Claude's own 'document' content type isn't available here. Temp files are per-request
// (randomUUID) and always cleaned up, success or failure.
function pdfToImageBase64(pdfDataBase64) {
  const id = randomUUID();
  const pdfPath = join(tmpdir(), `${id}.pdf`);
  const imgPrefix = join(tmpdir(), id);
  const imgPath = `${imgPrefix}.png`;
  writeFileSync(pdfPath, Buffer.from(pdfDataBase64, 'base64'));
  try {
    execFileSync('pdftoppm', ['-png', '-f', '1', '-l', '1', '-singlefile', pdfPath, imgPrefix]);
    return readFileSync(imgPath).toString('base64');
  } finally {
    try { unlinkSync(pdfPath) } catch {}
    try { unlinkSync(imgPath) } catch {}
  }
}

// Small/dense text (GSTIN, HSN) gets misread when the source image's long edge is small - true on
// every provider tested, Claude included, not just the self-hosted model. Verified on a real
// 507x431 phone-photo receipt: GSTIN came back wrong at native size on both Claude and GLM, correct
// on both at 3x. Threshold picked with headroom above that case; images already this large (e.g. a
// proper scan) pass through untouched, since upscaling them further wouldn't add real detail and
// would only slow down inference for no benefit.
const MIN_LONG_EDGE = 1500;

async function upscaleIfSmall(imageBase64) {
  const buf = Buffer.from(imageBase64, 'base64');
  const meta = await sharp(buf).metadata();
  const longEdge = Math.max(meta.width || 0, meta.height || 0);
  if (!longEdge || longEdge >= MIN_LONG_EDGE) return imageBase64;

  const scale = MIN_LONG_EDGE / longEdge;
  const out = await sharp(buf)
    .resize(Math.round(meta.width * scale), Math.round(meta.height * scale), { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  return out.toString('base64');
}

async function extractWithGlm(mimeType, data) {
  const converted = mimeType === 'application/pdf' ? pdfToImageBase64(data) : data;
  const imageData = await upscaleIfSmall(converted);
  const res = await fetch(`${GLM_SERVICE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GLM_MODEL,
      prompt: JSON_EXTRACTION_PROMPT,
      images: [imageData],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`glm_http_${res.status}`);
  const body = await res.json();

  // Model wraps JSON in ```json ... ``` - strip that before parsing.
  let cleaned = (body.response || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.split('```')[1];
    if (cleaned.startsWith('json')) cleaned = cleaned.slice(4);
  }
  const parsed = JSON.parse(cleaned.trim());
  return {
    gstin: parsed.gstin ?? null,
    hsnSac: parsed.hsnSac ?? null,
    totalAmount: typeof parsed.totalAmount === 'number' ? parsed.totalAmount : null,
    invoiceDate: parsed.invoiceDate ?? null,
  };
}

app.post('/api/expense/extract-document', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'not_configured', message: 'Document extraction is not yet configured on this server.' });
  }

  const { mimeType, data } = req.body || {};
  if (!mimeType || !data) {
    return res.status(400).json({ error: 'invalid_request', message: 'mimeType and data are required.' });
  }

  // Only image and PDF documents are something Claude can actually read visually - xls/xlsx/csv/
  // txt attachments aren't receipts in a readable visual sense, so skip the API call entirely.
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  if (!isImage && !isPdf) {
    return res.json({ gstin: null, hsnSac: null, totalAmount: null, invoiceDate: null });
  }

  // Low-resolution photos (a phone camera shot, compressed by the frontend's upload budget) are
  // the single biggest driver of misread GSTIN/HSN - confirmed on every provider tested, Claude
  // included, not just the self-hosted model (see upscaleIfSmall's comment). Upscale once here so
  // every provider below gets the same, better input - PDFs are handled per-provider instead,
  // since Claude reads them natively at full resolution and GLM converts them to an image first.
  const processedData = isImage ? await upscaleIfSmall(data) : data;

  if (EXTRACTION_PROVIDER === 'groq' && GROQ_API_KEY && isImage) {
    try {
      return res.json(await extractWithGroq(mimeType, processedData));
    } catch (err) {
      console.error('[extract-document] Groq failed, falling back to Claude:', err.message);
    }
  }

  if (EXTRACTION_PROVIDER === 'glm') {
    try {
      return res.json(await extractWithGlm(mimeType, processedData));
    } catch (err) {
      console.error('[extract-document] GLM failed, falling back to Claude:', err.message);
    }
  }

  try {
    return res.json(await extractWithClaude(mimeType, processedData, isImage));
  } catch (err) {
    console.error('[extract-document] Failed:', err.message);
    return res.status(502).json({ error: 'extraction_failed', message: 'Could not read this document.' });
  }
});

app.get('/api/expense/health', (req, res) => {
  res.json({ ok: true, extractionConfigured: !!anthropic });
});

app.listen(PORT, () => {
  const provider =
    EXTRACTION_PROVIDER === 'groq' && GROQ_API_KEY ? 'groq (falls back to claude)' :
    EXTRACTION_PROVIDER === 'glm' ? 'glm (falls back to claude)' :
    'claude';
  console.log(`[expense-server] listening on port ${PORT} (extraction ${anthropic ? `enabled via ${provider}` : 'disabled - ANTHROPIC_API_KEY not set'})`);
});
