import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import handler from './api/rekeep.mjs'

const routes = new Set(['/', '/signin', '/signup', '/workspace', '/intro', '/confirm'])
const mime = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', mjs: 'text/javascript; charset=utf-8', js: 'text/javascript; charset=utf-8', svg: 'image/svg+xml', webp: 'image/webp' }

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname
  if (path === '/api/rekeep') return handler(req, res)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; script-src 'self' 'sha256-pld3+YRWD7nR6Umye8nEf8OYQOdD45OeTSeDQhFfdn4='; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  const filename = routes.has(path) ? 'index.html' : path.slice(1)
  const type = mime[filename.split('.').at(-1)]
  if (req.method !== 'GET' || !type || !/^[\w.-]+$/.test(filename)) { res.writeHead(404); return res.end('Page not found.') }
  try {
    const data = await readFile(new URL('./public/' + filename, import.meta.url))
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
    return res.end(data)
  } catch { res.writeHead(404); return res.end('Page not found.') }
})
const port = Number(process.env.PORT || 4173)
server.listen(port, '127.0.0.1', () => console.log(`Rekeep · http://127.0.0.1:${server.address().port}`))
