/* ═══════════════════════════════════════════════════════════════
   对外接口层（正式版新增）—— 供自研翻译工具对接，三选一：
   ① URL 参数：index.html?src=原文&dst=译文&lang=英语&autostart=1
      支持：src dst lang genre tone depth style variant extra
            terms(JSON) prefs options(JSON) autostart
   ② postMessage：你们的页面用 iframe 嵌入本工具后，
      iframe.contentWindow.postMessage({type:'transproof:fill', payload:{...}}, '*')
      事件：transproof:fill（灌数据）/ transproof:run（开始校对）
            / transproof:stop；回执 transproof:complete / transproof:error
   ③ window.TransProof 全局对象：
      TransProof.fill({...}) / .run() / .runExt() / .stop()
      / .getResult() / .setTerms([...]) / .getTerms() / .version
   详见《二次开发指南.md》
   ═══════════════════════════════════════════════════════════════ */
function applyPayload(p){
  if(!p || typeof p !== 'object') return false;
  let touched = false;
  const setVal = (sel, v) => {
    const el = $(sel);
    if(el && v !== undefined && v !== null && v !== ''){ el.value = String(v); touched = true; }
  };
  setVal('#src', p.src);   setVal('#dst', p.dst);
  setVal('#lang', p.lang); setVal('#genre', p.genre);
  setVal('#tone', p.tone); setVal('#depth', p.depth);
  setVal('#style', p.style); setVal('#variant', p.variant);
  setVal('#extra', p.extra);
  if(Array.isArray(p.terms) && p.terms.length){
    let n = 0;
    p.terms.forEach(t => {
      if(t && t.src && t.dst){
        const ex = TERMS.find(x => x.src.toLowerCase() === String(t.src).toLowerCase());
        if(ex){ ex.dst = t.dst; if(t.note) ex.note = t.note; }
        else { TERMS.push({ src:t.src, dst:t.dst, cat:t.cat||'其他', note:t.note||'' }); }
        n++;
      }
    });
    if(n){ save(LS.terms, TERMS); renderTerms(); toast('已接收 ' + n + ' 条外部术语'); }
  }
  if(typeof p.prefs === 'string' && p.prefs){ PREFS = p.prefs; save(LS.prefs, PREFS); $('#prefs').value = PREFS; }
  if(p.options && typeof p.options === 'object'){
    const map = {term:'c-term', note:'c-note', ext:'c-ext', format:'c-format', deai:'c-deai', ask:'c-ask', noun:'ts-c-noun'};
    for(const [k,id] of Object.entries(map)){
      if(p.options[k] !== undefined){ const el = $('#'+id); if(el){ el.checked = !!p.options[k]; } }
    }
  }
  if(p.apiKey || p.baseUrl || p.model){
    CFG = Object.assign(CFG, {
      apiKey: p.apiKey || CFG.apiKey,
      baseUrl: (p.baseUrl || CFG.baseUrl).replace(/\/+$/,''),
      model: p.model || CFG.model
    });
    save(LS.cfg, CFG); fillCfg(); updateDot();
  }
  return touched;
}
/* ① URL 参数 */
(function fromURL(){
  const q = new URLSearchParams(location.search);
  const p = {};
  ['src','dst','lang','genre','tone','depth','style','variant','extra','prefs','apiKey','baseUrl','model'].forEach(k => { if(q.get(k)) p[k] = q.get(k); });
  try{
    if(q.get('terms')) p.terms = JSON.parse(q.get('terms'));
    if(q.get('options')) p.options = JSON.parse(q.get('options'));
  }catch(e){}
  const touched = applyPayload(p);
  if(touched) toast('已从链接载入数据');
  if(q.get('autostart') === '1' && q.get('dst')) setTimeout(() => run(false), 400);
})();
/* ② postMessage（iframe 嵌入场景） */
window.addEventListener('message', e => {
  const d = e.data;
  if(!d || !d.type || !String(d.type).startsWith('transproof:')) return;
  const cmd = d.type.slice(11);
  if(cmd === 'fill'){
    applyPayload(d.payload);
    if(d.payload && d.payload.autostart) setTimeout(() => run(false), 300);
    try{ e.source.postMessage({type:'transproof:filled'}, '*'); }catch(_){}
  }else if(cmd === 'run'){
    run(false);
  }else if(cmd === 'runExt'){
    run(true);
  }else if(cmd === 'stop'){
    if(ABORT) ABORT.abort();
  }else if(cmd === 'parseFile'){
    // d.payload = { side:'src'|'dst', file:File|Blob, fileName?:string, b64?:string, mime?:string }
    (async()=>{
      try{
        let file = d.payload.file;
        if(!file && d.payload.b64){
          const bin = atob(d.payload.b64);
          const bytes = new Uint8Array(bin.length);
          for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
          file = new File([bytes], d.payload.fileName || 'remote.bin', { type: d.payload.mime || 'application/octet-stream' });
        }
        const data = await parseFile(file, d.payload.side || 'src', ()=>{});
        __TP_FILES[d.payload.side || 'src'] = data;
        renderFileBar(d.payload.side || 'src');
        fillFromChapter(d.payload.side || 'src', -1);
        try{ e.source.postMessage({type:'transproof:parsed', payload:{ side:d.payload.side, kind:data.kind, chapters:data.chapters.length }}, '*'); }catch(_){}
      }catch(err){
        try{ e.source.postMessage({type:'transproof:error', detail:{ message:'parseFile: '+err.message }}, '*'); }catch(_){}
      }
    })();
  }else if(cmd === 'setChapter'){
    fillFromChapter(d.payload.side, d.payload.idx);
  }else if(cmd === 'clearFile'){
    const side = d.payload && d.payload.side;
    if(side){ __TP_FILES[side] = null; renderFileBar(side); $('#'+side).value = ''; }
  }
});
/* ③ 全局 API */
window.TransProof = {
  version: APP_VERSION,
  // 3.0 新增：专有译词库接口
  gloss: {
    data: () => JSON.parse(JSON.stringify(GLOSS)),
    importFile: (file) => parseGlossFile(file).then(parsed => glossIngest(parsed)),
    exportFiltered: (fmt) => glossExport(fmt, glossFiltered()),
    syncTerms: () => { $('#btn-g-sync').click(); },
    stats: () => ({
      terms: GLOSS.terms.length,
      sources: GLOSS.sources.length,
      confirmed: GLOSS.terms.filter(t=>t.status==='confirmed').length,
      recommended: GLOSS.terms.filter(t=>t.recommend==='rec').length
    })
  },
  fill: applyPayload,
  run: () => run(false),
  runExt: () => run(true),
  stop: () => { if(ABORT) ABORT.abort(); },
  getResult: () => LAST_OUT,
  setResult: (t) => { LAST_OUT = String(t || ''); $('#out').innerHTML = md(LAST_OUT); saveTask(); },
  isRunning: () => RUNNING,
  setTerms: list => { if(Array.isArray(list)){ TERMS = list.filter(t=>t&&t.src&&t.dst).map(t=>({src:t.src,dst:t.dst,cat:t.cat||'其他',note:t.note||''})); save(LS.terms,TERMS); renderTerms(); } },
  getTerms: () => TERMS.slice(),
  exportTerms: () => JSON.stringify(TERMS, null, 2),
  // P1：文件输入接口
  parseFile: (file, side='src') => parseFile(file, side, ()=>{}),
  getFiles: () => ({ src: __TP_FILES.src && { ...__TP_FILES.src }, dst: __TP_FILES.dst && { ...__TP_FILES.dst } }),
  setChapter: (side, idx) => { fillFromChapter(side, idx); },
  clearFile: (side) => { __TP_FILES[side] = null; renderFileBar(side); $('#'+side).value = ''; },
  // 3.1：文档模式——下载"图片排版保留、仅替换文字"的校对后 Word
  exportDocx: () => exportProofreadDocx(),
  isDocModeReady: () => docModeActive()
};

