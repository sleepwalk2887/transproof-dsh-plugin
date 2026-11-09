/* ═══════════ 反馈（v4.26.0：提交 + 展示 + 本地暂存重发） ═══════════
   入口：右下角常驻 #btn-fb（全功能区可见）
   展示：项目进度页「反馈记录」卡 #fb-list
   链路：浏览器 → 同源 /api/feedback/*（Pages 边缘）→ workers.dev → KV
   本地：提交先落 tp.fb.log（仅存未发出的，网络不通也不丢，可在任务页重发） */
const FB_ERRS = [];
window.addEventListener('error', function(e){
  const msg = String(e.message || e.type || '');
  try{
    FB_ERRS.push((new Date()).toTimeString().slice(0,8) + ' ' + msg);
    if(FB_ERRS.length > 20) FB_ERRS.shift();
  }catch(_){}
  fbAutoReport('JS 报错', msg + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + (e.lineno||0) : ''));
});
window.addEventListener('unhandledrejection', function(e){   /* v4.34.0：Promise 挂了也要记+报 */
  const r = e && e.reason;
  const msg = (r && (r.message || r)) || 'Promise rejected';
  try{
    FB_ERRS.push((new Date()).toTimeString().slice(0,8) + ' Promise: ' + msg);
    if(FB_ERRS.length > 20) FB_ERRS.shift();
  }catch(_){}
  fbAutoReport('Promise 挂了', msg);
});

/* ── v4.34.0 线上报错自动上报：有报错 → 立刻进反馈通道（线上 https 才发；本地无接口静默）→
   开发端看门狗每分钟巡检 /api/feedback/list，发现新条目就在 DSH 聊天框提醒 ── */
let FB_AUTO_T = 0, FB_AUTO_SIG = '';
/* 反馈接口地址（方案A）：真网页版（pages.dev，https）用同源 /api/feedback/*；插件/本地等
   其它环境一律发到线上接口 https://transproof.pages.dev —— 这样朋友在插件里提交的反馈
   也进同一份服务器日志。跨域已由反馈 Worker 的 Access-Control-Allow-Origin: * 放行。 */
const FB_LIVE = 'https://transproof.pages.dev';
const FB_ON_WEB = (location.protocol === 'https:' && location.hostname.endsWith('pages.dev'));
const FB_BASE = FB_ON_WEB ? '' : FB_LIVE;
function fbAutoReport(kind, msg){
  try{
    if(location.protocol !== 'https:') return;   /* 本地没有 /api 通道，不发 */
    const text = String(msg || '').trim();
    if(!text) return;
    const sig = kind + '|' + text.slice(0, 120);
    if(sig === FB_AUTO_SIG) return;              /* 同一条报错不重复发 */
    const now = Date.now();
    if(now - FB_AUTO_T < 30000) return;          /* 30 秒节流，防刷屏 */
    FB_AUTO_T = now; FB_AUTO_SIG = sig;
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    const localTime = d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
    fbPost({
      desc: '🤖 自动报错（' + kind + '）：' + text.slice(0, 400),
      time: localTime, func: '其他',
      where: '自动捕获 · ' + location.pathname + ' · ' + fbPageName(),
      contact: '', ver: APP_VERSION, page: fbPageName(), path: location.pathname,
      ua: navigator.userAgent.slice(0, 200),
      lastErr: FB_ERRS.join(' | ').slice(0, 300)
    }).catch(function(){ /* 发不出去就留在 FB_ERRS，手动反馈仍会带上 */ });
  }catch(_){}
}

const FB_KEY = 'tp.fb.log';
const FB_FUNCS = ['运行与校对','导入与解析（PDF/Word/扫描OCR）','术语库','译词库','批量与智能扫描','导出与修订（Word）','设置与模型','开屏与界面','项目看板','其他'];

function fbLocal(){ const a = load(FB_KEY, []); return Array.isArray(a) ? a : []; }
function fbLocalSave(a){ save(FB_KEY, a.slice(0, 50)); }
function fbPageName(){ const b = document.querySelector('nav button.on'); return b ? b.textContent.trim().slice(0, 20) : ''; }

function fbMetaLine(){
  const errs = FB_ERRS.length;
  return '自动附带：v' + APP_VERSION + ' · 当前页：' + fbPageName()
    + ' · 最近 JS 报错 ' + errs + ' 条' + (errs ? '（一并发送，便于定位）' : '')
    + ' · 提交人不会显示给其他人';
}

function fbModalHtml(){
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const now = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  return `
  <label class="f">问题描述 *</label>
  <textarea id="fb-desc" rows="4" placeholder="哪里不对、你想要什么，大白话写就行"></textarea>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
    <div style="flex:1 1 200px"><label class="f">出现时间 *</label><input type="datetime-local" id="fb-time" value="${now}"></div>
    <div style="flex:1 1 220px"><label class="f">出现的功能 *</label><select id="fb-func">${FB_FUNCS.map(f => '<option>' + f + '</option>').join('')}</select></div>
  </div>
  <label class="f">出现的地点 · 操作路径 *</label>
  <input id="fb-where" placeholder="例：使用指南 → 点「开始校对」之后">
  <label class="f">联系方式（选填，方便回你）</label>
  <input id="fb-contact" placeholder="微信 / 邮箱">
  <div class="hint" id="fb-meta" style="margin-top:12px">${fbMetaLine()}</div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
    <button class="btn gray" id="fb-cancel">取消</button>
    <button class="btn pri" id="fb-submit">提交反馈</button>
  </div>`;
}

