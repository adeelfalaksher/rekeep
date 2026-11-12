import { makeCase, total, maxMessage } from '../public/match.mjs'
import { sandboxGateway, sandboxRefundStatus } from '../lib/braintree.mjs'

const env = process.env
const base = env.SUPABASE_URL?.replace(/\/$/, '')
const key = env.SUPABASE_PUBLISHABLE_KEY
const appOrigin = env.APP_ORIGIN || 'http://127.0.0.1:4173'
const secure = new URL(appOrigin).protocol === 'https:' ? '; Secure' : ''
const gateway = sandboxGateway(env)
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const fault = (status, message) => Object.assign(new Error(message), { status })
const pick = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit + 1) : ''
const authPath = '/auth/v1'
const dataPath = '/rest/v1'
const fields = 'id,order_number,customer,message,items,created_at,refund:rekeep_refunds(item_id,amount_cents,reference,source,status,created_at)'
const encode = encodeURIComponent

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(data))
}
async function input(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fault(415, 'Send a JSON request.')
  const cap = 12288
  if (Number(req.headers['content-length']) > cap) throw fault(413, 'This request is too large.')
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (JSON.stringify(req.body).length > cap) throw fault(413, 'This request is too large.')
    return req.body
  }
  const chunks = []
  let length = 0
  for await (const part of req) {
    length += part.length
    if (length > cap) throw fault(413, 'This request is too large.')
    chunks.push(part)
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString())
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
    return data
  } catch { throw fault(400, 'Send a valid request.') }
}

