import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

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

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    gstin: { anyOf: [{ type: 'string' }, { type: 'null' }], description: "The 15-character GSTIN printed on the document, if present. Null if none is visible." },
    hsnSac: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'The HSN or SAC code printed on the document, if present. Null if none is visible.' },
    totalAmount: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'The final total amount payable on the document, INCLUSIVE of any GST/tax. Null if no total amount is readable.' },
  },
  required: ['gstin', 'hsnSac', 'totalAmount'],
  additionalProperties: false,
};

const EXTRACTION_PROMPT = `This is a scanned expense receipt or invoice. Read it and extract exactly these three fields:
1. GSTIN - the vendor's 15-character GST registration number, if printed on the document.
2. HSN/SAC code - the HSN or SAC classification code for the goods/service billed, if printed.
3. Total amount - the final total amount payable, including any GST/tax (not the pre-tax subtotal).

If a field is not printed anywhere on the document, return null for it rather than guessing.`;

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
    return res.json({ gstin: null, hsnSac: null, totalAmount: null });
  }

  try {
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
      return res.status(502).json({ error: 'extraction_failed', message: 'Could not read this document.' });
    }

    return res.json(response.parsed_output);
  } catch (err) {
    console.error('[extract-document] Failed:', err.message);
    return res.status(502).json({ error: 'extraction_failed', message: 'Could not read this document.' });
  }
});

app.get('/api/expense/health', (req, res) => {
  res.json({ ok: true, extractionConfigured: !!anthropic });
});

app.listen(PORT, () => {
  console.log(`[expense-server] listening on port ${PORT} (extraction ${anthropic ? 'enabled' : 'disabled - ANTHROPIC_API_KEY not set'})`);
});