/* ═══════════ 专有译词库 · UI 渲染与交互 ═══════════ */
let G_SORT = { key:'', dir:1 };
let G_SEL = new Set();

/* M4（T-012 · v4.32.0）：术语权威分级唯一闸门 —— 只有「已批准（confirmed）」词条
   才允许注入提示词；待审/已拒绝一律不进提示词。所有提示词注入点都必须走这里，
   杜绝各处重复过滤、漏过滤（此前 02-prompts-reverse 提炼方针就漏了 status 过滤）。 */
function approvedGloss(){
  return GLOSS.terms.filter(t => t && t.status === 'confirmed' && t.foreign && t.zh);
}

function renderGloss(){
  renderGlossStats();
  renderCollections();
  renderGlossFilters();
  renderGlossTable();
  if(typeof renderGvPanel === 'function') renderGvPanel();
  const has = GLOSS.terms.length > 0;
  $('#btn-g-export').disabled = !has;
  $('#btn-g-sync').disabled = !has;
  $('#g-empty').style.display = has ? 'none' : '';
  $('#g-filter-card').style.display = has ? '' : 'none';
}
function renderCollections(){
  const box = $('#g-collections');
  if(!box) return;
  const cols = GLOSS.collections || [];
  if(!cols.length){
    box.innerHTML = '<div class="g-col-empty">暂无集合 — 用「📂 智能扫描文件」自动生成，一个文件/一本书 = 一个集合</div>';
    return;
  }
  box.innerHTML = cols.map(c => {
    const n = GLOSS.terms.filter(t => (t.collections || []).includes(c.id)).length;
    const on = c.enabled !== false;
    return '<div class="g-col" data-cid="' + esc(c.id) + '">' +
      '<label class="g-col-chk"><input type="checkbox" data-cen ' + (on ? 'checked' : '') + '></label>' +
      '<div class="g-col-name">' + esc(c.name) +
        '<span class="g-col-meta">' + n + ' 条 · ' + esc(c.source || '手动') + '</span></div>' +
      '<button class="btn gray sm" data-crename title="重命名">✎</button>' +
      '<button class="btn gray sm" data-cdel title="删除集合（不移除术语）">🗑</button>' +
      '</div>';
  }).join('');
  box.querySelectorAll('.g-col').forEach(el => {
    const cid = el.dataset.cid;
    el.querySelector('[data-cen]').onchange = e => {
      const c = getCollection(cid); if(c){ c.enabled = e.target.checked; saveGloss(); }
      renderGlossTable();
    };
    el.querySelector('[data-crename]').onclick = () => {
      const c = getCollection(cid); if(!c) return;
      const nm = prompt('重命名集合：', c.name); if(nm && nm.trim()){ c.name = nm.trim(); saveGloss(); renderCollections(); }
    };
    el.querySelector('[data-cdel]').onclick = () => {
      const c = getCollection(cid); if(!c) return;
      const n = GLOSS.terms.filter(t => (t.collections || []).includes(c.id)).length;
      if(!confirm('删除集合「' + c.name + '」？集合内 ' + n + ' 条术语不会被删除，只是移出集合。')) return;
      GLOSS.terms.forEach(t => { t.collections = (t.collections || []).filter(x => x !== cid); });
      GLOSS.collections = GLOSS.collections.filter(x => x.id !== cid);
      saveGloss(); renderGloss();
    };
  });
}
function openCollectionPicker(){
  const cols = GLOSS.collections || [];
  const rows = cols.map(c => {
    const n = GLOSS.terms.filter(t => (t.collections || []).includes(c.id)).length;
    const on = c.enabled !== false;
    return '<label class="gcol-pick" style="display:flex;align-items:center;gap:8px;padding:7px 6px;border-bottom:1px solid var(--bd);cursor:pointer">' +
      '<input type="checkbox" data-cid="' + esc(c.id) + '" ' + (on ? 'checked' : '') + '>' +
      '<span style="flex:1;font-weight:500">' + esc(c.name) + '</span>' +
      '<span class="muted sm">' + n + ' 条</span></label>';
  }).join('');
  modal('📚 选择翻译集合',
    (cols.length ? rows : '<div class="muted" style="padding:8px 4px">暂无集合 — 请到「专有译词库」页点「📂 智能扫描文件」导入，会自动建立集合。</div>') +
    '<div class="gcol-tip muted sm" style="margin-top:8px">勾选的集合，翻译/校对时其内「已确认」术语会被锁定一致。</div>' +
    '<div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">' +
      '<button class="btn gray sm" onclick="closeModal()">取消</button>' +
      '<button class="btn pri sm" id="gcol-done">完成</button></div>');
  $('#gcol-done').onclick = () => {
    $$('#mBody input[data-cid]').forEach(b => {
      const c = getCollection(b.dataset.cid); if(c) c.enabled = b.checked;
    });
    saveGloss(); renderGloss();
    closeModal();
    const active = cols.filter(c => c.enabled !== false).length;
    toast(active ? ('已启用 ' + active + ' 个集合，术语锁定会注入其中术语。') : '已停用全部集合，集合术语不再注入。');
  };
}
function glossFiltered(){
  let list = GLOSS.terms.slice();
  const q = normText($('#g-q') ? $('#g-q').value : '').toLowerCase();
  const st = $('#g-f-status') ? $('#g-f-status').value : '';
  const rc = $('#g-f-rec') ? $('#g-f-rec').value : '';
  const sr = $('#g-f-src') ? $('#g-f-src').value : '';
  const tg = $('#g-f-tag') ? $('#g-f-tag').value : '';
  const ty = $('#g-f-type') ? $('#g-f-type').value : '';
  if(q) list = list.filter(t =>
    t.zh.toLowerCase().includes(q) || (t.foreign||'').toLowerCase().includes(q) ||
    (t.aliases||[]).some(a => a.toLowerCase().includes(q)) || (t.note||'').toLowerCase().includes(q));
  if(st) list = list.filter(t => (t.status||'pending') === st);
  if(rc) list = list.filter(t => (t.recommend||'') === rc);
  if(sr) list = list.filter(t => (t.sources||[]).indexOf(sr) >= 0);
  if(tg) list = list.filter(t => (t.tags||[]).indexOf(tg) >= 0);
  if(ty) list = list.filter(t => (t.type||'') === ty);
  const cl = $('#g-f-col') ? $('#g-f-col').value : '';
  if(cl) list = list.filter(t => (t.collections||[]).includes(cl));
  if(G_SORT.key){
    const k = G_SORT.key;
    list.sort((a,b) => {
      const av = String(a[k]||''), bv = String(b[k]||'');
      return av.localeCompare(bv, 'zh') * G_SORT.dir;
    });
  }
  return list;
}
function renderGlossStats(){
  const t = GLOSS.terms;
  const confirmed = t.filter(x=>x.status==='confirmed').length;
  const pending = t.filter(x=>x.status==='pending'||!x.status).length;
  const rec = t.filter(x=>x.recommend==='rec').length;
  const conflicts = t.filter(x=>(x.note||'').indexOf('⚠')>=0).length;
  $('#g-stats-bar').innerHTML = '<span>词条 <b>' + t.length + '</b></span>' +
    '<span>来源 <b>' + GLOSS.sources.length + '</b></span>' +
    '<span>已确认 <b style="color:var(--ok)">' + confirmed + '</b></span>' +
    '<span>待审核 <b style="color:var(--warn)">' + pending + '</b></span>' +
    '<span>推荐译名 <b style="color:var(--ac)">' + rec + '</b></span>' +
    (conflicts ? '<span>⚠ 冲突 <b style="color:var(--err)">' + conflicts + '</b></span>' : '');
}
function renderGlossFilters(){
  // 来源下拉
  const srcSel = $('#g-f-src'); const curSrc = srcSel.value;
  srcSel.innerHTML = '<option value="">全部来源</option>' +
    GLOSS.sources.map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('');
  srcSel.value = curSrc;
  // 标签下拉（收集全部标签）
  const tagSet = new Set();
  GLOSS.terms.forEach(t => (t.tags||[]).forEach(x => tagSet.add(x)));
  const tagSel = $('#g-f-tag'); const curTag = tagSel.value;
  tagSel.innerHTML = '<option value="">全部标签</option>' +
    Array.from(tagSet).sort().map(x => '<option value="' + esc(x) + '">' + esc(x) + '</option>').join('');
  tagSel.value = curTag;
  // 集合下拉
  const colSel = $('#g-f-col'); const curCol = colSel.value;
  colSel.innerHTML = '<option value="">全部集合</option>' +
    (GLOSS.collections || []).map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
  colSel.value = curCol;
}
function renderGlossTable(){
  const list = glossFiltered();
  $('#g-count').textContent = list.length + ' / ' + GLOSS.terms.length + ' 条';
  const tb = $('#g-tbody');
  if(!list.length){
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--tx3);padding:24px">（无匹配词条）</td></tr>';
    return;
  }
  tb.innerHTML = list.map(t => {
    const srcNames = (t.sources||[]).map(sid => {
      const s = GLOSS.sources.find(x => x.id === sid);
      return s ? s.name : '?';
    }).join('、');
    const pages = (t.occurrences||[]).reduce((a,o)=>a.concat(o.pages||[]), []).slice(0,6).join(',');
    const recLabel = t.recommend === 'rec' ? '<span class="r">★推荐</span>' : t.recommend === 'ban' ? '<span class="b">禁用</span>' : '<span class="a">允许</span>';
    return '<tr data-id="' + t.id + '" class="' + (G_SEL.has(t.id) ? 'sel' : '') + '">' +
      '<td><input type="checkbox" data-ck style="width:auto;padding:0" ' + (G_SEL.has(t.id) ? 'checked' : '') + '></td>' +
      '<td style="font-weight:500">' + esc(t.zh || '—') + (pages ? '<div class="g-alias">pp.' + esc(pages) + '</div>' : '') + '</td>' +
      '<td style="color:var(--tx2)">' + esc(t.foreign || '—') + '</td>' +
      '<td class="g-alias">' + (t.aliases||[]).map(esc).join('、') + '</td>' +
      '<td>' + esc(t.type || '—') + '</td>' +
      '<td>' + (t.tags||[]).map(x => '<span class="g-tag">' + esc(x) + '</span>').join('') + '</td>' +
      '<td class="g-src" title="' + esc(srcNames) + '">' + esc(srcNames) + '</td>' +
      '<td><span class="g-status ' + (t.status||'pending') + '">' + (G_ST_LABEL[t.status||'pending']) + '</span>' +
        '<div style="display:flex;gap:4px;margin-top:4px">' +
          (t.status !== 'confirmed' ? '<button class="btn gray sm" data-approve title="批准此条，校对时锁定一致（M4）">✓ 批准</button>' : '') +
          (t.status !== 'pending' ? '<button class="btn gray sm" data-topend title="打回待审核（改词/存疑都先回这里）">↺ 待审</button>' : '') +
          (t.status !== 'rejected' ? '<button class="btn gray sm" data-toreject title="拒绝此条，不再注入提示词">✗ 拒绝</button>' : '') +
        '</div></td>' +
      '<td class="g-rec">' + recLabel + '</td>' +
      '<td style="white-space:nowrap">' + (t.url ? '<a class="btn gray sm" href="' + esc(t.url) + '" target="_blank" rel="noopener" title="查看依据 URL">🔗</a> ' : '<button class="btn gray sm" data-gv-url2 title="回填依据 URL">🔗</button> ') + '<button class="btn gray sm" data-lookup title="联网查证通行译法">🔎</button> <button class="btn gray sm" data-verify title="AI 核查该条收录是否正确（v4.26.0）">🤖 核查</button> <button class="btn gray sm" data-edit>编辑</button> <button class="btn gray sm" data-merge1 title="把另一条合并进此条">⇄</button> <button class="btn gray sm" data-del title="删除此条">🗑</button></td>' +
      '</tr>';
  }).join('');
  // 行事件
  tb.querySelectorAll('tr').forEach(tr => {
    const t = GLOSS.terms.find(x => String(x.id) === tr.dataset.id);
    if(!t) return;
    const id = t.id;
    tr.querySelector('[data-ck]').onchange = e => {
      if(e.target.checked) G_SEL.add(id); else G_SEL.delete(id);
      tr.classList.toggle('sel', e.target.checked);
      renderGlossBatch();
    };
    tr.querySelector('[data-lookup]').onclick = () => glossLookup(id);
    const bUrl2 = tr.querySelector('[data-gv-url2]'); if(bUrl2) bUrl2.onclick = () => { if(typeof gvSetUrl === 'function') gvSetUrl(t); };
    const bAp = tr.querySelector('[data-approve]'); if(bAp) bAp.onclick = () => glossSetStatus(id, 'confirmed');
    const bPd = tr.querySelector('[data-topend]'); if(bPd) bPd.onclick = () => glossSetStatus(id, 'pending');
    const bRj = tr.querySelector('[data-toreject]'); if(bRj) bRj.onclick = () => glossSetStatus(id, 'rejected');
    tr.querySelector('[data-verify]').onclick = async () => {
      const items = [{ src: t.foreign || '', dst: t.zh || '', extra: t.type || '' }];
      const vs = await verifyEntries(items, tr.querySelector('[data-verify]'));
      if(!vs) return;
      showVerifyResults(items, vs, {
        // M4：ok → 一键批准为「已批准」；bad/采纳建议 → 打回待审核
        onApprove: () => { glossSetStatus(t.id, 'confirmed'); },
        onAdopt: (k, v) => {
          if(!v.suggest) return false;
          t.zh = v.suggest; t.status = 'pending';
          saveGloss(); glossLog('status', 'term:'+t.id, 'adopt', 'pending');
          renderGlossTable();
          toast('已改为建议译法，状态回到「待审核」');
          return true;
        }
      });
    };
    tr.querySelector('[data-edit]').onclick = () => glossEdit(id);
    tr.querySelector('[data-merge1]').onclick = () => glossMergeInto(id);
    tr.querySelector('[data-del]').onclick = () => glossDelete(id);
  });
  renderGlossBatch();
}
function renderGlossBatch(){
  const bar = $('#g-batch');
  const has = G_SEL.size > 0;
  $('#g-sel-n').textContent = G_SEL.size;
  // 批量栏常显：未勾选时按钮禁用，勾选后启用（解决「找不到批量入口」的发现性问题）
  bar.querySelectorAll('button').forEach(b => { b.disabled = !has; });
}