async function sup(path, { access, body, method, service = false, returning = false } = {}) {
  if (!base || !key) throw fault(503, 'Workspace configuration is unavailable.')
  const apiKey = service ? env.SUPABASE_SECRET_KEY : key
  const bearer = service && apiKey.startsWith('eyJ') ? apiKey : access
  const headers = { apikey: apiKey, Accept: 'application/json' }
  if (bearer) headers.Authorization = 'Bearer ' + bearer
  if (returning) headers.Prefer = 'return=representation'
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let response
  try {
    response = await fetch(base + path, { headers, method, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10000) })
  } catch { throw fault(503, 'The workspace is temporarily unavailable. Please try again.') }
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (response.ok) return data
  if (data?.code === '23505') throw fault(409, 'That order or refund reference is already recorded.')
  if (response.status === 429) throw fault(429, 'Too many attempts. Wait a moment and try again.')
  if (data?.error_code === 'email_address_not_authorized' || data?.error_code === 'over_email_send_rate_limit') {
    throw fault(503, 'We couldn’t send a confirmation email. Contact your workspace administrator to set up access.')
  }
  if (data?.error_code === 'email_not_confirmed') throw fault(403, 'Confirm your email before signing in.')
  if (data?.error_code === 'user_already_exists') throw fault(409, 'An account already exists for this email. Sign in instead.')
  if (response.status === 401 || response.status === 403) throw fault(response.status, 'Please sign in again to continue.')
  if (path.includes('grant_type=password')) throw fault(400, 'Email or password is incorrect.')
  if (response.status === 400 || response.status === 422) throw fault(400, 'Check the information you entered and try again.')
  throw fault(503, 'The workspace is temporarily unavailable.')
}

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((value) => value.trim().split('=')).filter(([name, value]) => /^rk_(access|refresh)$/.test(name) && /^[\w.-]{1,3900}$/.test(value || '')))
const cookie = (name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`
function save(res, session) {
  if (!session?.access_token || !session?.refresh_token) return
  res.setHeader('Set-Cookie', [cookie('rk_access', session.access_token, session.expires_in || 3600), cookie('rk_refresh', session.refresh_token, 14 * 86400)])
}
function clear(res) { res.setHeader('Set-Cookie', [cookie('rk_access', '', 0), cookie('rk_refresh', '', 0)]) }
async function sessionFor(req, res, verify = false) {
  const tokens = cookies(req)
  let access = tokens.rk_access
  if (!access && tokens.rk_refresh) {
    const session = await sup(authPath + '/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: tokens.rk_refresh } })
    save(res, session)
    access = session.access_token
  }
  if (!access) throw fault(401, 'Sign in to open your workspace.')
  return { access, user: verify ? await sup(authPath + '/user', { access }) : undefined }
}

const auth = async (action, body, res) => {
  const email = pick(body.email, 254).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fault(400, 'Enter a valid email address.')
  if (!password || password.length > 128 || (action === 'signup' && password.length < 10)) throw fault(400, 'Use a password of at least 10 characters when creating an account.')
  if (action === 'signin') {
    const result = await sup(authPath + '/token?grant_type=password', { method: 'POST', body: { email, password } })
    save(res, result)
    return { signedIn: true }
  }
  const shop = pick(body.shop, 60)
  if (!shop || shop.length > 60) throw fault(400, 'Enter a store name of up to 60 characters.')
  const result = await sup(authPath + '/signup?redirect_to=' + encode(appOrigin + '/confirm'), { method: 'POST', body: { email, password, data: { shop } } })
  save(res, result)
  return { signedIn: Boolean(result?.access_token) }
}

function merchantEnabled(user) {
  if (!gateway || !env.SUPABASE_SECRET_KEY || !user?.id) return false
  if (env.BRAINTREE_MERCHANT_UID && user.id === env.BRAINTREE_MERCHANT_UID) return true
  const configuredEmail = env.BRAINTREE_MERCHANT_EMAIL?.trim().toLowerCase()
  return Boolean(configuredEmail && user.email_confirmed_at && user.email?.toLowerCase() === configuredEmail)
}
const caseQuery = (id, includePayment = false) => dataPath + '/rekeep_cases?select=' + encode(includePayment ? fields.replace('source,status,', 'source,status,payment_ref,') : fields) + '&id=eq.' + id
const refundTable = dataPath + '/rekeep_refunds'
const getCase = async (id, access, includePayment) => (await sup(caseQuery(id, includePayment), { access }))?.[0]
const refundOf = (entry) => Array.isArray(entry?.refund) ? entry.refund[0] : entry?.refund
function requireCase(id) { if (!idPattern.test(id || '')) throw fault(404, 'Case not found.') }
const sandboxOrder = (id) => 'RK-' + id
const saveSandboxStatus = (id, previous, body) => sup(refundTable + '?case_id=eq.' + id + '&status=eq.' + previous, { service: true, method: 'PATCH', body })

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, appOrigin)
    const action = url.searchParams.get('action')
    const id = url.searchParams.get('id')
    const write = req.method === 'POST'
    if (!write && req.method !== 'GET') throw fault(405, 'This request method is unavailable.')
    if (write && (req.headers.origin !== appOrigin || req.headers['sec-fetch-site'] === 'cross-site')) throw fault(403, 'Open Rekeep directly to make changes.')
    if (write && ['signin','signup'].includes(action)) return json(res, 200, await auth(action, await input(req), res))
    if (write && action === 'signout') {
      const { rk_access: access } = cookies(req)
      if (access) await sup(authPath + '/logout?scope=local', { access, method: 'POST' }).catch(() => {})
      clear(res)
      return json(res, 200, { ok: true })
    }
    const { access, user } = await sessionFor(req, res, ['session','braintree','check-refund'].includes(action))
    if (!write && action === 'session') return json(res, 200, { email: user.email, shop: pick(user.user_metadata?.shop, 60), braintree: merchantEnabled(user) })
    if (!write && action === 'cases') {
      const records = await sup(dataPath + '/rekeep_cases?select=' + encode(fields) + '&order=created_at.desc&limit=100', { access })
      return json(res, 200, { cases: records })
    }
    if (write && action === 'new') {
      let order
      try { order = makeCase(await input(req)) } catch (error) { throw fault(error.status || 400, error.message) }
      const [record] = await sup(dataPath + '/rekeep_cases', { access, method: 'POST', body: { order_number: order.orderNumber, customer: order.name, message: order.message, items: order.items }, returning: true })
      return json(res, 201, { case: record })
    }
    if (write && action === 'message') {
      requireCase(id)
      const message = pick((await input(req)).message, maxMessage)
      if (!message || message.length > maxMessage) throw fault(400, 'Enter a customer message up to 1,600 characters.')
      const [record] = await sup(caseQuery(id), { access, method: 'PATCH', body: { message }, returning: true })
      if (!record) throw fault(409, 'This case is closed or unavailable.')
      return json(res, 200, { case: record })
    }
    if (write && action === 'check-refund') {
      requireCase(id)
      if (!merchantEnabled(user)) throw fault(403, 'A Braintree Sandbox connection is unavailable for this account.')
      const entry = await getCase(id, access, true)
      const previous = refundOf(entry)
      if (previous?.source !== 'braintree_sandbox') throw fault(404, 'Sandbox refund not found.')
      if (['pending','submitted'].includes(previous.status)) {
        let result
        try { result = await gateway.checkRefund(previous.reference, previous.payment_ref, sandboxOrder(id), previous.amount_cents) }
        catch { throw fault(503, 'Braintree could not check this refund. Try again later.') }
        if (result) await saveSandboxStatus(id, previous.status, result)
      }
      const record = await getCase(id, access)
      const status = refundOf(record)?.status
      const notice = status === 'pending' ? 'Braintree has not confirmed this refund. Check again later before issuing another refund.' : ''
      return json(res, 200, { case: record, notice })
    }
    if (write && ['record','braintree'].includes(action)) {
      requireCase(id)
      const body = await input(req)
      const entry = await getCase(id, access)
      if (!entry) throw fault(404, 'Case not found.')
      const item = entry.items.find((line) => line.id === body.item)
      if (!item) throw fault(400, 'Select a line from this order.')
      const previous = refundOf(entry)
      const reference = pick(body.reference, 120)
      if (action === 'record') {
        if (!reference || reference.length > 120) throw fault(400, 'Enter the refund reference from your payment provider.')
        if (previous?.source === 'external' && previous.item_id === item.id && previous.reference === reference) return json(res, 200, { case: entry })
        if (previous) throw fault(409, 'This case already has a refund record.')
        await sup(refundTable, { access, method: 'POST', body: { case_id: id, item_id: item.id, reference } })
      } else {
        if (!merchantEnabled(user)) throw fault(403, 'A Braintree Sandbox connection is unavailable for this account.')
        if (previous?.status === 'pending') throw fault(409, 'Verify the pending refund in Braintree before taking another action.')
        if (previous) throw fault(409, 'This case already has a refund record.')
        if (!/^[\w=-]{4,120}$/.test(reference)) throw fault(400, 'Enter a valid Braintree transaction ID.')
        let payment
        try { payment = await gateway.findSettledPayment(reference, entry.order_number, total(entry)) }
        catch { throw fault(422, 'The settled USD Sandbox transaction must match the case order number and total.') }
        const refundOrder = sandboxOrder(id)
        await sup(refundTable, { method: 'POST', service: true, body: { case_id: id, user_id: user.id, item_id: item.id, source: 'braintree_sandbox', status: 'pending', payment_ref: payment, reference: refundOrder } })
        try {
          const result = await gateway.refund(payment, refundOrder, item.cents)
          await saveSandboxStatus(id, 'pending', { reference: result.reference, status: sandboxRefundStatus(result.status) })
        } catch {
          return json(res, 202, { case: await getCase(id, access), notice: 'The refund outcome needs verification. Use the displayed reference in Braintree before taking another action.' })
        }
      }
      return json(res, 200, { case: await getCase(id, access) })
    }
    throw fault(404, 'Page not found.')
  } catch (error) {
    json(res, error.status || 500, { error: error.status ? error.message : 'The workspace could not complete this request.' })
  }
}
