/* ═══════════ 项目进度看板（v4.5 协作）═══════════ */
const LS_PROJ = 'tp.project';
let PROJECT = load(LS_PROJ, { name:'', currentId:null, tasks:[] });
const TASK_STATUS = [
  { key:'todo', label:'未开始', cls:'todo' },
  { key:'translating', label:'翻译中', cls:'warn' },
  { key:'proofreading', label:'校对中', cls:'pp' },
  { key:'done', label:'已完成', cls:'ok' },
];
function saveProject(){ save(LS_PROJ, PROJECT); }
function renderProject(){
  const total = PROJECT.tasks.length;
  const done = PROJECT.tasks.filter(t => t.status === 'done').length;
  const translating = PROJECT.tasks.filter(t => t.status === 'translating').length;
  const proofreading = PROJECT.tasks.filter(t => t.status === 'proofreading').length;
  const todo = total - done - translating - proofreading;
  const pct = total ? Math.round(done / total * 100) : 0;
  $('#proj-name').value = PROJECT.name || '';
  $('#proj-count').textContent = total + ' 个任务';
  $('#proj-stat').innerHTML =
    '<span>总任务 <b style="color:var(--tx)">' + total + '</b></span>' +
    '<span style="color:var(--ok)">已完成 ' + done + '</span>' +
    '<span style="color:var(--warn)">翻译中 ' + translating + '</span>' +
    '<span style="color:var(--pp)">校对中 ' + proofreading + '</span>' +
    '<span style="color:var(--tx3)">未开始 ' + todo + '</span>';
  $('#proj-bar').style.width = pct + '%';
  $('#proj-bar-txt').textContent = total ? ('总进度 ' + pct + '%（' + done + '/' + total + '）') : '还没有任务，先在上方添加一个吧';
  const rows = PROJECT.tasks.map((t, i) => {
    const statusBtns = TASK_STATUS.map(s =>
      '<button class="mini-status' + (t.status === s.key ? ' on ' + s.cls : '') + '" data-i="' + i + '" data-s="' + s.key + '">' + s.label + '</button>'
    ).join('');
    const proofBadge = t.proof ? (() => {
      const p = t.proof;
      const stageLabel = { full:'完整', pass1:'一校✓', pass2:'二校✓' }[p.stage] || '';
      const errKeys = Object.keys(p.errors || {});
      const errTxt = errKeys.slice(0, 3).map(k => k + (p.errors[k] || 0)).join(' ');
      const bad = ((p.termAudit || {}).conflict || 0) + ((p.termAudit || {}).multi || 0);
      let h = '';
      if(stageLabel) h += '<span class="proof-badge info">' + esc(stageLabel) + '</span>';
      if(errTxt) h += '<span class="proof-badge info">' + esc(errTxt) + '</span>';
      if(bad > 0) h += '<span class="proof-badge warn">⚠术语' + bad + '</span>';
      return h;
    })() : '';
    const isCur = t.id === PROJECT.currentId;
    return '<div class="' + (isCur ? 'cur-task' : '') + '" style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:160px"><b style="font-size:13px">' + esc(t.name) + '</b>' +
        (t.owner ? '<span style="color:var(--tx3);font-size:11px;margin-left:8px">👤 ' + esc(t.owner) + '</span>' : '') +
        (isCur ? '<span style="color:var(--ac);font-size:11px;margin-left:8px">◎ 当前</span>' : '') +
        (proofBadge ? '<span style="display:inline-flex;gap:4px;flex-wrap:wrap;margin-left:8px;vertical-align:middle">' + proofBadge + '</span>' : '') +
      '</div>' +
      '<div style="display:flex;gap:4px;flex-wrap:wrap">' + statusBtns + '</div>' +
      '<button class="btn x" data-cur="' + i + '" title="设为当前任务：校对结果自动同步到此任务">◎</button>' +
      '<button class="btn x" data-del="' + i + '" title="删除任务">✕</button>' +
    '</div>';
  }).join('');
  $('#proj-list').innerHTML = rows || '<div class="empty">还没有任务。在上方输入任务名，点「＋ 添加任务」开始。</div>';
  document.querySelectorAll('#proj-list .mini-status').forEach(b => {
    b.onclick = () => { PROJECT.tasks[+b.dataset.i].status = b.dataset.s; PROJECT.tasks[+b.dataset.i].updatedAt = Date.now(); saveProject(); renderProject(); };
  });
  document.querySelectorAll('#proj-list [data-cur]').forEach(b => {
    b.onclick = () => { PROJECT.currentId = PROJECT.tasks[+b.dataset.cur].id; saveProject(); renderProject(); toast('已设为当前任务，校对结果将自动同步到此任务'); };
  });
  document.querySelectorAll('#proj-list [data-del]').forEach(b => {
    b.onclick = () => { const t = PROJECT.tasks.splice(+b.dataset.del, 1)[0]; if(t && t.id === PROJECT.currentId) PROJECT.currentId = null; saveProject(); renderProject(); };
  });
}
$('#proj-rename').onclick = () => { PROJECT.name = $('#proj-name').value.trim(); saveProject(); toast('项目已命名'); };
$('#task-add').onclick = () => {
  const name = $('#task-name').value.trim();
  if(!name){ toast('请输入任务名', 'w'); return; }
  PROJECT.tasks.push({ id: 't' + Date.now() + Math.random().toString(36).slice(2,6), name, owner: $('#task-owner').value.trim(), status: 'todo', updatedAt: Date.now() });
  $('#task-name').value = ''; $('#task-owner').value = '';
  saveProject(); renderProject(); toast('已添加任务：' + name);
};
$('#task-name').onkeydown = e => { if(e.key === 'Enter') $('#task-add').click(); };
$('#proj-export').onclick = () => {
  if(!PROJECT.tasks.length){ toast('还没有任务可导出', 'w'); return; }
  dl('项目进度_' + (PROJECT.name || today()) + '.json', JSON.stringify({ name:PROJECT.name, tasks:PROJECT.tasks, exportedAt:new Date().toISOString() }, null, 2), 'application/json');
};
$('#proj-import').onclick = () => $('#proj-file').click();
$('#proj-file').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try{
      const j = JSON.parse(rd.result);
      const tasks = Array.isArray(j) ? j : (j.tasks || []);
      if(!tasks.length){ toast('文件里没有任务', 'w'); return; }
      let add = 0, upd = 0;
      tasks.forEach(t => {
        const ex = PROJECT.tasks.find(x => x.id === t.id);
        if(ex){ Object.assign(ex, t); upd++; }
        else { PROJECT.tasks.push({ id: t.id || ('t'+Date.now()+Math.random().toString(36).slice(2,6)), name: t.name||'', owner: t.owner||'', status: t.status||'todo', updatedAt: t.updatedAt||Date.now(), proof: t.proof || null }); add++; }
      });
      if(j.name) PROJECT.name = j.name;
      saveProject(); renderProject();
      toast('导入完成：新增 ' + add + '、更新 ' + upd);
    }catch(err){ toast('导入失败：' + err.message, 'e'); }
  };
  rd.readAsText(f);
  e.target.value = '';
};