// ── 单条删除词条 ──
function glossDelete(id){
  const t = GLOSS.terms.find(x => String(x.id) === String(id));
  if(!t) return;
  const label = t.zh || t.foreign || ('#' + id);
  if(!confirm('删除词条「' + label + '」？不可恢复。')) return;
  GLOSS.terms = GLOSS.terms.filter(x => String(x.id) !== String(id));
  G_SEL.delete(id);
  saveGloss(); renderGloss(); toast('已删除「' + label + '」');
}

// ── M4（T-012）单条状态迁移：待审 ⇄ 已批准 ⇄ 已拒绝，toast + 持久化 + 变更日志 ──
const G_ST_LABEL = { pending:'待审核', confirmed:'已批准', rejected:'已拒绝' };
function glossSetStatus(id, status){
  const t = GLOSS.terms.find(x => String(x.id) === String(id));
  if(!t) return false;
  const label = t.zh || t.foreign || ('#' + id);
  if(t.status === status){ toast('「' + label + '」已是「' + G_ST_LABEL[status] + '」'); return false; }
  const before = t.status || 'pending';
  t.status = status;
  t.updated = Date.now();
  saveGloss();
  glossLog('status', 'term:' + t.id, before, status);
  renderGlossTable();
  toast('「' + label + '」→ ' + G_ST_LABEL[status] + (status === 'confirmed' ? '（校对时会被锁定一致）' : '（不再注入提示词）'));
  return true;
}

