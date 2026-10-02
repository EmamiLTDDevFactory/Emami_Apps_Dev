import 'dotenv/config' // first, so the SAP/store settings below see .env
import express from 'express'
import cors from 'cors'
import { engine, viewFor, ready, syncNow, isLoaded } from './store.js'
import { MATERIAL_TYPES } from './engine.js'
import { getSap, sapMode, storeMode } from './sap/index.js'
import { ALLOW_DEMO_LOGIN, issueSession, loginWithHubToken, requireAdmin, requireSession } from './auth.js'

// Rate Auction API: the live reverse auction (bid rules, anonymity masking, timer, simulated bidders
// in demo mode) runs inside THIS process - see store.js. Run exactly one instance per environment
// (PM2 fork mode, never cluster): a second instance would hold a second, different auction.
const app = express()

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error(`Origin ${origin} not allowed by CORS`))),
}))
app.use(express.json())

const api = express.Router()

api.get('/health', (_req, res) => res.json({ ok: true, sapMode: sapMode(), storeMode: storeMode() }))

// ---- sign-in -------------------------------------------------------------------------------------
api.post('/auth/hub-login', async (req, res) => {
  try {
    const { email, role, token } = await loginWithHubToken(req.body?.hubToken, req)
    res.json({ ok: true, email, role, token })
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message })
  }
})

// Standalone/local only (ALLOW_DEMO_LOGIN=true): sign in as any email with either role.
api.post('/auth/demo-login', (req, res) => {
  if (!ALLOW_DEMO_LOGIN) return res.status(404).json({ ok: false, error: 'Not found' })
  const role = req.body?.role === 'admin' ? 'admin' : 'vendor'
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email) return res.status(400).json({ ok: false, error: 'email is required' })
  res.json({ ok: true, email, role, token: issueSession(email, role) })
})

api.get('/auth/demo-enabled', (_req, res) => res.json({ enabled: ALLOW_DEMO_LOGIN }))

// ---- live view -----------------------------------------------------------------------------------
// Server-sent events: each connection gets a payload built for its own role and identity.
api.get('/stream', requireSession, async (req, res) => {
  await ready()
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx on 172.17.2.21 would otherwise buffer the stream
  })
  res.flushHeaders()
  const send = () => {
    try { res.write('data: ' + JSON.stringify({ ...viewFor(req.session), me: req.session.email }) + '\n\n') } catch { /* closed */ }
  }
  send()
  const timer = setInterval(send, 500)
  req.on('close', () => clearInterval(timer))
})

api.get('/view', requireSession, async (req, res) => {
  await ready()
  res.json({ ...viewFor(req.session), me: req.session.email })
})

// ---- vendor --------------------------------------------------------------------------------------
api.post('/bid', requireSession, async (req, res) => {
  await ready()
  if (req.session.role !== 'vendor') return res.status(403).json({ ok: false, error: 'Only vendors can bid.' })
  const vid = engine.vendorIdFor(req.session.email)
  if (!vid) return res.status(403).json({ ok: false, error: 'You are not invited to this auction.' })
  const out = engine.placeBid(vid, req.body?.amount) // server timestamp, server validation
  if (out.ok) await syncNow(3000) // saved in SAP when it answers; bidding never waits on SAP for long
  res.json({ ok: out.ok, error: out.error })
})