/* ═══════════ 界面主题（明暗自适应 + 自定义主题色）═══════════ */
let THEME = load('tp.theme', 'auto');
let ACCENT = load('tp.accent', null);

function shadeHex(hex, pct){
  const n = parseInt(hex.replace('#',''), 16);
  let r = (n>>16)&255, g = (n>>8)&255, b = n&255;
  const f = pct/100;
  r = Math.round(r*(1+f)); g = Math.round(g*(1+f)); b = Math.round(b*(1+f));
  const c = x => Math.max(0, Math.min(255, x)).toString(16).padStart(2,'0');
  return '#' + c(r) + c(g) + c(b);
}
function applyTheme(){
  let eff = THEME;
  if(eff === 'auto') eff = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  document.documentElement.dataset.theme = eff;
}
function renderThemeUI(){
  document.querySelectorAll('.theme-opt').forEach(b => b.classList.toggle('on', b.dataset.themeMode === THEME));
  const tb = $('#themeToggle');
  if(tb) tb.textContent = { auto:'🌓', dark:'🌙', light:'☀️' }[THEME] || '🌓';
}
function setTheme(mode){
  THEME = mode;
  save('tp.theme', mode);
  applyTheme();
  renderThemeUI();
}
function applyAccent(hex){
  if(!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  ACCENT = hex;
  save('tp.accent', hex);
  document.documentElement.style.setProperty('--ac', hex);
  document.documentElement.style.setProperty('--ac2', shadeHex(hex, -18));
  document.documentElement.style.setProperty('--grad-ac', 'linear-gradient(135deg,' + hex + ' 0%,' + shadeHex(hex, -28) + ' 100%)');
  document.querySelectorAll('.accent-swatch').forEach(s => s.classList.toggle('on', s.dataset.hex.toLowerCase() === hex.toLowerCase()));
  const pk = $('#accentPicker'); if(pk) pk.value = hex;
}
$('#themeToggle').onclick = () => {
  const order = { auto:'dark', dark:'light', light:'auto' };
  setTheme(order[THEME] || 'auto');
};
document.querySelectorAll('.theme-opt').forEach(b => b.onclick = () => setTheme(b.dataset.themeMode));
document.querySelectorAll('.accent-swatch').forEach(s => s.onclick = () => applyAccent(s.dataset.hex));
$('#accentPicker').onchange = e => applyAccent(e.target.value);
if(window.matchMedia){
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const onChange = () => { if(THEME === 'auto') applyTheme(); };
  if(mq.addEventListener) mq.addEventListener('change', onChange);
}

/* ═══════════ 开屏动画（3 秒问候页）═══════════ */
const SPLASH = load('tp.splash', { on:true, slogan:'', deco:'d1' });
const SP_DECOS = { d1:'✦ ── ◆ ── ✧', d2:'─═══════════════─', d3:'╭─▄▀ ▊▍▍▋', d4:'〔 ❖ 〕' };
function spGreeting(){
  const h = new Date().getHours();
  return h < 5 ? '夜深了，辛苦了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}
function showSplash(){
  if(!SPLASH.on) return;
  const el = document.createElement('div');
  el.id = 'tp-splash';
  el.innerHTML = '<div class="sp-box"><div class="sp-deco"></div><div class="sp-hi"></div><div class="sp-slogan"></div><div class="sp-meta">TRANSPROOF · v' + APP_VERSION + '</div></div>';
  el.querySelector('.sp-deco').textContent = SP_DECOS[SPLASH.deco] || SP_DECOS.d1;
  el.querySelector('.sp-hi').textContent = spGreeting() + '，欢迎回来';
  el.querySelector('.sp-slogan').textContent = (SPLASH.slogan || '').trim() || '译校有我，落笔无忧';
  document.body.appendChild(el);
  setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 3300); // 2.45s 起淡出，3.3s 出 DOM
}
(function wireSplashSettings(){
  const on = $('#splash-on'), sg = $('#splash-slogan'), dc = $('#splash-deco');
  if(!on || !sg || !dc) return;
  on.checked = !!SPLASH.on;
  sg.value = SPLASH.slogan || '';
  dc.value = SPLASH.deco || 'd1';
  const persist = () => {
    SPLASH.on = on.checked; SPLASH.slogan = sg.value.trim(); SPLASH.deco = dc.value;
    save('tp.splash', SPLASH);
  };
  on.onchange = persist; sg.onchange = persist; dc.onchange = persist;
})();
showSplash();

/* ═══════════ 初始化 ═══════════ */
(function init(){
  initTermCat();
  fillCfg();
  $('#prefs').value = PREFS;
  // 版本号：接入全局常量，替换写死的 "v3.0"
  const gv = $('#g-version'); if(gv) gv.textContent = 'v' + APP_VERSION;
  // 主题：应用 + 渲染 + 恢复自定义主题色
  applyTheme();
  renderThemeUI();
  if(ACCENT) applyAccent(ACCENT);
  renderTerms();
  renderDataStat();
  updateDot();
  // P1：渲染文件输入条
  renderFileBar('src');
  renderFileBar('dst');
  // 3.0：渲染专有译词库
  ensureRules();
  renderGloss();
  // 4.5：渲染项目进度看板
  renderProject();
  // 4.14：渲染翻译记忆
  renderMemory();
  if(EXT_CFG.defaults && typeof EXT_CFG.defaults === 'object'){
    const d = EXT_CFG.defaults;
    const map = {lang:'#lang', genre:'#genre', tone:'#tone', depth:'#depth', style:'#style', variant:'#variant'};
    for(const [k,sel] of Object.entries(map)){ if(d[k] && $(sel)) $(sel).value = d[k]; }
    const ck = {term:'c-term', note:'c-note', ext:'c-ext', format:'c-format', deai:'c-deai', ask:'c-ask'};
    for(const [k,id] of Object.entries(ck)){ if(d[k] !== undefined && $('#'+id)) $('#'+id).checked = !!d[k]; }
  }
  // 断点续传：检测上次任务快照，有则提示恢复
  setTimeout(promptResumeTask, 400);
})();