// ── 争议术语联网查证（P2 #8）──
function glossLookup(id){
  const t = GLOSS.terms.find(x => String(x.id) === String(id));
  if(!t){ toast('术语不存在', 'e'); return; }
  const f = (t.foreign || '').trim();
  const z = (t.zh || '').trim();
  if(!f && !z){ toast('该术语没有可查证的文字', 'w'); return; }
  // 外文 + 中文一起检索，提高学术库命中率
  const q = [f, z].filter(Boolean).join(' ');
  const urls = {
    scholar: 'https://scholar.google.com/scholar?q=' + encodeURIComponent(q),
    baidu: 'https://xueshu.baidu.com/s?wd=' + encodeURIComponent(q),
    cnki: 'https://kns.cnki.net/kns8s/defaultresult/index?kw=' + encodeURIComponent(q),
    wiki: 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(f || z),
  };
  modal('🔎 术语查证', [
    '<div style="font-size:13px;color:var(--tx2);margin-bottom:6px">查证术语</div>',
    '<div style="font-size:15px;font-weight:600;margin-bottom:12px">' + esc(f || '—') + (z ? '　<span style="color:var(--tx2);font-weight:400">' + esc(z) + '</span>' : '') + '</div>',
    '<div style="font-size:12px;color:var(--tx3);margin-bottom:14px">在学术库检索该术语的通行译法与用法（新标签页打开，不消耗 token）</div>',
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn sm" data-lk="scholar">🔍 Google Scholar</button>' +
      '<button class="btn sm" data-lk="baidu">🔍 百度学术</button>' +
      '<button class="btn sm" data-lk="cnki">🔍 CNKI 知网</button>' +
      '<button class="btn sm" data-lk="wiki">🔍 维基百科</button>' +
      '<button class="btn gray" data-lk="close">关闭</button>' +
    '</div>'
  ].join(''));
  $$('#mBody [data-lk]').forEach(b => {
    b.onclick = () => { b.dataset.lk === 'close' ? closeModal() : window.open(urls[b.dataset.lk], '_blank'); };
  });
}