function fbCollect(){
  const desc = ($('#fb-desc').value || '').trim();
  const time = $('#fb-time').value || '';
  const func = $('#fb-func').value || '';
  const where = ($('#fb-where').value || '').trim();
  const contact = ($('#fb-contact').value || '').trim();
  if(!desc) return { err: '请先写一下问题描述' };
  if(!time) return { err: '选一下出现时间' };
  if(!where) return { err: '填一下出现的地点 / 操作路径，方便复现' };
  return { rec: {
    desc, time, func, where, contact,
    ver: APP_VERSION,
    page: fbPageName(),
    path: location.pathname,
    ua: navigator.userAgent.slice(0, 200),
    lastErr: FB_ERRS.join(' | ').slice(0, 300)
  } };
}

async function fbPost(rec){
  const r = await fetch(FB_BASE + '/api/feedback/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rec)
  });
  const j = await r.json();
  if(!j.ok) throw new Error(j.err || 'submit rejected');
  return j.id;
}

async function fbSubmit(){
  const got = fbCollect();
  if(got.err) return toast(got.err);
  const rec = got.rec;
  const queue = fbLocal();
  queue.unshift(Object.assign({ id: 'LOCAL-' + Date.now().toString(36).toUpperCase(), ts: Date.now() }, rec));
  fbLocalSave(queue);                      // 先落本地，网络死了也不丢
  try{
    const id = await fbPost(rec);
    const q2 = fbLocal().filter(x => x.id !== queue[0].id);   // 发成功就从待发队列摘掉
    fbLocalSave(q2);
    closeModal();
    toast('已提交 ✓ 编号 ' + id + '（「项目进度」页可查看）');
    fbLoad();
  }catch(e){
    closeModal();
    toast('网络没通，已存本地——到「项目进度」页点重发即可');
    fbLoad();
  }
}

function fbItemHtml(r, pending){
  return '<div class="fb-item">'
    + '<div class="fb-h"><span class="fb-id">' + esc(String(r.id || '')) + '</span>'
    + (pending ? '<span class="fb-pend">未发出</span><button class="btn gray sm" data-fbresend="' + esc(String(r.id)) + '">重发</button>' : '')
    + '</div>'
    + '<div class="fb-h">' + [r.time, r.func, r.page ? ('页：' + r.page) : ''].filter(Boolean).map(s => esc(String(s))).join(' · ') + '</div>'
    + '<div class="fb-d">' + esc(String(r.desc || '')) + '</div>'
    + (r.where ? '<div class="fb-sub">路径：' + esc(String(r.where)) + '</div>' : '')
    + '</div>';
}

async function fbLoad(){
  const box = $('#fb-list');
  if(!box) return;
  let remote = [];
  try{
    const resp = await fetch(FB_BASE + '/api/feedback/list');
    const j = await resp.json();
    remote = (j && j.list) || [];
  }catch(e){ /* 本地环境没有接口：只展示本地待发队列 */ }
  const pend = fbLocal();
  let html = pend.map(r => fbItemHtml(r, true)).join('') + remote.map(r => fbItemHtml(r, false)).join('');
  if(!html) html = '<div class="hint">还没有记录。遇到问题点右下角「📩 反馈」提交，会出现在这里。</div>';
  box.innerHTML = html;
  const cnt = $('#fb-count');
  if(cnt) cnt.textContent = '（' + (pend.length + remote.length) + ' 条）';
  $$('#fb-list [data-fbresend]').forEach(b => { b.onclick = () => fbResend(b.getAttribute('data-fbresend')); });
}

async function fbResend(id){
  const queue = fbLocal();
  const idx = queue.findIndex(x => x.id === id);
  if(idx < 0) return toast('这条不在待发队列里了');
  try{
    const newId = await fbPost(queue[idx]);
    const q2 = fbLocal();
    const i2 = q2.findIndex(x => x.id === id);
    if(i2 >= 0) q2.splice(i2, 1);
    fbLocalSave(q2);
    toast('已补发 ✓ 编号 ' + newId);
    fbLoad();
  }catch(e){
    toast('还是没通，稍后再试（记录还在本地）');
  }
}

function fbOpen(){
  modal('📩 提交问题 / 建议', fbModalHtml());
  $('#fb-cancel').onclick = closeModal;
  $('#fb-submit').onclick = fbSubmit;
}

/* ── 绑定与初始化 ── */
$('#btn-fb') && ($('#btn-fb').onclick = fbOpen);
$('#fb-refresh') && ($('#fb-refresh').onclick = fbLoad);
/* 只有线上（https）自动拉列表；本地 http 环境不发请求，避免无谓报错 */
setTimeout(fbLoad, 600);