// ---- admin ---------------------------------------------------------------------------------------
api.post('/control', requireSession, requireAdmin, async (req, res) => {
  await ready()
  const body = { ...(req.body || {}), actor: req.session.email }
  const { action } = body
  const sap = getSap()
  const done = async (out) => { await syncNow(); res.json(out) }

  // Starting an auction: material and vendors are re-read from SAP on the server, never trusted from the browser.
  if (action === 'create') {
    if (!isLoaded()) return res.json({ ok: false, error: 'The current auction could not be loaded from SAP yet. Try again when SAP is reachable.' })
    if (sapMode() !== 'mock' && (body.threshold === undefined || body.threshold === '')) {
      return res.json({ ok: false, error: 'Enter the threshold rate: the highest bid vendors may place.' })
    }
    try {
      const list = await sap.getMaterials(String(body.materialType))
      const material = list.find((m) => m.code === body.materialCode)
      if (!material) return res.json({ ok: false, error: 'Material not found in SAP for this type.' })
      let vendors
      if (Array.isArray(body.vendorCodes) && body.vendorCodes.length) {
        vendors = await sap.getVendors(body.vendorCodes)
        if (vendors.length !== body.vendorCodes.length) return res.json({ ok: false, error: 'Some selected vendors were not found in SAP.' })
        if (vendors.some((v) => !v.email)) return res.json({ ok: false, error: 'A selected vendor has no mail address in SAP: ' + vendors.find((v) => !v.email).name })
      } else if (sapMode() !== 'mock') {
        return res.json({ ok: false, error: 'Select the vendors to invite.' })
      }
      return done(engine.control('create', { ...body, material, vendors, demo: sapMode() === 'mock' }))
    } catch (e) {
      return res.json({ ok: false, error: 'SAP: ' + e.message })
    }
  }

  // Creating an info record / contract: validate and lock, call SAP, then record the result.
  if (action === 'createSap') {
    const prep = engine.prepareSap(body.kind, body.form)
    if (!prep.ok) return res.json(prep)
    try {
      const doc = body.kind === 'contract' ? await sap.createContract(prep.payload) : await sap.createInfoRecord(prep.payload)
      engine.recordSap(body.kind, doc.docNo)
      return done({ ok: true, docNo: doc.docNo })
    } catch (e) {
      if (e.unknownOutcome) {
        engine.markSapUnknown(body.kind, e.message)
        return done({ ok: false, error: 'SAP did not answer in time. The document may already exist. Check SAP, then record the document number or allow a retry.' })
      }
      engine.failSap(body.kind, e.message)
      return done({ ok: false, error: 'SAP: ' + e.message })
    }
  }

  return done(engine.control(action, body))
})

// GET ?type=ROH       -> materials of that type, read from SAP (code, description, unit)
// GET ?code=RM-100245 -> last purchase rate for one material
api.get('/materials', requireSession, requireAdmin, async (req, res) => {
  try {
    const code = req.query.code
    if (code) return res.json(await getSap().getLastRate(String(code)))
    const type = String(req.query.type || '')
    if (!MATERIAL_TYPES.some((t) => t.code === type)) return res.status(400).json({ error: 'Unknown material type.' })
    res.json({ types: MATERIAL_TYPES, materials: await getSap().getMaterials(type) })
  } catch (e) {
    res.status(502).json({ error: 'SAP: ' + e.message })
  }
})

// Search the SAP vendor master by name, for choosing who to invite.
api.get('/vendors', requireSession, requireAdmin, async (req, res) => {
  const term = String(req.query.term || '').trim()
  if (term.length > 0 && term.length < 3) return res.json({ vendors: [] })
  try {
    res.json({ vendors: await getSap().searchVendors(term) })
  } catch (e) {
    res.status(502).json({ error: 'SAP: ' + e.message })
  }
})

api.get('/sap/health', requireSession, requireAdmin, async (_req, res) => {
  const t0 = Date.now()
  try {
    const r = await getSap().ping()
    res.json({ ok: true, mode: sapMode(), sysid: r.sysid, client: r.client, ms: Date.now() - t0 })
  } catch (e) {
    res.status(502).json({ ok: false, mode: sapMode(), error: e.message })
  }
})

app.use('/api', api)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ ok: false, error: err.message || 'Internal server error' })
})

const port = Number(process.env.PORT) || 4110
app.listen(port, () => console.log(`Rate Auction API listening on http://localhost:${port} (SAP ${sapMode()}, store ${storeMode()})`))