// ── 词条编辑弹层 ──
function glossEdit(id){
  const t = GLOSS.terms.find(x => x.id === id); if(!t) return;
  const allTags = new Set(); GLOSS.terms.forEach(x => (x.tags||[]).forEach(g => allTags.add(g)));
  modal('编辑词条 #' + t.id, [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
    '<div><label class="f">中文主词形（推荐译名）</label><input id="ge-zh" value="' + esc(t.zh) + '"></div>',
    '<div><label class="f">外文原文</label><input id="ge-fn" value="' + esc(t.foreign) + '"></div>',
    '<div><label class="f">类型</label><select id="ge-type">' + ['人物','概念','著作','学派','机构','事件','其他'].map(x =>
      '<option ' + (t.type===x?'selected':'') + '>' + x + '</option>').join('') + '</select></div>',
    '<div><label class="f">推荐度</label><select id="ge-rec"><option value="">（未设置）</option><option value="rec" ' + (t.recommend==='rec'?'selected':'') + '>★ 推荐译名</option><option value="allow" ' + (t.recommend==='allow'?'selected':'') + '>允许使用</option><option value="ban" ' + (t.recommend==='ban'?'selected':'') + '>🚫 禁用译名</option></select></div>',
    '</div>',
    '<div style="margin-top:10px"><label class="f">别名 / 异译（每行一个）</label><textarea id="ge-alias" rows="2">' + esc((t.aliases||[]).join('\n')) + '</textarea></div>',
    '<div style="margin-top:10px"><label class="f">标签（逗号分隔；已有：' + esc(Array.from(allTags).join('、') || '无') + '）</label><input id="ge-tags" value="' + esc((t.tags||[]).join(',')) + '"></div>',
    '<div style="margin-top:10px"><label class="f">状态</label><select id="ge-st">' +
      '<option value="pending" ' + (t.status==='pending'?'selected':'') + '>待审核</option>' +
      '<option value="confirmed" ' + (t.status==='confirmed'?'selected':'') + '>已确认</option>' +
      '<option value="rejected" ' + (t.status==='rejected'?'selected':'') + '>已拒绝</option></select></div>',
    '<div style="margin-top:10px"><label class="f">依据 URL（证明这条译法的真链接，可留空）</label><input id="ge-url" value="' + esc(t.url||'') + '" placeholder="https://…"></div>',
    '<div style="margin-top:10px"><label class="f">备注</label><textarea id="ge-note" rows="2">' + esc(t.note||'') + '</textarea></div>',
    '<div style="margin-top:14px;display:flex;gap:8px"><button class="btn pri sm" id="ge-save">保存</button>' +
    '<button class="btn sm" id="ge-autotag">🏷 自动打标签</button>' +
    '<span style="flex:1"></span><button class="btn gray sm" id="ge-del">🗑 删除词条</button></div>'
  ].join(''));
  $('#ge-save').onclick = () => {
    const before = JSON.stringify({ zh:t.zh, foreign:t.foreign, status:t.status, recommend:t.recommend });
    t.zh = normText($('#ge-zh').value); t.foreign = normText($('#ge-fn').value);
    t.type = $('#ge-type').value; t.recommend = $('#ge-rec').value;
    t.aliases = $('#ge-alias').value.split('\n').map(s => s.trim()).filter(Boolean);
    t.tags = $('#ge-tags').value.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    t.status = $('#ge-st').value;
    t.url = normText($('#ge-url').value);
    t.note = $('#ge-note').value;
    t.updated = Date.now();
    saveGloss(); glossLog('edit', 'term:'+t.id, before, JSON.stringify({ zh:t.zh, foreign:t.foreign, status:t.status, recommend:t.recommend }));
    closeModal(); renderGloss(); toast('已保存');
  };
  $('#ge-autotag').onclick = () => {
    const n = applyAutoTags(t);
    $('#ge-tags').value = (t.tags||[]).join(',');
    toast(n ? '打了 ' + n + ' 个标签' : '无新标签命中');
  };
  $('#ge-del').onclick = () => {
    GLOSS.terms = GLOSS.terms.filter(x => x.id !== t.id);
    G_SEL.delete(t.id);
    saveGloss(); glossLog('delete', 'term:'+t.id, JSON.stringify({zh:t.zh,foreign:t.foreign}), null);
    closeModal(); renderGloss(); toast('已删除');
  };
}

// ── 合并核心：把 ids 里的词条并入 targetId ──
function mergeTermsInto(targetId, ids){
  const tgt = GLOSS.terms.find(t => t.id === targetId);
  if(!tgt) return 0;
  const before = ids.map(id => JSON.stringify(GLOSS.terms.find(t=>t.id===id)));
  for(const id of ids){
    const s = GLOSS.terms.find(x => x.id === id); if(!s) continue;
    if(s.zh && s.zh !== tgt.zh && !(tgt.aliases||[]).includes(s.zh)) (tgt.aliases = tgt.aliases||[]).push(s.zh);
    (s.aliases||[]).forEach(a => { if(a !== tgt.zh && !(tgt.aliases||[]).includes(a)) tgt.aliases.push(a); });
    if(!tgt.foreign && s.foreign) tgt.foreign = s.foreign;
    (s.sources||[]).forEach(x => { if(tgt.sources.indexOf(x) < 0) tgt.sources.push(x); });
    (s.occurrences||[]).forEach(o => tgt.occurrences.push(o));
    (s.tags||[]).forEach(x => { if((tgt.tags||[]).indexOf(x) < 0) tgt.tags.push(x); });
    if(s.note) tgt.note = (tgt.note ? tgt.note + '；' : '') + s.note;
  }
  GLOSS.terms = GLOSS.terms.filter(x => !ids.includes(x.id));
  ids.forEach(id => G_SEL.delete(id));
  tgt.updated = Date.now();
  saveGloss(); glossLog('merge', 'term:'+targetId, before.join('\n'), JSON.stringify({ zh:tgt.zh, foreign:tgt.foreign, aliases:tgt.aliases }));
  return ids.length;
}

