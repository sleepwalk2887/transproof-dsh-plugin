/**
 * 译校助手 TransProof —— DSH 插件薄壳 Host 半边。
 *
 * 契约来自 coldgust/dsh-translation-assistant 的真实 host/index.js：
 *   export const inject = ['webServer'];
 *   export function apply(ctx, config) { ... }
 *   ctx.webServer.register({ kind:'prefix', path, handler })   // 挂同源静态路由
 *   ctx.get('tools').register(toolDef)                          // 挂 Agent 工具
 *
 * 本插件挂两样：
 *   1. Agent 工具 transproof_audit —— 「跑本地体检」。**复用网页版同一套体检**（见 loadAuditApi）：
 *      直接读网页版 transproof/js/08-render-audit.js，抽出 paraAudit/numAudit/punctAudit/styleAudit
 *      四个纯函数来跑——与网页版同一份代码，永不漂移、自动跟着网页版更新（每次调用读最新）。
 *      纯机械比对、不联网、不调模型、不花 token。
 *   2. 同源静态路由 /dsh-transproof/app —— 给 client.js 的 <iframe> 端出真正的 TransProof 网页。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const inject = ['webServer'];

const APP_PREFIX = '/dsh-transproof/app';
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------- 静态文件根定位 ----------
function resolveAppRoot(cfgRoot) {
  const candidates = [];
  if (cfgRoot) {
    if (path.isAbsolute(cfgRoot)) candidates.push(cfgRoot);
    candidates.push(path.resolve(cfgRoot));
    candidates.push(path.resolve(HERE, cfgRoot));
  }
  candidates.push('C:/Users/Andrew/.dsh/dsh_orb/transproof');
  candidates.push(path.resolve(HERE, '../../transproof'));
  candidates.push(path.resolve(HERE, '../app'));
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(path.join(c, 'index.html'))) return path.resolve(c);
    } catch (e) {}
  }
  return null;
}

// ---------- 复用网页版体检：从 08-render-audit.js 抽出 4 个纯函数 ----------
let AUDIT_CACHE = null;

function sliceFn(text, startMarker, endMarker) {
  const a = text.indexOf(startMarker);
  if (a < 0) throw new Error('体检函数没找到：' + startMarker);
  const b = text.indexOf(endMarker, a);
  if (b < 0) throw new Error('体检函数结尾没找到：' + endMarker);
  return text.slice(a, b);
}

function loadAuditApi(root) {
  const file = path.join(root, 'js', '08-render-audit.js');
  const st = fs.statSync(file);
  if (AUDIT_CACHE && AUDIT_CACHE.file === file && AUDIT_CACHE.mtime === st.mtimeMs) return AUDIT_CACHE.api;
  const text = fs.readFileSync(file, 'utf8');
  const NL = String.fromCharCode(10);
  const body = [
    sliceFn(text, 'function paraAudit(', 'function showParaAudit('),
    sliceFn(text, 'function numAudit(', 'function showNumAudit('),
    sliceFn(text, 'function punctAudit(', 'function showPunctAudit('),
    sliceFn(text, 'function styleAudit(', 'function showStyleAudit('),
    'return { paraAudit: paraAudit, numAudit: numAudit, punctAudit: punctAudit, styleAudit: styleAudit };'
  ].join(NL);
  const api = new Function(body)();
  AUDIT_CACHE = { file, mtime: st.mtimeMs, api };
  return api;
}

// ---------- 静态服务 ----------
const MIME = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  ico: 'image/x-icon',
  gz: 'application/gzip',
  wasm: 'application/wasm',
  txt: 'text/plain; charset=utf-8',
};

function esc(s) {
  return String(s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
}

function send(res, code, type, body) {
  try { if (res && typeof res.statusCode === 'number') res.statusCode = code; } catch (e) {}
  try { if (res && typeof res.setHeader === 'function') { res.setHeader('content-type', type); res.setHeader('cache-control', 'no-cache, must-revalidate'); } } catch (e) {}
  if (res && typeof res.end === 'function') { res.end(body); return undefined; }
  if (res && typeof res.send === 'function') {
    try { if (typeof res.status === 'function') res.status(code); } catch (e) {}
    res.send(body); return undefined;
  }
  return { statusCode: code, headers: { 'content-type': type }, body };
}

function makeAppHandler(root) {
  return async function serve(req, res) {
    if (!root) {
      return send(res, 500, 'text/html; charset=utf-8',
        '<!doctype html><meta charset="utf-8"><p>TransProof 静态根（appRoot）没找到。</p>');
    }
    let urlPath = String((req && (req.url || req.path)) || '/').split('?')[0];
    if (urlPath.indexOf(APP_PREFIX) === 0) urlPath = urlPath.slice(APP_PREFIX.length);
    if (urlPath === '' || urlPath === '/') urlPath = '/index.html';
    if (urlPath.indexOf('..') >= 0) return send(res, 400, 'text/plain; charset=utf-8', 'bad path');
    const rel = urlPath.split('/').filter(Boolean).join('/');
    const file = path.resolve(root, rel);
    if (file !== root && file.indexOf(root + path.sep) !== 0) {
      return send(res, 400, 'text/plain; charset=utf-8', 'bad path');
    }
    let st = null;
    try { st = fs.statSync(file); } catch (e) {}
    if (!st || !st.isFile()) {
      return send(res, 404, 'text/html; charset=utf-8',
        '<!doctype html><meta charset="utf-8"><p>404 ' + esc(rel) + '</p>');
    }
    const ext = (file.split('.').pop() || '').toLowerCase();
    const body = fs.readFileSync(file);
    return send(res, 200, MIME[ext] || 'application/octet-stream', body);
  };
}

// ---------- Agent 工具：跑网页版同一套体检 ----------
function createTool(root) {
  return {
    name: 'transproof_audit',
    description: [
      '译校助手「跑本地体检」：复用网页版同一套体检——段落对齐、数字与格式、标点·书名号、翻译腔，',
      '四项一起跑。纯机械比对、不联网、不调模型、不花 token。用于快速发现漏段、括号没闭合、',
      '数字对不上、翻译腔等硬伤。',
    ].join(''),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: { type: 'string', description: '原文。' },
        translation: { type: 'string', description: '译文。' },
      },
      required: ['source', 'translation'],
    },
    output: {
      schema: { type: 'object', properties: {} },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => true,
    timeoutMs: 30000,
    async execute(args) {
      const input = args && typeof args === 'object' ? args : {};
      const source = typeof input.source === 'string' ? input.source : '';
      const translation = typeof input.translation === 'string' ? input.translation : '';
      const A = loadAuditApi(root);
      const para = A.paraAudit(source, translation);
      const num = A.numAudit(source, translation);
      const punct = A.punctAudit(source, translation);
      const style = A.styleAudit(translation);
      return {
        ok: true,
        note: '网页版同一套体检（transproof/js/08-render-audit.js），不联网、不花 token',
        audit: { para, num, punct, style },
      };
    },
  };
}

// ---------- Host 入口 ----------
export function apply(ctx, config) {
  const root = resolveAppRoot(config && config.appRoot);
  try {
    ctx.webServer.register({ kind: 'prefix', path: APP_PREFIX, handler: makeAppHandler(root) });
  } catch (e) {
    console.error('[transproof-dsh-plugin] register app route failed:', e && e.message);
  }
  const tools = ctx.get('tools');
  if (tools) {
    ctx.effect(() => tools.register(createTool(root)), 'transproof-dsh-plugin: agent tool');
  }
}