// ── 合并：把 A 并入 B ──
function glossMergeInto(targetId){
  const others = GLOSS.terms.filter(t => t.id !== targetId);
  if(!others.length){ toast('没有其他词条可合并', 'e'); return; }
  const tgt = GLOSS.terms.find(t => t.id === targetId);
  modal('合并到「' + (tgt.zh||tgt.foreign) + '」', [
    '<p style="font-size:12.5px;color:var(--tx2);margin-bottom:10px">选择要被合并进来的词条（被选中的词条将消失，其别名 / 标签 / 来源 / 页码全部并入目标词条）：</p>',
    '<div style="max-height:40vh;overflow:auto;border:1px solid var(--bd);border-radius:6px">' +
    others.map(t => '<label style="display:flex;gap:8px;padding:7px 10px;border-bottom:1px solid var(--bd);cursor:pointer;align-items:center">' +
      '<input type="checkbox" data-mid="' + t.id + '" style="width:auto;padding:0">' +
      '<b>' + esc(t.zh||'—') + '</b><span style="color:var(--tx3)">' + esc(t.foreign||'') + '</span>' +
      '<span class="g-alias">' + (t.aliases||[]).map(esc).join('、') + '</span></label>').join('') +
    '</div>',
    '<div style="margin-top:12px"><button class="btn pri sm" id="gm-go">执行合并</button> <button class="btn gray sm" id="gm-cancel">取消</button></div>'
  ].join(''));
  $('#gm-cancel').onclick = closeModal;
  $('#gm-go').onclick = () => {
    const ids = Array.from(document.querySelectorAll('[data-mid]:checked')).map(x => +x.dataset.mid);
    if(!ids.length){ toast('先勾选要合并的词条', 'e'); return; }
    const n = mergeTermsInto(targetId, ids);
    closeModal(); renderGloss(); toast('已合并 ' + n + ' 条');
  };
}

// ── 批量操作 ──
function glossBatch(fn){
  const ids = Array.from(G_SEL);
  let n = 0;
  for(const id of ids){ const t = GLOSS.terms.find(x => x.id === id); if(t && fn(t) !== false) n++; }
  if(n){ saveGloss(); renderGloss(); }
  toast('已更新 ' + n + ' 条');
}

// ── 导入向导 ──
$('#btn-g-import').onclick = () => $('#g-file').click();
$('#g-file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if(!f) return;
  const btn = $('#btn-g-import');
  btn.disabled = true; btn.textContent = '⏳ 解析中…';
  try{
    const parsed = await parseGlossFile(f);
    // 预览 + 确认
    const sample = parsed.entries.slice(0, 15);
    modal('导入预览 · ' + f.name + '（共识别 ' + parsed.entries.length + ' 条）', [
      '<div class="g-preview"><table><tr><th>中文</th><th>外文</th><th>页码</th><th>附加</th></tr>' +
      sample.map(x => '<tr><td>' + esc(x.zh||'—') + '</td><td>' + esc(x.foreign||'—') + '</td><td>' + esc((x.pages||[]).join(',')) + '</td><td style="color:var(--tx3)">' + esc(x.cat || x.note || '') + '</td></tr>').join('') +
      (parsed.entries.length > 15 ? '<tr><td colspan="4" style="color:var(--tx3)">… 其余 ' + (parsed.entries.length-15) + ' 条略</td></tr>' : '') +
      '</table></div>',
      '<p style="font-size:12px;color:var(--tx3);margin:10px 0">入库时自动：繁体转简体、全半角统一、外文相同的词条自动合并别名。</p>',
      '<div style="display:flex;gap:8px"><button class="btn pri sm" id="gi-go">✓ 确认导入</button>' +
      '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;cursor:pointer"><input type="checkbox" id="gi-autotag" checked style="width:auto"> 导入后自动打标签</label></div>'
    ].join(''));
    $('#gi-go').onclick = async () => {
      const doAutoTag = !!(document.querySelector('#gi-autotag') && document.querySelector('#gi-autotag').checked);
      closeModal();
      const r = await glossIngest(parsed);
      if(doAutoTag){ const n = applyAutoTagsAll(); if(n) saveGloss(); }
      btn.disabled = false; btn.textContent = '📂 导入索引 / 术语库';
      renderGloss();
      toast('导入完成：新增 ' + r.added + '，合并 ' + r.merged + (r.conflicts ? '，⚠冲突 ' + r.conflicts : '') + (r.aliasAdded ? '，别名 +' + r.aliasAdded : ''));
    };
  }catch(err){
    btn.disabled = false; btn.textContent = '📂 导入索引 / 术语库';
    toast('导入失败：' + err.message, 'e');
  }
};

// ── 智能扫描文件（LLM 抽词 → 自动建集合）──
$('#btn-g-scan').onclick = () => $('#g-scan-file').click();
$('#g-scan-file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if(!f) return;
  const btn = $('#btn-g-scan');
  btn.disabled = true; btn.textContent = '🤖 扫描中…';
  try{
    const r = await smartScanFile(f, (msg) => { btn.textContent = '🤖 ' + msg; });
    btn.disabled = false; btn.textContent = '🤖 智能扫描文件';
    if(r && r.total){
      toast('智能扫描完成：抽取 ' + r.total + ' 条术语 → 集合（新增 ' + r.added + '，合并 ' + r.merged + '）。高置信度已自动确认，低置信度请到词条列表人工审核。');
    }
  }catch(err){
    btn.disabled = false; btn.textContent = '🤖 智能扫描文件';
    toast('智能扫描失败：' + err.message, 'e');
  }
};

// ── 自动标签规则管理 ──
$('#btn-g-rules').onclick = () => {
  ensureRules();
  modal('自动标签规则（正则匹配 中文/外文/别名 → 打标签）', [
    '<div style="max-height:44vh;overflow:auto" id="gr-list">' +
    GLOSS.rules.map((r,i) => '<div style="display:flex;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--bd)">' +
      '<input type="checkbox" data-ri="' + i + '" ' + (r.on!==false?'checked':'') + ' style="width:auto;padding:0" title="启用">' +
      '<input data-rp="' + i + '" value="' + esc(r.pattern) + '" style="flex:1;font-family:var(--f-mono);font-variant-numeric:tabular-nums;font-size:12px" placeholder="正则">' +
      '<span style="color:var(--tx3)">→</span>' +
      '<input data-rt="' + i + '" value="' + esc(r.tag) + '" style="flex:0 0 150px" placeholder="标签名">' +
      '<button class="btn gray sm" data-rd="' + i + '">✕</button></div>').join('') +
    '</div>',
    '<div style="margin-top:10px;display:flex;gap:8px"><button class="btn sm" id="gr-add">+ 新增规则</button>' +
    '<button class="btn pri sm" id="gr-apply">保存并对全部词条重新打标</button>' +
    '<button class="btn gray sm" id="gr-saveonly">仅保存规则</button></div>'
  ].join(''));
  GLOSS.rules.forEach((r,i) => {
    const row = document.querySelector('[data-ri="' + i + '"]');
    if(row) row.onchange = e => r.on = e.target.checked;
    const rp = document.querySelector('[data-rp="' + i + '"]'); if(rp) rp.onchange = e => r.pattern = e.target.value;
    const rt = document.querySelector('[data-rt="' + i + '"]'); if(rt) rt.onchange = e => r.tag = e.target.value;
    const rd = document.querySelector('[data-rd="' + i + '"]'); if(rd) rd.onclick = () => { GLOSS.rules.splice(i,1); saveGloss(); closeModal(); $('#btn-g-rules').click(); };
  });
  $('#gr-add').onclick = () => { GLOSS.rules.push({ id:'r'+Date.now(), pattern:'', tag:'', on:true }); saveGloss(); closeModal(); $('#btn-g-rules').click(); };
  $('#gr-saveonly').onclick = () => { saveGloss(); closeModal(); toast('规则已保存'); };
  $('#gr-apply').onclick = () => {
    saveGloss();
    const n = applyAutoTagsAll();
    closeModal(); toast('规则已保存，新打标签 ' + n + ' 个');
  };
};

// ── 统计 ──
$('#btn-g-stats').onclick = () => {
  const t = GLOSS.terms;
  const byType = {}, byTag = {}, bySrc = {};
  t.forEach(x => { byType[x.type||'未分类'] = (byType[x.type||'未分类']||0)+1; (x.tags||[]).forEach(g => byTag[g]=(byTag[g]||0)+1); });
  GLOSS.sources.forEach(s => bySrc[s.name] = t.filter(x => (x.sources||[]).indexOf(s.id)>=0).length);
  const rows = arr => Object.entries(arr).sort((a,b)=>b[1]-a[1]).map(([k,v]) => '<tr><td>' + esc(k) + '</td><td>' + v + '</td></tr>').join('');
  modal('词库统计', [
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;font-size:12.5px">',
    '<div><b>按类型</b><table class="g-preview" style="margin-top:6px">' + rows(byType) + '</table></div>',
    '<div><b>按标签</b><table class="g-preview" style="margin-top:6px">' + rows(byTag) + '</table></div>',
    '<div><b>按来源</b><table class="g-preview" style="margin-top:6px">' + rows(bySrc) + '</table></div>',
    '</div>',
    '<p style="font-size:11.5px;color:var(--tx3);margin-top:10px">变更日志：' + GLOSS.log.length + ' 条（最近 ' + Math.min(5, GLOSS.log.length) + ' 条：' +
    GLOSS.log.slice(0,5).map(l => l.action + '@' + new Date(l.t).toLocaleTimeString('zh-CN')).join('；') + '）</p>'
  ].join(''));
};

// ── 导出 ──
$('#btn-g-export').onclick = () => {
  const list = glossFiltered();
  if(!list.length){ toast('当前筛选下无词条', 'e'); return; }
  modal('导出 ' + list.length + ' 条（按当前筛选）', [
    '<p style="font-size:12px;color:var(--tx3);margin-bottom:10px">CSV / Excel 的列结构与术语库导入兼容（src,外文 / dst,中文 / cat,类型 / note,备注）。</p>',
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">' +
    ['csv:CSV 表格', 'xlsx:Excel 工作簿', 'json:JSON 数组', 'md:Markdown 索引', 'docx:Word 索引', 'tbx:TBX 术语库']
      .map(x => { const [k, label] = x.split(':'); return '<button class="btn" data-exp="' + k + '" style="padding:10px">' + label + '</button>'; }).join('') +
    '</div>'
  ].join(''));
  document.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => { closeModal(); glossExport(b.dataset.exp, list); });
};
async function glossExport(fmt, list){
  try{
    const stamp = today();
    if(fmt === 'csv'){
      const csv = 'src,dst,cat,note\n' + list.map(t => csvEsc(t.foreign||'') + ',' + csvEsc(t.zh||'') + ',' + csvEsc(t.type||'') + ',' + csvEsc(((t.note||'') + ((t.occurrences||[]).length ? ' [页码:' + (t.occurrences||[]).map(o=>o.pages.join('/')).join(';') + ']' : '')) )).join('\n');
      dl('译词库_' + stamp + '.csv', '\uFEFF' + csv, 'text/csv');
    } else if(fmt === 'json'){
      dl('译词库_' + stamp + '.json', JSON.stringify(list.map(t => ({ zh:t.zh, foreign:t.foreign, aliases:t.aliases, type:t.type, tags:t.tags, status:t.status, recommend:t.recommend, note:t.note, sources:(t.sources||[]).map(s => (GLOSS.sources.find(x=>x.id===s)||{}).name).filter(Boolean), pages:(t.occurrences||[]).map(o=>o.pages).flat() })), null, 2), 'application/json');
    } else if(fmt === 'md'){
      const md = '# 专有译词库导出\n\n> ' + list.length + ' 条 · ' + new Date().toLocaleString('zh-CN') + '\n\n' +
        '| 中文主词 | 外文 | 别名 | 类型 | 标签 | 状态 | 页码 |\n|---|---|---|---|---|---|---|\n' +
        list.map(t => '| ' + [t.zh, t.foreign, (t.aliases||[]).join('、'), t.type, (t.tags||[]).join('、'), ({pending:'待审',confirmed:'已确认',rejected:'已拒'}[t.status||'pending']), (t.occurrences||[]).map(o=>o.pages.join(',')).join(';')].map(x => String(x||'—').replace(/\|/g,'\\|')).join(' | ') + ' |').join('\n');
      dl('译词库_' + stamp + '.md', md, 'text/markdown');
    } else if(fmt === 'xlsx'){
      await loadLib('XLSX', ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js']);
      const ws = window.XLSX.utils.aoa_to_sheet([['src','dst','cat','aliases','tags','status','recommend','note','pages']].concat(
        list.map(t => [t.foreign||'', t.zh||'', t.type||'', (t.aliases||[]).join('、'), (t.tags||[]).join('、'), t.status||'', t.recommend||'', t.note||'', ((t.occurrences||[]).map(o=>(o.pages||[]).join(','))||[]).join(';')])));
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, '词库');
      window.XLSX.writeFile(wb, '译词库_' + stamp + '.xlsx');
    } else if(fmt === 'docx'){
      await loadLib('docx', ['https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js', 'https://unpkg.com/docx@8.5.0/build/index.umd.js']);
      const D = window.docx;
      const paras = [ new D.Paragraph({ text:'专有译词库', heading:D.HeadingLevel.HEADING_1 }),
        new D.Paragraph({ children:[ new D.TextRun({ text: list.length + ' 条 · ' + new Date().toLocaleString('zh-CN'), italics:true, color:'888888' }) ] }),
        new D.Paragraph({ text:'' }) ];
      const tableRows = [ new D.TableRow({ tableHeader:true, children: ['中文主词','外文','别名','类型','标签','页码'].map(h => new D.TableCell({ children:[ new D.Paragraph({ children:[ new D.TextRun({ text:h, bold:true }) ] }) ] })) }) ];
      list.forEach(t => {
        tableRows.push(new D.TableRow({ children: [t.zh||'', t.foreign||'', (t.aliases||[]).join('、'), t.type||'', (t.tags||[]).join('、'), (t.occurrences||[]).map(o=>o.pages.join(',')).join(';')].map(c => new D.TableCell({ children:[ new D.Paragraph({ children:[ new D.TextRun(String(c))] }) ] })) }));
      });
      const doc = new D.Document({ sections: [{ children: paras.concat([ new D.Table({ rows: tableRows, width:{ size:100, type:D.WidthType.PERCENTAGE } }) ]) }] });
      const blob = await D.Packer.toBlob(doc);
      dlBlob('译词库_' + stamp + '.docx', blob);
    } else if(fmt === 'tbx'){
      const tbx = '<?xml version="1.0" encoding="UTF-8"?>\n<martif type="TBX" xml:lang="zh">\n  <martifHeader><fileDesc><sourceDesc><p>transproof glossary export</p></sourceDesc></fileDesc></martifHeader>\n  <text><body>\n' +
        list.filter(t => t.foreign).map(t =>
          '    <termEntry id="g' + t.id + '">\n' +
          '      <langSet xml:lang="en"><tig><term>' + esc(t.foreign) + '</term></tig></langSet>\n' +
          '      <langSet xml:lang="zh"><tig><term>' + esc(t.zh) + '</term></tig></langSet>\n' +
          '    </termEntry>'
        ).join('\n') + '\n  </body></text>\n</martif>';
      dl('译词库_' + stamp + '.tbx', tbx, 'application/xml');
    }
    toast('已导出 ' + fmt.toUpperCase() + '，' + list.length + ' 条');
  }catch(err){ toast('导出失败：' + err.message, 'e'); }
}
function csvEsc(s){ s = String(s==null?'':s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; }
function dlBlob(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  // 60 秒后再回收：过早 revoke 在慢速下载 / 内嵌浏览器环境会把文件截断成损坏包
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ── 同步到术语库（核心联动）──
$('#btn-g-sync').onclick = () => {
  const cands = GLOSS.terms.filter(t => t.status === 'confirmed' && t.recommend !== 'ban' && t.foreign && t.zh);
  if(!cands.length){ toast('没有可同步的词条（需「已确认」状态且有中外文对照）', 'e'); return; }
  let added = 0, updated = 0;
  for(const t of cands){
    const ex = TERMS.find(x => x.src.toLowerCase() === t.foreign.toLowerCase());
    const noteParts = [];
    if((t.tags||[]).length) noteParts.push(t.tags.join('、'));
    if(t.aliases && t.aliases.length) noteParts.push('别名:' + t.aliases.join('、'));
    if(t.note) noteParts.push(t.note);
    const pagesStr = (t.occurrences||[]).map(o=>(o.pages||[]).join(',')).filter(Boolean).join(';');
    if(pagesStr) noteParts.push('页码:' + pagesStr);
    if(ex){ ex.dst = t.zh; ex.note = noteParts.join('；'); ex.cat = t.type || ex.cat || '其他'; updated++; }
    else { TERMS.push({ src:t.foreign, dst:t.zh, cat:t.type || '其他', note:noteParts.join('；') }); added++; }
  }
  save(LS.terms, TERMS); renderTerms();
  glossLog('sync', 'terms', null, { added, updated });
  toast('同步完成：新增 ' + added + ' 条，更新 ' + updated + ' 条 → 术语库');
};

// ── 表头排序 ──
document.querySelectorAll('#g-table th[data-sort]').forEach(th => {
  th.onclick = () => {
    const k = th.dataset.sort;
    G_SORT.dir = (G_SORT.key === k) ? -G_SORT.dir : 1;
    G_SORT.key = k;
    renderGlossTable();
  };
});
// ── 筛选事件 ──
['g-q','g-f-status','g-f-rec','g-f-src','g-f-tag','g-f-type','g-f-col'].forEach(id => {
  const el = document.getElementById(id);
  if(el) el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', renderGlossTable);
});
$('#g-f-reset').onclick = () => {
  ['g-q','g-f-status','g-f-rec','g-f-src','g-f-tag','g-f-type','g-f-col'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  renderGlossTable();
};
// ── 批量按钮 ──
$('#g-all').onchange = e => {
  const list = glossFiltered();
  if(e.target.checked) list.forEach(t => G_SEL.add(t.id)); else { list.forEach(t => G_SEL.delete(t.id)); }
  renderGlossTable();
};
$('#g-b-confirm').onclick = () => glossBatch(t => { t.status = 'confirmed'; });
$('#g-b-pend').onclick = () => glossBatch(t => { t.status = 'pending'; });
$('#g-b-reject').onclick = () => glossBatch(t => { t.status = 'rejected'; });
$('#g-b-rec').onclick = () => glossBatch(t => { t.recommend = 'rec'; });
$('#g-b-ban').onclick = () => glossBatch(t => { t.recommend = 'ban'; });
$('#g-b-merge').onclick = () => {
  const ids = Array.from(G_SEL);
  if(ids.length < 2){ toast('合并需至少勾选 2 条：第一条为目标，其余并入', 'e'); return; }
  const tgt = GLOSS.terms.find(t => t.id === ids[0]);
  if(!tgt) return;
  const mergeIds = ids.slice(1);
  if(!confirm('把选中的 ' + mergeIds.length + ' 条并入「' + (tgt.zh||tgt.foreign) + '」？其别名/标签/来源/页码会并入目标词条。')) return;
  const n = mergeTermsInto(tgt.id, mergeIds);
  renderGloss(); toast('已合并 ' + n + ' 条');
};
$('#g-b-del').onclick = () => {
  if(!G_SEL.size) return;
  if(!confirm('删除选中的 ' + G_SEL.size + ' 条词条？不可恢复。')) return;
  GLOSS.terms = GLOSS.terms.filter(t => !G_SEL.has(t.id));
  saveGloss(); G_SEL.clear(); renderGloss(); toast('已删除');
};
