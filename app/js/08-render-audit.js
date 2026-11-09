/* ═══════════ 校对阶段切换（v4.9.0：一校/二校双阶段）═══════════ */
function applyStageUI(){
  document.querySelectorAll('#stage-seg .stage-btn').forEach(b => b.classList.toggle('on', b.dataset.stage === STAGE));
  const hint = { full:'', pass1:'先清硬伤（漏译/误译/术语），不改文风', pass2:'硬伤已清，只做文风润色' }[STAGE] || '';
  $('#stage-hint').textContent = hint;
}
document.querySelectorAll('#stage-seg .stage-btn').forEach(b => {
  b.onclick = () => { STAGE = b.dataset.stage; save('tp.stage', STAGE); applyStageUI(); };
});
applyStageUI();

/* ═══════════ 错误分类统计 + 筛选（v4.9.0）═══════════ */
function parseErrorCategories(text){
  const counts = {};
  const re = /[\[【]([^\]】]{2,8})[\]】]/g;
  let m;
  while((m = re.exec(String(text || ''))) !== null){
    const k = m[1].trim();
    if(ERR_TYPES.includes(k)) counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}
function markErrorLines(){
  /* 单字类型标签：危=高风险（误译漏译增译）/ 术=术语 / 检=逻辑歧义 / 议=文风建议 */
  const TAG = {'误译':'危','漏译':'危','增译':'危','术语不一致':'术','逻辑关系':'检','歧义':'检',
               '标点格式':'检','中式英语':'议','语体不当':'议'};
  document.querySelectorAll('#out li').forEach(li => {
    const m = li.textContent.match(/^\s*[\[【]([^\]】]{2,8})[\]】]/);
    const k = m && ERR_TYPES.includes(m[1].trim()) ? m[1].trim() : '';
    li.dataset.err = k;
    if(k) li.dataset.tag = TAG[k] || '检';
  });
}
/* v4.29.0：批注去重。模型偶发退化重复（同一条修改重复 N 遍）会让用户看到刷屏的重复项，
   这里按签名（类型|片段|改法）分组，只保留首条并在其后折叠标注「×N 重复已折叠」。 */
function dedupAuditLines(){
  const seen = new Map();
  let dupN = 0;
  document.querySelectorAll('#out li[data-err]').forEach(li => {
    if(!li.dataset.err) return;
    const sig = auditParseLi(li).fp;
    if(!sig || sig === '|' || sig === '||') return;
    if(seen.has(sig)){
      dupN++;
      li.style.display = 'none'; // 折叠重复项
      li.dataset.dedup = '1';
    }else{
      seen.set(sig, li);
    }
  });
  // 给每个被折叠的组，在首条上挂一个「×N」角标，让用户知道有重复被收起
  seen.forEach(li => {
    let n = 0;
    document.querySelectorAll('#out li[data-dedup]').forEach(d => {
      if(auditParseLi(d).fp === auditParseLi(li).fp) n++;
    });
    let bd = li.querySelector('.ef-dedup');
    if(n > 0){
      if(!bd){ bd = document.createElement('span'); bd.className = 'ef-dedup'; li.appendChild(bd); }
      bd.textContent = '×' + (n + 1) + ' 重复已折叠';
      bd.title = '模型把这条修改重复输出了 ' + (n + 1) + ' 次，已只保留 1 条（重复的已隐藏，不影响你的译文）';
    }else if(bd){ bd.remove(); }
  });
  return dupN;
}
function renderErrorFilter(text){
  const cats = parseErrorCategories(text || LAST_OUT);
  const keys = Object.keys(cats);
  const seg = $('#err-filter');
  if(!keys.length){ seg.innerHTML = ''; return false; }
  const total = keys.reduce((a,k) => a + cats[k], 0);
  const fpLis = [...document.querySelectorAll('#out li[data-fp]')].filter(li => li.dataset.err);
  const doneN = fpLis.filter(li => AUDIT_FIX[li.dataset.fp]).length;
  seg.innerHTML = '<span style="font-size:12px;color:var(--tx3)">错误分类：</span>' +
    '<button class="ef-chip on" data-ef="all">全部 ' + total + '</button>' +
    keys.map(k => '<button class="ef-chip" data-ef="' + esc(k) + '">' + esc(k) + ' ' + cats[k] + '</button>').join('') +
    (fpLis.length ? '<button class="ef-chip" data-ef="unfixed">未修 ' + (fpLis.length - doneN) + '</button><span class="ef-progress">已修 ' + doneN + '/' + fpLis.length + '</span>' : '');
  seg.querySelectorAll('.ef-chip').forEach(ch => ch.onclick = () => {
    seg.querySelectorAll('.ef-chip').forEach(x => x.classList.remove('on'));
    ch.classList.add('on');
    const v = ch.dataset.ef;
    document.querySelectorAll('#out li').forEach(li => {
      const hit = (v === 'all') || (v === 'unfixed' ? !!(li.dataset.err && !AUDIT_FIX[li.dataset.fp]) : (li.dataset.err === v));
      li.style.opacity = hit ? '1' : '0.3';
      li.style.background = (hit && v !== 'all') ? 'rgba(79,140,255,.08)' : 'transparent';
      if(hit && v !== 'all'){ const d = li.closest('details'); if(d) d.open = true; }
    });
  });
  return true;
}
function renderStageNext(){
  const seg = $('#stage-next');
  if(STAGE === 'pass1'){
    if($('#c-autopass2') && $('#c-autopass2').checked){
      // 自动接力：一校完成 → 自动切二校并重跑
      seg.innerHTML = '<span style="font-size:12px;color:var(--tx3)">⚡ 已自动进入二校（文风润色）…</span>';
      STAGE = 'pass2'; save('tp.stage', STAGE); applyStageUI();
      setTimeout(() => run(), 300);
      return true;
    }
    seg.innerHTML = '<span style="font-size:12px;color:var(--tx2)">一校完成，硬伤已清 →</span><button class="btn sm" id="btn-pass2">▶ 一键进入二校（文风润色）</button>';
    $('#btn-pass2').onclick = () => { STAGE = 'pass2'; save('tp.stage', STAGE); applyStageUI(); run(); };
    return true;
  }
  seg.innerHTML = '';
  return false;
}
function renderPostBar(){
  const bar = $('#post-bar');
  if(!bar) return;
  const hasEf = $('#err-filter').innerHTML !== '';
  const hasSn = $('#stage-next').innerHTML !== '';
  bar.style.display = (hasEf || hasSn) ? 'flex' : 'none';
}

/* ═══════════ 同步到项目进度看板（v4.9.0 · 信息共享）═══════════ */
function currentTask(){
  if(PROJECT.currentId){ const t = PROJECT.tasks.find(x => x.id === PROJECT.currentId); if(t) return t; }
  return PROJECT.tasks.filter(t => t.status === 'proofreading').sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0))[0] || null;
}
function syncToProject(text, dst){
  const t = currentTask();
  if(!t) return;
  const cats = parseErrorCategories(text);
  const audit = termAudit(extractProofText(text) || dst || '', $('#src').value);
  t.proof = Object.assign({}, t.proof, {
    stage: STAGE,
    lastRun: Date.now(),
    errors: cats,
    termAudit: { conflict: audit.conflict.length, multi: audit.multi.length, used: audit.used.length },
  });
  t.updatedAt = Date.now();
  if(t.status === 'todo') t.status = 'proofreading';
  saveProject();
  renderProject();
}

/* ═══════════ Markdown 渲染（轻量） ═══════════ */
function md(s){
  if(!s) return '';
  const blocks = [];
  let t = s.replace(/```[\s\S]*?```/g, m => { blocks.push(m); return '\u0000B' + (blocks.length-1) + '\u0000'; });
  t = esc(t);
  const lines = t.split('\n');
  const o = [];
  let list = null;
  const inline = x => x
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const closeList = () => { if(list){ o.push('</' + list + '>'); list = null; } };
  for(let ln of lines){
    const s0 = ln.trim();
    if(!s0){ closeList(); continue; }
    if(/^\u0000B\d+\u0000$/.test(s0)){ closeList(); o.push('<pre style="background:var(--bg3);padding:10px;border-radius:5px;overflow-x:auto;font-size:12.5px">' + s0 + '</pre>'); continue; }
    if(/^####\s/.test(s0)){ closeList(); o.push('<h4 style="font-size:12.5px;color:var(--tx2);margin:10px 0 4px">' + inline(s0.slice(5)) + '</h4>'); continue; }
    if(/^###\s/.test(s0)){ closeList(); o.push('<h4>' + inline(s0.slice(4)) + '</h4>'); continue; }
    if(/^##\s/.test(s0)){ closeList(); o.push('<h4>' + inline(s0.slice(3)) + '</h4>'); continue; }
    if(/^#\s/.test(s0)){ closeList(); o.push('<h4>' + inline(s0.slice(2)) + '</h4>'); continue; }
    if(/^&gt;\s?/.test(s0)){ closeList(); o.push('<div class="note">' + inline(s0.replace(/^&gt;\s?/,'')) + '</div>'); continue; }
    if(/^[-*—]\s+/.test(s0)){ if(list !== 'ul'){ closeList(); o.push('<ul style="margin:4px 0 4px 20px">'); list='ul'; } o.push('<li>' + inline(s0.replace(/^[-*—]\s+/,'')) + '</li>'); continue; }
    if(/^\d+[.、]\s*/.test(s0)){ if(list !== 'ol'){ closeList(); o.push('<ol style="margin:4px 0 4px 20px">'); list='ol'; } o.push('<li>' + inline(s0.replace(/^\d+[.、]\s*/,'')) + '</li>'); continue; }
    if(/^\|.*\|$/.test(s0)){
      closeList();
      const cells = s0.slice(1,-1).split('|').map(c => c.trim());
      if(cells.every(c => /^:?-{2,}:?$/.test(c))){ continue; }
      o.push('<div class="seg">' + cells.map(inline).join(' <span style="color:var(--bd2)">│</span> ') + '</div>');
      continue;
    }
    closeList();
    o.push('<p style="margin:5px 0">' + inline(s0) + '</p>');
  }
  closeList();
  let html = o.join('');
  html = html.replace(/\u0000B(\d+)\u0000/g, (m, i) => blocks[+i]);
  return html;
}

/* ═══════════ 流式渲染节流（v4.11.0 · 防崩溃）═══════════
   原实现每个 token 都全文 md()+innerHTML，长文时 O(n²) 卡死。
   改为 120ms 节流 + 超长文本降级纯文本，结束再一次性渲染。 */
function makeStreamRenderer(el){
  let last = 0, pending = null, latest = '';
  el.style.whiteSpace = 'pre-wrap'; // 纯文本流式：保留换行
  const render = () => {
    pending = null;
    last = Date.now();
    // 纯文本 textContent：零 Markdown 解析、零 DOM 重建、零强制布局，
    // 火狐/Chrome 都扛得住长文与高频流式。结束后由调用方 md() 渲染。
    el.textContent = latest;
  };
  return (full) => {
    latest = full;
    const now = Date.now();
    if(now - last >= 150) render();
    else if(!pending) pending = setTimeout(render, 150);
  };
}

/* ═══════════ 次要区块折叠（v4.11.0 · 默认收起不占版面）═══════════
   逐条批注 / 注释建议 / 术语争议 / 待确认 → <details> 默认折叠，
   「一、修订后译文」始终主动显示。 */
function collapseSections(){
  const out = $('#out');
  if(!out) return;
  const collapsible = /(逐条批注|注释建议|术语与争议|争议点|待确认)/;
  const frag = document.createDocumentFragment();
  let details = null;
  const flush = () => { if(details){ frag.appendChild(details); details = null; } };
  [...out.childNodes].forEach(node => {
    if(node.nodeType === 1 && node.tagName === 'H4' && collapsible.test(node.textContent)){
      flush();
      details = document.createElement('details');
      details.className = 'sec-fold';
      const sum = document.createElement('summary');
      sum.textContent = node.textContent;
      details.appendChild(sum);
    } else if(details){
      details.appendChild(node);
    } else {
      frag.appendChild(node);
    }
  });
  flush();
  out.innerHTML = '';
  out.appendChild(frag);
}

/* ═══════════ 校对决策面板（v4.2.1）══════════
   解析校对/延伸输出里的"术语与争议点"词条 → 可点选译法 chips
   → 一键"应用决策并重新校对"（写入本次特别指令 + 自动重跑）═══ */
function parseDecisionPoints(text){
  const t = String(text || '');
  const pts = [];
  // 词条块：### 词条：XXX 或 **词条**：XXX，直到下一个 ### / **
  const entryRe = /(?:^|\n)#{2,4}\s*词条[：:]\s*([^\n]+)|(?:^|\n)\*\*词条[：:]\s*([^*\n]+)\*\*/g;
  let m;
  while((m = entryRe.exec(t)) !== null){
    const term = (m[1] || m[2] || '').trim();
    if(!term) continue;
    // 词条块正文：从匹配位置往后到下一个 "### 词条" 或 "## " 或文末
    const rest = t.slice(entryRe.lastIndex);
    const stop = rest.search(/\n(?:#{2,4}\s*词条|\*\*词条|#{1,2}\s)/);
    const block = stop > 0 ? rest.slice(0, stop) : rest;
    // 抓通行译法列表（在 **通行译法**： 之后）
    const cf = block.match(/\*\*?通行译法\*?\*?[：:]?\s*\n([\s\S]*?)(?=\n\*\*|\n#{2,4}|\n*$)/);
    const cands = [];
    if(cf){
      for(const line of cf[1].split('\n')){
        const lm = line.match(/^\s*[-*·]\s+(.+)/);
        if(!lm) continue;
        let c = lm[1].split(/[（(:：;]/)[0].trim().replace(/\*\*/g,'');
        if(c && c.length >= 1 && c.length <= 24 && !/^(译法|其一|其二)/.test(c)) cands.push(c);
      }
    }
    if(cands.length < 2) continue;
    // 模型推荐（默认选中）
    const rec = (block.match(/\*\*?本语境推荐\*?\*?[：:]\s*([^\n（(，,。;；]+)/) || [])[1];
    pts.push({ term, cands: [...new Set(cands)], rec: (rec||'').trim() });
  }
  return pts;
}
function renderDecisionPanel(text){
  const panel = $('#decision-panel');
  const pts = parseDecisionPoints(text);
  if(!pts.length){ panel.style.display = 'none'; return; }
  panel.style.display = '';
  panel.innerHTML =
    '<div class="dp-wrap">' +
      '<div class="dp-head"><span class="step-num">⚖</span>待定夺译法（' + pts.length + ' 组）— 点选你要的译法，然后一键应用重校对</div>' +
      pts.map((p, i) =>
        '<div class="dp-item" data-orig="' + esc(p.term) + '" data-idx="' + i + '">' +
          '<div class="dp-term"><span class="orig">' + esc(p.term) + '</span></div>' +
          '<div class="dp-chips">' +
            p.cands.map(c =>
              '<span class="dp-chip' + (c === p.rec ? ' rec' : '') + (c === p.rec ? ' sel' : '') + '" data-val="' + esc(c) + '">' + esc(c) + '</span>'
            ).join('') +
          '</div>' +
        '</div>'
      ).join('') +
      '<div class="dp-foot">' +
        '<button class="btn pri sm" id="dp-apply">▶ 应用所选并重新校对</button>' +
        '<button class="btn sm" id="dp-verify" title="AI 逐词核查当前选中的译法是否正确，坏译法标出并可一键换成建议值（v4.26.0）">🤖 核查选项</button>' +
        '<button class="btn sm" id="dp-importall" title="点选过的用点选译法，没点选的用推荐译法，全部写入术语库">📥 一键全部入术语库</button>' +
        '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--tx2);cursor:pointer"><input type="checkbox" id="dp-tolib" checked style="width:auto">选中的同时入术语库</label>' +
        '<span class="dp-hint">未选的组保持现状不改动</span>' +
      '</div>' +
    '</div>';
  // chip 点选（单选语义，可再点取消）
  panel.querySelectorAll('.dp-chip').forEach(ch => ch.onclick = () => {
    const item = ch.closest('.dp-item');
    const was = ch.classList.contains('sel');
    item.querySelectorAll('.dp-chip').forEach(x => x.classList.remove('sel'));
    if(!was) ch.classList.add('sel');
    updateDpCount();
  });
  const updateDpCount = () => {
    const n = panel.querySelectorAll('.dp-chip.sel').length;
    $('#dp-apply').textContent = n ? '▶ 应用所选（' + n + ' 项）并重新校对' : '▶ 应用所选并重新校对';
  };
  updateDpCount();
  // P1 收录核查（v4.26.0）：逐词核查当前选中（或推荐）译法，坏译法可一键换成建议值
  $('#dp-verify').onclick = async () => {
    const items = pts.map((p, i) => {
      const item = panel.querySelectorAll('.dp-item')[i];
      const sel = item && item.querySelector('.dp-chip.sel');
      return { src: p.term, dst: sel ? sel.dataset.val : (p.rec || '') };
    }).filter(x => x.dst);
    if(!items.length){ toast('没有可核查的译法', 'w'); return; }
    const vs = await verifyEntries(items, $('#dp-verify'));
    if(!vs) return;
    showVerifyResults(items, vs, {
      note: '采用后该词自动换成建议译法并选中，再点「应用所选并重新校对」生效。',
      onAdopt: (k, v) => {
        if(!v.suggest) return false;
        const item = panel.querySelectorAll('.dp-item')[k];
        if(!item) return false;
        const holder = item.querySelector('.dp-chip') ? item.querySelector('.dp-chip').parentElement : item;
        const chip = document.createElement('span');
        chip.className = 'dp-chip sel'; chip.dataset.val = v.suggest; chip.textContent = v.suggest;
        item.querySelectorAll('.dp-chip').forEach(x => x.classList.remove('sel'));
        chip.onclick = () => {
          const was = chip.classList.contains('sel');
          item.querySelectorAll('.dp-chip').forEach(x => x.classList.remove('sel'));
          if(!was) chip.classList.add('sel');
        };
        holder.appendChild(chip);
        updateDpCount();
        toast('已换成建议译法：' + v.suggest);
        return true;
      }
    });
  };
  // 一键全部入术语库：点选过的用点选译法，未点选的用推荐译法
  $('#dp-importall').onclick = () => {
    const recMap = {}; pts.forEach(p => recMap[p.term] = p.rec || '');
    let added = 0, updated = 0;
    panel.querySelectorAll('.dp-item').forEach(item => {
      const orig = item.dataset.orig;
      const selChip = item.querySelector('.dp-chip.sel');
      const val = selChip ? selChip.dataset.val : recMap[orig];
      if(!val) return;
      const ex = TERMS.find(t => t.src.toLowerCase() === orig.toLowerCase());
      if(ex){ if(ex.dst !== val){ ex.dst = val; updated++; } }
      else { TERMS.push({ src: orig, dst: val, cat: '校对决策', note: '' }); added++; }
    });
    if(!added && !updated){ toast('没有可入库的词条', 'w'); return; }
    save(LS.terms, TERMS); renderTerms();
    toast('✓ 术语库：新增 ' + added + ' 条' + (updated ? '，更新 ' + updated + ' 条' : ''));
  };
  $('#dp-apply').onclick = () => {
    const picks = [...panel.querySelectorAll('.dp-item')].map(item => {
      const sel = item.querySelector('.dp-chip.sel');
      return sel ? { orig: item.dataset.orig, val: sel.dataset.val } : null;
    }).filter(Boolean);
    if(!picks.length){ toast('还没选择任何译法', 'w'); return; }
    // 1) 写入"本次特别指示"（保留已有内容）
    const inst = '【译者终审——以下译法按此统一，优先级最高】\n' + picks.map(p => '- ' + p.orig + ' → ' + p.val).join('\n');
    const cur = $('#extra').value.trim();
    $('#extra').value = cur ? cur + '\n\n' + inst : inst;
    // 2) 同时入术语库（若勾选）
    if($('#dp-tolib').checked){
      let added = 0;
      picks.forEach(p => {
        if(!TERMS.some(t => t.src.toLowerCase() === p.orig.toLowerCase())){
          TERMS.push({ src: p.orig, dst: p.val, cat: '校对决策', note: '' });
          added++;
        }
      });
      if(added){ save(LS.terms, TERMS); renderTerms(); toast('已入术语库 ' + added + ' 条'); }
    }
    panel.style.display = 'none';
    // 3) 自动重跑校对
    run();
  };
}

/* ═══════════ 导出 ═══════════ */
// 按 ## 标题把校对结果切成若干段，供选择性复制
function splitSections(md){
  const titles = [];
  const re = /^#{2,3}\s+[^\n]+/gm;
  let m;
  while((m = re.exec(md)) !== null){ titles.push({ title: m[0].replace(/^#{2,3}\s+/, '').trim(), pos: m.index }); }
  if(!titles.length) return [{ title: '全文', content: md.trim() }];
  return titles.map((t, i) => {
    const end = (i + 1 < titles.length) ? titles[i + 1].pos : md.length;
    return { title: t.title, content: md.slice(t.pos, end).trim() };
  });
}
function showCopyOptions(md){
  const sections = splitSections(md);
  const checks = sections.map((s, i) =>
    '<label style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-bottom:1px solid var(--bd);cursor:pointer;font-size:13px">' +
      '<input type="checkbox" class="copy-sec" data-i="' + i + '" checked style="width:auto;margin-top:3px">' +
      '<span><b>' + esc(s.title) + '</b> <span style="color:var(--tx3);font-size:11px">（' + s.content.length + ' 字）</span></span>' +
    '</label>'
  ).join('');
  modal('复制结果（勾选要复制的段落）', [
    (typeof citeBlockForDialog === 'function' ? citeBlockForDialog() : ''),
    '<div style="font-size:13px;color:var(--tx2);margin-bottom:10px">默认全选。取消勾选不需要的段落（如逐条批注、注释建议）即可只复制你想要的部分。</div>',
    '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap"><button class="btn sm gray" id="copy-all">全选</button><button class="btn sm gray" id="copy-none">全不选</button><button class="btn sm gray" id="copy-core">仅修订后译文</button></div>',
    '<div style="max-height:46vh;overflow:auto;border:1px solid var(--bd);border-radius:8px">' + checks + '</div>',
    '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="copy-do">📋 复制所选</button><button class="btn gray" id="copy-cancel">取消</button></div>'
  ].join(''));
  const box = i => document.querySelector('.copy-sec[data-i="' + i + '"]');
  $('#copy-cancel').onclick = closeModal;
  $('#copy-all').onclick = () => sections.forEach((s, i) => { box(i).checked = true; });
  $('#copy-none').onclick = () => sections.forEach((s, i) => { box(i).checked = false; });
  $('#copy-core').onclick = () => sections.forEach((s, i) => { box(i).checked = /修订后译文|终稿|定稿/.test(s.title); });
  if(typeof citeBindDialog === 'function'){ citeBindDialog(); }
  $('#copy-do').onclick = async () => {
    const picked = sections.filter((s, i) => box(i).checked);
    if(!picked.length){ toast('请至少勾选一段', 'w'); return; }
    let text = picked.map(s => s.content).join('\n\n');
    if(typeof citeBuildFromDialog === 'function'){ const h = citeBuildFromDialog(); if(h){ text = h + '\n\n' + text; } }
    try{ await navigator.clipboard.writeText(text); closeModal(); toast('已复制 ' + picked.length + ' 段（' + text.length + ' 字）'); }
    catch(e){ toast('复制失败，请手动选中文本', 'e'); }
  };
}
$('#btn-copy').onclick = () => {
  if(!LAST_OUT){ toast('还没有结果可复制'); return; }
  showCopyOptions(LAST_OUT);
};

/* ═══════════ v4.22.0 注释（脚注/尾注）：提取 → 翻译 → 按需贴入 ═══════════ */
const NOTE_SYS = '你是书籍译注翻译专家。输入是 JSON 数组：[{"i":0,"n":"1","t":"注释原文"}]。逐条把 t 翻译：原文以中文为主则译成英文，否则译成简体中文，输出 JSON 数组：[{"i":0,"tr":"注释译文"}]。要求：i 与数量原样对应，不增不减；译文忠实简洁，保持学术注释口吻；其中的 [n] 标号、页码引用（p.34）、人名、书名、引文指示词保留，书名套《》（外文书名可用引号）。只输出 JSON 数组本身，不要解释、不要代码围栏。';

/* 当前章节相关的注释：脚注按章节页码范围过滤，尾注按标号交集过滤。
   list 元素是 f.notes 的引用，翻译结果写回即保留在内存与任务快照里。 */
function currentNotes(){
  const f = __TP_FILES.src || __TP_FILES.dst;
  if(!f || !f.notes || !f.notes.length) return { f:f, list:[], marks:new Set() };
  const ch = (f._chapterIdx >= 0 && f.chapters && f.chapters[f._chapterIdx]) ? f.chapters[f._chapterIdx] : null;
  const text = ch ? ch.text : [$('#src').value, $('#dst').value, LAST_OUT, TS_LAST_OUT].filter(Boolean).join('\n');
  const marks = markersIn(text);
  const hasRange = !!(ch && ch.pageStart > 0 && ch.pageEnd >= ch.pageStart);
  const list = f.notes.filter(n => {
    if(hasRange && n.kind === 'foot') return n.page >= ch.pageStart && n.page <= ch.pageEnd;
    return marks.has(String(n.n));
  });
  return { f, list, marks };
}
function notesBlock(list, fmt){
  const rows = list.map(n => {
    const num = '[' + String(n.n) + ']';
    if(fmt === 'src') return num + ' ' + n.text;
    if(fmt === 'tr') return num + ' ' + (n.tr || n.text);
    return num + ' ' + (n.tr ? n.tr + (n.tr !== n.text ? '\n  原文：' + n.text : '') : n.text);
  });
  return '### 注释\n\n' + rows.join('\n\n');
}
/* 贴入结果末尾（先剥掉旧注释段防重复）。返回生成文本；无输出目标返回 ''。 */
function pasteNotes(list, fmt){
  if(!list || !list.length){ toast('没有可贴入的注释', 'w'); return ''; }
  const block = notesBlock(list, fmt);
  const strip = t => String(t || '').replace(/\n*\n?###\s*注释\s*\n[\s\S]*$/, '');
  if(LAST_OUT){ LAST_OUT = strip(LAST_OUT) + '\n\n' + block; $('#out').innerHTML = md(LAST_OUT); $('#outHint').textContent = '已贴入 ' + list.length + ' 条注释'; }
  else if(TS_LAST_OUT){ TS_LAST_OUT = strip(TS_LAST_OUT) + '\n\n' + block; $('#ts-out').innerHTML = md(TS_LAST_OUT); $('#ts-outHint').textContent = '已贴入 ' + list.length + ' 条注释'; }
  else { toast('先跑一次校对/翻译，再贴入注释', 'w'); return ''; }
  saveTask();
  return block;
}
function removePastedNotes(){
  const strip = t => String(t || '').replace(/\n*\n?###\s*注释\s*\n[\s\S]*$/, '');
  let ok = false;
  if(LAST_OUT && /###\s*注释\s*\n/.test(LAST_OUT)){ LAST_OUT = strip(LAST_OUT); $('#out').innerHTML = md(LAST_OUT); ok = true; }
  if(TS_LAST_OUT && /###\s*注释\s*\n/.test(TS_LAST_OUT)){ TS_LAST_OUT = strip(TS_LAST_OUT); $('#ts-out').innerHTML = md(TS_LAST_OUT); ok = true; }
  if(ok) saveTask();
  return ok;
}
function showNotesModal(){
  const { f, list, marks } = currentNotes();
  if(!f){ toast('先上传带注释的 PDF，再用本功能', 'w'); return; }
  if(!list.length){ toast('当前内容里没发现注释（标号或页底脚注区）', 'w'); return; }
  const rows = list.map((n, i) => {
    const on = marks.has(String(n.n)) ? ' checked' : '';
    return '<label style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-bottom:1px solid var(--bd);cursor:pointer;font-size:13px">' +
      '<input type="checkbox" class="fn-chk" data-i="' + i + '"' + on + ' style="width:auto;margin-top:3px">' +
      '<span style="flex:1;min-width:0"><b>[' + esc(String(n.n)) + ']</b> <span class="fn-tr" data-i="' + i + '" style="color:var(--ok)">' + esc(n.tr || '') + '</span>' +
      '<div style="color:var(--tx3);font-size:11px;margin-top:2px">' + esc(n.text.slice(0, 140)) + (n.text.length > 140 ? '…' : '') + ' · P' + n.page + (n.kind === 'end' ? ' · 尾注' : ' · 脚注') + '</div></span>' +
      '</label>';
  }).join('');
  modal('本章注释 · 共 ' + list.length + ' 条（勾选要贴入的）', [
    '<div style="font-size:13px;color:var(--tx2);margin-bottom:10px">按当前章节自动筛选（脚注按页码、尾注按标号）。先「翻译所选」，再选贴入格式追加到结果末尾。</div>',
    '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">' +
      '<button class="btn sm gray" id="fn-all">全选</button>' +
      '<button class="btn sm gray" id="fn-none">全不选</button>' +
      '<button class="btn sm pri" id="fn-tr">🌐 翻译所选</button>' +
      '<span style="font-size:12px;color:var(--tx3);margin-left:4px">贴入格式：</span>' +
      '<label style="font-size:12px"><input type="radio" name="fnfmt" value="both" checked> 译文+原文</label>' +
      '<label style="font-size:12px"><input type="radio" name="fnfmt" value="tr"> 仅译文</label>' +
      '<label style="font-size:12px"><input type="radio" name="fnfmt" value="src"> 仅原文</label>' +
    '</div>',
    '<div style="max-height:46vh;overflow:auto;border:1px solid var(--bd);border-radius:8px">' + rows + '</div>',
    '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="fn-paste">📋 贴入结果末尾</button><button class="btn gray" id="fn-unpaste">移除已贴注释</button><button class="btn gray" id="fn-cancel">关闭</button></div>'
  ].join(''));
  const box = i => document.querySelector('.fn-chk[data-i="' + i + '"]');
  $('#fn-cancel').onclick = closeModal;
  $('#fn-all').onclick = () => list.forEach((n, i) => { box(i).checked = true; });
  $('#fn-none').onclick = () => list.forEach((n, i) => { box(i).checked = false; });
  $('#fn-tr').onclick = async () => {
    const picked = list.filter((n, i) => box(i).checked);
    if(!picked.length){ toast('请至少勾选一条再翻译', 'w'); return; }
    const pending = picked.filter(n => !n.tr);
    if(!pending.length){ toast('所选注释都已有译文'); return; }
    const b = $('#fn-tr'); b.disabled = true; b.textContent = '翻译中…';
    try{
      const payload = pending.map((n, i) => ({ i:i, n:String(n.n), t:n.text }));
      const r = await callModel(NOTE_SYS, JSON.stringify(payload), null, 'gloss');
      const arr = extractJsonArray(r.text || '');
      let hit = 0;
      arr.forEach(o => { const p = pending[o.i]; if(p && o.tr){ p.tr = String(o.tr); hit++; } });
      pending.forEach(n => { const el = document.querySelector('.fn-tr[data-i="' + list.indexOf(n) + '"]'); if(el) el.textContent = n.tr || ''; });
      toast(hit ? ('已翻译 ' + hit + '/' + pending.length + ' 条') : '翻译未返回有效 JSON，可重试', hit ? '' : 'e');
    }catch(e){ toast('翻译失败：' + errMsg(e), 'e'); }
    finally{ b.disabled = false; b.textContent = '🌐 翻译所选'; }
  };
  $('#fn-paste').onclick = () => {
    const picked = list.filter((n, i) => box(i).checked);
    if(!picked.length){ toast('请至少勾选一条', 'w'); return; }
    const fmt = (document.querySelector('input[name="fnfmt"]:checked') || {}).value || 'both';
    const block = pasteNotes(picked, fmt);
    if(block){ closeModal(); toast('已贴入 ' + picked.length + ' 条注释'); }
  };
  $('#fn-unpaste').onclick = () => { removePastedNotes() ? toast('已移除贴入的注释段') : toast('结果里没有已贴入的注释段', 'w'); };
}
$('#btn-notes').onclick = showNotesModal;

/* ═══════════ 术语一致性自动体检（v4.8.0 · 本地零成本）═══════════
   借鉴 translate5 的 QA check / OpenTranslator 的 Validator：
   ① 术语库覆盖：原文中出现的术语，定稿是否用了术语库锁定译法；
   ② 一词多译：扫描定稿中「中文（外文）/ 外文（中文）」标注，
      揪出同一个外文词被译成多种中文的情况。
   纯本地字符串比对，不调用 AI，不花 token。 */
function termAudit(text, srcText){
  const t = String(text || '');
  const s = String(srcText || '').toLowerCase();
  const used = [], conflict = [], multi = [];
  TERMS.forEach(term => {
    const src = (term.src || '').trim(), dst = (term.dst || '').trim();
    if(!dst) return;
    if(t.indexOf(dst) >= 0){ used.push(term); return; }          // 已按术语库统一
    const inSrc = src && s && s.indexOf(src.toLowerCase()) >= 0;
    if(inSrc) conflict.push(term);                                // 原文用了、定稿没用术语库译法
  });
  // 一词多译：抓「中文（外文）」与「外文（中文）」对照
  const zh = '[\\u4e00-\\u9fff][\\u4e00-\\u9fff·]{0,11}';
  const en = '[A-Za-z][A-Za-z0-9\\u2019\'’\\-· ]{0,40}';
  const map = {};
  const collect = (re, ei, zi) => {
    let m;
    while((m = re.exec(t)) !== null){
      const w = m[ei].trim().replace(/[\s·]+/g,'').toLowerCase();
      const c = m[zi].trim();
      if(!w || w.length < 2 || !c) continue;
      (map[w] = map[w] || { word: m[ei].trim(), cn: new Set() }).cn.add(c);
    }
  };
  collect(new RegExp('(' + zh + ')[（(]\\s*(' + en + ')\\s*[)）]', 'g'), 2, 1);
  collect(new RegExp('(' + en + ')[（(]\\s*(' + zh + ')\\s*[)）]', 'g'), 1, 2);
  Object.values(map).forEach(v => { if(v.cn.size >= 2) multi.push({ word: v.word, cn: [...v.cn] }); });
  return { used, conflict, multi, termTotal: TERMS.length };
}

function showTermAudit(){
  const text = extractProofText(LAST_OUT) || $('#dst').value.trim();
  if(!text){ toast('请先校对，或粘贴待校对译文，再做术语体检', 'e'); return; }
  const r = termAudit(text, $('#src').value);
  const nConflict = r.conflict.length, nMulti = r.multi.length;
  const clean = !nConflict && !nMulti;
  const parts = [];
  parts.push('<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--tx2);margin-bottom:14px">' +
    '<span>术语库 <b>' + r.termTotal + '</b> 条</span>' +
    '<span>已统一使用 <b style="color:var(--ok)">' + r.used.length + '</b></span>' +
    '<span>疑似未统一 <b style="color:var(--err)">' + nConflict + '</b></span>' +
    '<span>一词多译 <b style="color:var(--err)">' + nMulti + '</b></span></div>');
  if(clean){
    parts.push('<div class="alert ok">✓ 未发现术语不一致：定稿中出现的术语均已按术语库统一，且未发现同一外文词有多种译法。</div>');
  }else{
    if(nConflict){
      parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 疑似未按术语库统一</h4>');
      parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">原文中出现了下列术语，但定稿里没用到术语库锁定译法，请人工确认是否用了其他译法。</div>');
      parts.push(r.conflict.map(t => '<div class="seg" style="font-size:13px">' + esc(t.src) + ' → 术语库译法 <b>' + esc(t.dst) + '</b></div>').join(''));
    }
    if(nMulti){
      parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 同一外文词多种译法（点选一个作为正名）</h4>');
      parts.push(r.multi.map((v,i) =>
        '<div class="seg" data-audit-idx="' + i + '" style="font-size:13px">' +
          '<div style="margin-bottom:4px"><b>' + esc(v.word) + '</b></div>' +
          '<div class="audit-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px">' +
            v.cn.map((c,j) => '<span class="dp-chip' + (j===0?' sel':'') + '" data-val="' + esc(c) + '">' + esc(c) + '</span>').join('') +
          '</div>' +
        '</div>').join(''));
    }
  }
  parts.push('<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;align-items:center">' +
    (nConflict ? '<button class="btn pri sm" id="audit-unify">⚡ 一键按术语库统一并重校</button>' : '') +
    (nMulti ? '<button class="btn pri sm" id="audit-import">📥 把选定译法入术语库</button>' : '') +
    '<button class="btn gray sm" id="audit-close">关闭</button>' +
    '<span style="font-size:12px;color:var(--tx3)">本地比对 · 不调 AI · 不花 token</span></div>');
  modal('🩺 术语一致性体检', parts.join(''));
  $('#audit-close').onclick = closeModal;
  if(nConflict){
    $('#audit-unify').onclick = () => {
      const inst = '【术语统一——以下术语强制按术语库译法，优先级最高】\n' +
        r.conflict.map(t => '- ' + t.src + ' → ' + t.dst).join('\n');
      const cur = $('#extra').value.trim();
      $('#extra').value = cur ? cur + '\n\n' + inst : inst;
      closeModal();
      toast('已写入统一指令，正在重新校对…');
      run();
    };
  }
  if(nMulti){
    document.querySelectorAll('.audit-chips').forEach(wrap => {
      wrap.querySelectorAll('.dp-chip').forEach(ch => ch.onclick = () => {
        wrap.querySelectorAll('.dp-chip').forEach(x => x.classList.remove('sel'));
        ch.classList.add('sel');
      });
    });
    $('#audit-import').onclick = () => {
      let added = 0;
      r.multi.forEach((v,i) => {
        const item = document.querySelector('[data-audit-idx="' + i + '"]');
        const sel = item.querySelector('.dp-chip.sel');
        const val = sel ? sel.dataset.val : v.cn[0];
        if(!TERMS.some(t => t.src.toLowerCase() === v.word.toLowerCase())){
          TERMS.push({ src: v.word, dst: val, cat: '术语体检', note: '' });
          added++;
        }
      });
      if(!added){ toast('这些词已在术语库中', 'w'); closeModal(); return; }
      save(LS.terms, TERMS); renderTerms();
      toast('✓ 已把 ' + added + ' 个多译词条按选定译法入术语库');
      closeModal();
    };
  }
}

/* ═══════════ 段落对齐体检（v4.31.0 · M3/T-011 · 零 token）═══════════
   原文与译文的段落序列机械比对（纯本地，不调 AI、不花 token）：
   ① 段数相等 → 逐段一一对应；
   ② 译文段数少 → 缺段：标出译文里没有对应段落的原文位置；
   ③ 译文段数多 → 多段：标出原文里没有对应段落的译文位置；
   ④ 译文中夹着整段空白 → 空段：多半是这一段整个漏掉了。
   段落切分与「三栏对照」同口径（按空行切），两边判法一致。 */
function paraAudit(srcText, dstText){
  const raw = t => String(t || '').replace(/\r/g, '').split(/\n{2,}/).map(s => s.trim());
  const trimEnds = arr => {              // 只剥首尾空壳；中间的空段留着——那是漏译现场
    const a = arr.slice();
    while(a.length && !a[0]) a.shift();
    while(a.length && !a[a.length - 1]) a.pop();
    return a;
  };
  const sp = trimEnds(raw(srcText)), dp = trimEnds(raw(dstText));
  const blanks = [];
  dp.forEach((p, i) => { if(!p) blanks.push(i + 1); });   // 译文整段空白的位置（从 1 数起）
  const s = sp.filter(Boolean), d = dp.filter(Boolean);
  const srcN = s.length, dstN = d.length;
  const status = dstN === srcN ? 'equal' : (dstN < srcN ? 'short' : 'long');
  const rows = [], n = Math.max(srcN, dstN);
  for(let i = 0; i < n; i++){
    rows.push({
      i: i + 1,
      src: i < srcN ? s[i] : '',
      dst: i < dstN ? d[i] : '',
      kind: i >= dstN ? 'missing' : (i >= srcN ? 'extra' : 'ok')
    });
  }
  return {
    srcN, dstN, diff: dstN - srcN, status, blanks,
    srcParas: sp,
    missing: rows.filter(r => r.kind === 'missing'),
    extra: rows.filter(r => r.kind === 'extra')
  };
}

function showParaAudit(){
  const srcText = $('#src').value.trim();
  const dstText = extractProofText(LAST_OUT) || $('#dst').value.trim();
  if(!srcText){ toast('请先粘贴原文，再做段落对齐体检', 'e'); return; }
  if(!dstText){ toast('请先校对，或粘贴待核对的译文，再做段落对齐体检', 'e'); return; }
  const r = paraAudit(srcText, dstText);
  const cut = (t, n) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n) + '…' : x; };
  const clean = r.status === 'equal' && !r.blanks.length;
  const parts = [];
  parts.push('<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--tx2);margin-bottom:14px">' +
    '<span>原文 <b>' + r.srcN + '</b> 段</span>' +
    '<span>译文 <b>' + r.dstN + '</b> 段</span>' +
    '<span>相差 <b style="color:var(--' + (r.diff ? 'err' : 'ok') + ')">' + (r.diff > 0 ? '+' : '') + r.diff + '</b> 段</span>' +
    '<span>判定 <b style="color:var(--' + (clean ? 'ok' : 'err') + ')">' +
      (r.status === 'equal' ? (clean ? '✓ 对齐' : '⚠ 空段') : (r.status === 'short' ? '⚠ 缺段' : '⚠ 多段')) + '</b></span></div>');
  if(clean){
    parts.push('<div class="alert ok">✓ 段落对齐：原文与译文都是 ' + r.srcN + ' 段，逐段一一对应，未发现缺段/多段/空段。</div>');
  }
  if(r.status === 'short'){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 译文比原文少 ' + (r.srcN - r.dstN) + ' 段（疑似漏译，或被并进了上一段）</h4>');
    parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">下列原文段落在译文里没有对应的段落，位置已按序号标出，请核对是整段漏了还是被合并了。</div>');
    parts.push(r.missing.map(x => '<div class="seg" style="font-size:13px">' +
      '<div style="color:var(--err);margin-bottom:4px">位置：原文第 ' + x.i + ' 段 → 译文没有对应段落</div>' +
      '原文：' + esc(cut(x.src, 160)) + '</div>').join(''));
  }
  if(r.status === 'long'){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 译文比原文多 ' + (r.dstN - r.srcN) + ' 段</h4>');
    parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">下列译文段落在原文里找不到对应，多半是被拆开或模型多写了，请核对。</div>');
    parts.push(r.extra.map(x => '<div class="seg" style="font-size:13px">' +
      '<div style="color:var(--err);margin-bottom:4px">位置：译文第 ' + x.i + ' 段 → 原文没有对应段落</div>' +
      '译文：' + esc(cut(x.dst, 160)) + '</div>').join(''));
  }
  if(r.blanks.length){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 译文里有 ' + r.blanks.length + ' 段是空的</h4>');
    parts.push(r.blanks.map(b => '<div class="seg" style="font-size:13px">' +
      '<div style="color:var(--err);margin-bottom:4px">位置：译文第 ' + b + ' 段是空的（这一段很可能整个漏了）</div>' +
      (r.srcParas[b - 1] ? '原文：' + esc(cut(r.srcParas[b - 1], 160)) : '') + '</div>').join(''));
  }
  parts.push('<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;align-items:center">' +
    '<button class="btn gray sm" id="para-close">关闭</button>' +
    '<span style="font-size:12px;color:var(--tx3)">本地比对 · 不调 AI · 不花 token</span></div>');
  modal('🧩 段落对齐体检', parts.join(''));
  $('#para-close').onclick = closeModal;
}

/* ═══════════ 数字与格式体检（T-015 · v4.33.0 · 本地零流量）══════════
    机械比对，只报可疑不下死刑：①数字丢失/被改 ②译文凭空多出 ③百分号丢失
    ④疑似漏否定（段数对齐时逐段查，对不齐退化为总量对比）。
    「1,500 → 1.5万」这类万/亿换算自动配对抵消，不误报。 */
function numAudit(srcText, dstText){
  srcText = String(srcText || ''); dstText = String(dstText || '');
  const toHalf = s => String(s || '').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 65248)).replace(/．/g, '.').replace(/，/g, ',').replace(/％/g, '%');
  const S = toHalf(srcText), D = toHalf(dstText);
  const digits = t => (t.match(/(?<![\w.])-?\d[\d,]*(?:\.\d+)?/g) || []).map(x => x.replace(/[,%]/g, ''));
  const count = arr => { const m = {}; arr.forEach(x => { m[x] = (m[x] || 0) + 1; }); return m; };
  const srcNums = digits(S), dstNums = digits(D);
  const srcM = count(srcNums), dstM = count(dstNums);
  const interesting = n => (n.match(/\d/g) || []).length >= 2;
  const snippet = (t, tok) => {
    const i = t.indexOf(tok);
    if(i < 0) return '';
    const a = Math.max(0, i - 24), b = Math.min(t.length, i + tok.length + 24);
    return (a > 0 ? '…' : '') + t.slice(a, b).replace(/\s+/g, ' ') + (b < t.length ? '…' : '');
  };
  const missing = [], extra = [];
  Object.keys(srcM).forEach(n => {
    if(!interesting(n)) return;
    if((dstM[n] || 0) < srcM[n]) missing.push({ n, sc: srcM[n], dc: dstM[n] || 0, ctx: snippet(S, n) });
  });
  Object.keys(dstM).forEach(n => {
    if(!interesting(n)) return;
    if((srcM[n] || 0) < dstM[n]) extra.push({ n, sc: srcM[n] || 0, dc: dstM[n], ctx: snippet(D, n) });
  });
  const isWan = (a, b) => {
    if(!(a > 0) || !(b > 0)) return false;
    const t = Math.max(0.01, a * 0.005);
    return Math.abs(b * 10000 - a) <= t || Math.abs(a * 10000 - b) <= t ||
           Math.abs(b * 1e8 - a) <= t || Math.abs(a * 1e8 - b) <= t;
  };
  const usedE = new Set();
  missing.forEach(m => {
    if(m.dc !== 0) return;
    for(let i = 0; i < extra.length; i++){
      const e = extra[i];
      if(e.sc !== 0 || usedE.has(i)) continue;
      if(isWan(parseFloat(m.n), parseFloat(e.n))){ m.wan = true; e.wan = true; usedE.add(i); break; }
    }
  });
  const missR = missing.filter(x => !x.wan);
  const extraR = extra.filter(x => !x.wan);
  const pctSrc = (S.match(/\d+(?:\.\d+)?\s*%/g) || []).length;
  const pctDst = (D.match(/\d+(?:\.\d+)?\s*%/g) || []).length;
  const pctZh = (D.match(/百分之/g) || []).length;
  const pctLost = pctSrc > 0 && pctDst === 0 && pctZh === 0 && !missR.some(m => srcM[m.n + '%'] !== undefined);
  const paras = t => String(t || '').replace(/\r/g, '').split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
  const NEG_EN = /\b(?:not|no|never|neither|nor|n't|without|nobody|nothing|nowhere|cannot|can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't)\b/i;
  const NEG_ZH = /[不没无非未]/;
  const negOf = t => NEG_EN.test(t) || NEG_ZH.test(t);
  const sp = paras(srcText), dp = paras(dstText);
  const negDiff = [];
  if(sp.length && sp.length === dp.length){
    sp.forEach((p, i) => { if(negOf(p) && !negOf(dp[i])) negDiff.push({ i: i + 1, src: p, dst: dp[i] }); });
  }
  const negCount = t => ((String(t).match(/\b(?:not|no|never|neither|nor)\b|n't/gi) || []).length + (String(t).match(/[不没无非未]/g) || []).length);
  const negLoose = negDiff.length === 0 && negCount(srcText) > negCount(dstText) + 1;
  const issueCount = missR.length + extraR.length + (pctLost ? 1 : 0) + negDiff.length + (negLoose ? 1 : 0);
  return {
    srcNumCount: srcNums.length, dstNumCount: dstNums.length,
    missing: missR.slice(0, 12), extra: extraR.slice(0, 12),
    pctLost, pctSrc, negDiff: negDiff.slice(0, 8), negLoose,
    negSrc: negCount(srcText), negDst: negCount(dstText),
    issueCount, clean: issueCount === 0
  };
}

function showNumAudit(){
  const srcText = $('#src').value.trim();
  const dstText = extractProofText(LAST_OUT) || $('#dst').value.trim();
  if(!srcText){ toast('请先粘贴原文，再做数字体检', 'e'); return; }
  if(!dstText){ toast('请先校对，或粘贴待核对的译文，再做数字体检', 'e'); return; }
  const r = numAudit(srcText, dstText);
  const cut = (t, n) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n) + '…' : x; };
  const parts = [];
  parts.push('<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--tx2);margin-bottom:14px">' +
    '<span>原文数字 <b>' + r.srcNumCount + '</b> 个</span>' +
    '<span>译文数字 <b>' + r.dstNumCount + '</b> 个</span>' +
    '<span>可疑 <b style="color:' + (r.issueCount ? 'var(--err)' : 'var(--tx2)') + '">' + r.issueCount + '</b> 处</span>' +
    '<span>判定 <b style="color:' + (r.clean ? 'var(--tx2)' : 'var(--err)') + '">' + (r.clean ? '✓ 未见异常' : '⚠ 需人工复核') + '</b></span></div>');
  if(r.clean){
    parts.push('<div class="alert ok">✓ 数字与格式体检：原文 ' + r.srcNumCount + ' 个数字在译文里都能对上，百分号与否定词也未见异常。</div>');
  }
  if(r.missing.length){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 丢失 / 被改动的数字 ' + r.missing.length + ' 个（原文有、译文对不上）</h4>');
    parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">译文里找不到这个数字，或出现次数变少。万/亿换算已自动抵消，仍列在这里的请逐个核对。</div>');
    parts.push(r.missing.map(x => '<div class="seg" style="font-size:13px">' +
      '<div style="color:var(--err);margin-bottom:4px">数字 <b>' + esc(x.n) + '</b>：原文出现 ' + x.sc + ' 次，译文 ' + x.dc + ' 次</div>' +
      (x.ctx ? '原文上下文：' + esc(cut(x.ctx, 120)) : '') + '</div>').join(''));
  }
  if(r.extra.length){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 译文凭空多出的数字 ' + r.extra.length + ' 个（原文没有）</h4>');
    parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">原文里没有这个数字，多半是模型编造或换算产生的。</div>');
    parts.push(r.extra.map(x => '<div class="seg" style="font-size:13px">' +
      '<div style="color:var(--err);margin-bottom:4px">数字 <b>' + esc(x.n) + '</b>：译文出现 ' + x.dc + ' 次，原文 ' + x.sc + ' 次</div>' +
      (x.ctx ? '译文上下文：' + esc(cut(x.ctx, 120)) : '') + '</div>').join(''));
  }
  if(r.pctLost){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 百分号疑似丢失</h4>' +
      '<div class="seg" style="font-size:13px">原文有 ' + r.pctSrc + ' 处百分比（%），译文里数字还在，却既没有 % 也没有「百分之」，请核对。</div>');
  }
  if(r.negDiff.length){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 疑似漏否定 ' + r.negDiff.length + ' 处（逐段核对）</h4>');
    parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">原文这一段有否定（not / 不 / 无 / 未…），对应译文段落里却一个否定词都没有——「有」译成「没有」是致命反义。</div>');
    parts.push(r.negDiff.map(x => '<div class="seg" style="font-size:13px">' +
      '<div style="color:var(--err);margin-bottom:4px">位置：第 ' + x.i + ' 段</div>' +
      '原文：' + esc(cut(x.src, 100)) + '<br>译文：' + esc(cut(x.dst, 100)) + '</div>').join(''));
  }
  if(r.negLoose){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 否定词总量明显变少（原文 ' + r.negSrc + ' 个 / 译文 ' + r.negDst + ' 个）</h4>' +
      '<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">段落数对不齐没法逐段定位，只能给总量：建议通读一遍，确认没有把「不」译丢。</div>');
  }
  parts.push('<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;align-items:center">' +
    '<button class="btn gray sm" id="num-close">关闭</button>' +
    '<span style="font-size:12px;color:var(--tx3)">本地机械比对 · 不调 AI · 不花 token · 只报可疑，以人工复核为准</span></div>');
  modal('🔢 数字与格式体检', parts.join(''));
  $('#num-close').onclick = closeModal;
}

/* ═══════════ 标点·书名号 1:1 机械对账（T-023 · v4.37.0 · 本地零 token）═══════════
   借鉴 audit_parity 思路：标点这类纯机械、零判断的硬伤，不该花 token 让 AI 查——
   本地数个数就能对账。只报可疑，以人工复核为准。 */

function punctAudit(srcText, dstText){
  srcText = String(srcText || ''); dstText = String(dstText || '');
  const cntCh = (t, ch) => { let n = 0; for(let i = 0; i < t.length; i++){ if(t[i] === ch) n++; } return n; };
  const cnt = (t, re) => (t.match(re) || []).length;
  const PAIRS = [
    { name: '书名号《 》', open: '《', close: '》' },
    { name: '单书名号〈 〉', open: '〈', close: '〉' },
    { name: '引号「 」', open: '「', close: '」' },
    { name: '括号（ ）', open: '（', close: '）' },
    { name: '双引号“ ”', open: '“', close: '”' },
    { name: '单引号‘ ’', open: '‘', close: '’' }
  ];
  const unpaired = [];
  [['原文', srcText], ['译文', dstText]].forEach(function(row){
    const side = row[0], t = row[1];
    PAIRS.forEach(function(p){
      const o = cntCh(t, p.open);
      const c = cntCh(t, p.close);
      if(o !== c) unpaired.push({ side: side, name: p.name, open: p.open, close: p.close, oc: o, cc: c });
    });
  });
  const MARKS = [
    { name: '书名号《', re: /《/g },
    { name: '单书名号〈', re: /〈/g },
    { name: '括号（', re: /（/g },
    { name: '问号 ？', re: /[？?]/g },
    { name: '叹号 ！', re: /[！!]/g },
    { name: '破折号 ——', re: /—+/g },
    { name: '省略号 ……', re: /…+/g }
  ];
  const mismatch = [];
  MARKS.forEach(function(m){
    const sc = cnt(srcText, m.re), dc = cnt(dstText, m.re);
    if(sc !== dc) mismatch.push({ name: m.name, sc: sc, dc: dc });
  });
  const srcTotal = MARKS.reduce((a, m) => a + cnt(srcText, m.re), 0);
  const dstTotal = MARKS.reduce((a, m) => a + cnt(dstText, m.re), 0);
  const issueCount = unpaired.length + mismatch.length;
  return { srcTotal: srcTotal, dstTotal: dstTotal, unpaired: unpaired, mismatch: mismatch, issueCount: issueCount, clean: issueCount === 0 };
}

function showPunctAudit(){
  const srcText = $('#src').value.trim();
  const dstText = extractProofText(LAST_OUT) || $('#dst').value.trim();
  if(!srcText){ toast('请先粘贴原文，再做标点对账', 'e'); return; }
  if(!dstText){ toast('请先校对，或粘贴待核对的译文，再做标点对账', 'e'); return; }
  const r = punctAudit(srcText, dstText);
  const parts = [];
  parts.push('<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--tx2);margin-bottom:14px">' +
    '<span>原文标点 <b>' + r.srcTotal + '</b> 处</span>' +
    '<span>译文标点 <b>' + r.dstTotal + '</b> 处</span>' +
    '<span>可疑 <b style="color:' + (r.issueCount ? 'var(--err)' : 'var(--tx2)') + '">' + r.issueCount + '</b> 处</span>' +
    '<span>判定 <b style="color:' + (r.clean ? 'var(--tx2)' : 'var(--err)') + '">' + (r.clean ? '✓ 未见异常' : '⚠ 需人工复核') + '</b></span></div>');
  if(r.clean){
    parts.push('<div class="alert ok">✓ 标点对账：书名号、括号、引号、问号、叹号、破折号、省略号在原文与译文里数量都对得上，也没有悬空的括号。</div>');
  }
  if(r.unpaired.length){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 悬空的配对符号 ' + r.unpaired.length + ' 处（开/合数量不等）</h4>');
    parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">比如有 3 个「《」却只有 2 个「》」——括号没闭合是硬伤。</div>');
    parts.push(r.unpaired.map(function(x){
      return '<div class="seg" style="font-size:13px"><div style="color:var(--err);margin-bottom:4px">' +
        esc(x.side) + '：' + esc(x.name) + ' 开 <b>' + x.oc + '</b> 个 / 合 <b>' + x.cc + '</b> 个</div></div>';
    }).join(''));
  }
  if(r.mismatch.length){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 数量对不上的标点 ' + r.mismatch.length + ' 种（原文 vs 译文）</h4>');
    parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">这类标点一般该一一对应；数量不一样，多半是漏标、多标或换成了别的写法，请逐个核对。</div>');
    parts.push(r.mismatch.map(function(x){
      return '<div class="seg" style="font-size:13px"><div style="color:var(--err);margin-bottom:4px">' +
        esc(x.name) + '：原文 <b>' + x.sc + '</b> 个，译文 <b>' + x.dc + '</b> 个</div></div>';
    }).join(''));
  }
  parts.push('<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;align-items:center">' +
    '<button class="btn gray sm" id="punct-close">关闭</button>' +
    '<span style="font-size:12px;color:var(--tx3)">本地机械比对 · 不调 AI · 不花 token · 只报可疑，以人工复核为准</span></div>');
  modal('🔣 标点·书名号对账', parts.join(''));
  $('#punct-close').onclick = closeModal;
}

/* ═══════════ 翻译腔体检（T-025 · 本地零 token）═══════════
   专抓「一看就是外文翻过来的」别扭句：句末落「的」、「的」字堆叠、套话/直译黑名单。
   纯本地机械比对，不调 AI、不花 token，只报可疑、以人工复核为准。 */
function styleAudit(text){
  text = String(text || '');
  const sents = text.split(/[。！？；…]+/).map(s => s.trim()).filter(Boolean);
  const deFinal = [];
  const deDense = [];
  const black = [];
  sents.forEach(function(s, i){
    const no = i + 1;
    if(s.length >= 6 && /的$/.test(s)) deFinal.push({ no: no, s: s });
    const dn = (s.match(/的/g) || []).length;
    if(dn >= 4) deDense.push({ no: no, n: dn, s: s });
  });
  const BLACK = [
    { name: '「作为…的东西」式直译', re: /作为[^。；！？]{0,24}的东西/g },
    { name: '「被…所…」被动腔', re: /被[^。；！？，]{0,16}所/g },
    { name: '「在…的情况下」欧化', re: /在[^。；！？，]{0,20}的情况下/g },
    { name: '「对于…来说」欧化', re: /对于[^。；！？，]{0,20}来说/g },
    { name: '「关于…方面」套话', re: /关于[^。；！？，]{0,16}方面/g },
    { name: '「之所以…是因为」欧化', re: /之所以[^。；！？，]{0,20}是因为/g },
    { name: '「进行…」空洞动词', re: /进行(?:分析|研究|讨论|检查|处理|调查|了解|考虑|比较)/g }
  ];
  BLACK.forEach(function(b){
    const m = text.match(b.re) || [];
    if(m.length) black.push({ name: b.name, count: m.length, samples: m.slice(0, 3) });
  });
  const deCount = (text.match(/的/g) || []).length;
  const issueCount = deFinal.length + deDense.length + black.reduce((a, b) => a + b.count, 0);
  return { sentCount: sents.length, deFinal: deFinal, deDense: deDense, black: black, deCount: deCount, issueCount: issueCount, clean: issueCount === 0 };
}

function showStyleAudit(){
  const cl = function(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
  const dstText = extractProofText(LAST_OUT) || $('#dst').value.trim();
  if(!dstText){ toast('请先校对，或粘贴待检查的译文，再做翻译腔体检', 'e'); return; }
  const r = styleAudit(dstText);
  const parts = [];
  parts.push('<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--tx2);margin-bottom:14px">' +
    '<span>句子 <b>' + r.sentCount + '</b> 句</span>' +
    '<span>「的」字 <b>' + r.deCount + '</b> 个</span>' +
    '<span>可疑 <b style="color:' + (r.issueCount ? 'var(--err)' : 'var(--tx2)') + '">' + r.issueCount + '</b> 处</span>' +
    '<span>判定 <b style="color:' + (r.clean ? 'var(--tx2)' : 'var(--err)') + '">' + (r.clean ? '✓ 未见翻译腔' : '⚠ 需人工复核') + '</b></span></div>');
  if(r.clean){
    parts.push('<div class="alert ok">✓ 翻译腔体检：没发现句末落「的」、「的」字堆叠或套话直译，读起来比较顺。</div>');
  }
  if(r.deFinal.length){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 句末落「的」 ' + r.deFinal.length + ' 句</h4>');
    parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">中文句子一般不以「的」收尾，读着别扭，请顺一下。</div>');
    parts.push(r.deFinal.map(function(x){
      return '<div class="seg" style="font-size:13px"><div style="color:var(--err);margin-bottom:4px">第 ' + x.no + ' 句</div>' + esc(cl(x.s, 90)) + '</div>';
    }).join(''));
  }
  if(r.deDense.length){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 「的」字堆叠 ' + r.deDense.length + ' 句（一句 4 个以上）</h4>');
    parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">一句话塞太多「的」，读着累，试着拆短或换个说法。</div>');
    parts.push(r.deDense.map(function(x){
      return '<div class="seg" style="font-size:13px"><div style="color:var(--err);margin-bottom:4px">第 ' + x.no + ' 句 · 「的」× ' + x.n + '</div>' + esc(cl(x.s, 90)) + '</div>';
    }).join(''));
  }
  if(r.black.length){
    parts.push('<h4 style="margin:12px 0 6px;color:var(--err)">⚠ 套话 / 直译 ' + r.black.reduce((a, b) => a + b.count, 0) + ' 处</h4>');
    parts.push('<div style="font-size:12px;color:var(--tx3);margin-bottom:6px">这些是典型的「翻译腔」说法，能换掉就换掉。</div>');
    parts.push(r.black.map(function(x){
      return '<div class="seg" style="font-size:13px"><div style="color:var(--err);margin-bottom:4px">' + esc(x.name) + ' × ' + x.count + '</div>' + x.samples.map(function(s){ return esc(cl(s, 60)); }).join(' / ') + '</div>';
    }).join(''));
  }
  parts.push('<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;align-items:center">' +
    '<button class="btn gray sm" id="style-close">关闭</button>' +
    '<span style="font-size:12px;color:var(--tx3)">本地机械比对 · 不调 AI · 不花 token · 只报可疑，以人工复核为准</span></div>');
  modal('📝 翻译腔体检', parts.join(''));
  $('#style-close').onclick = closeModal;
}

/* ═══════════ 体检中心 + 译文总评分 + 风格简报（v4.36.0 · 本地零 token）═══════════
   总分框架借鉴 dsh-plugin-translation（MIT）的 quality：它给译文打 0–100 分，
   我们这里把已有的各项体检汇成同一个总分，刻度与「质量预估」一致（0–100 + S/A/B/C/D）。 */

function qLevel(s){ return s >= 90 ? 'S' : s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 50 ? 'C' : 'D'; }
function qColor(s){ return s >= 85 ? 'var(--ok)' : s >= 70 ? '#d4a72c' : s >= 50 ? '#d4882c' : 'var(--err)'; }

/* ── 丙：占位符保护 —— URL / 邮箱 / 代码 /（1）（2）编号，被译错改坏都是硬伤 ── */
const Q_PROT_RE = /https?:\/\/[^\s，。；、）」』]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\`[^\`\n]{1,80}\`|(?:（|\()\s*\d{1,3}\s*(?:）|\))/g;
function protectList(t){
  const m = String(t || '').match(Q_PROT_RE) || [];
  return [...new Set(m.map(x => x.trim()))];
}

/* ── 甲乙丙：译文总评分（忠实度 60 起 + 流畅度 40 起，每条扣分写清扣在哪）── */
function qualityScore(srcText, dstText){
  const src = String(srcText || ''), dst = String(dstText || '');
  const items = [];
  if(!src.trim() || !dst.trim()){
    return { ok:false, score:0, level:'D', fidelity:0, fluency:0, ratio:0, items:[], clean:false,
             text:'原文和译文都要填，才能打分' };
  }
  let fidelity = 60, fluency = 40;
  const add = (pen, cat, detail) => { items.push({ cat, detail, pen }); };

  if(typeof numAudit === 'function'){            // 数字 / 百分号 / 否定词（含万、亿换算）
    const na = numAudit(src, dst);
    const nMiss = (na.missing || []).length, nExtra = (na.extra || []).length;
    const nPct = na.pctLost ? 1 : 0, nNeg = (na.negDiff || []).length;
    if(nMiss + nExtra + nPct + nNeg){
      const pen = Math.min(24, nMiss * 5 + nExtra * 5 + nPct * 5 + nNeg * 6);
      fidelity -= pen;
      const b = [];
      if(nMiss) b.push('丢了 ' + nMiss + ' 个');
      if(nExtra) b.push('凭空多出 ' + nExtra + ' 个');
      if(nPct) b.push('百分号丢了');
      if(nNeg) b.push('漏了 ' + nNeg + ' 处否定');
      add(pen, '数字与格式', b.join('、'));
    }
  }
  if(typeof paraAudit === 'function'){           // 段落对齐（整段漏译）
    const pa = paraAudit(src, dst);
    const blanks = (pa.blanks || []).length;
    if(pa.status !== 'equal' || blanks){
      const pen = Math.min(14, Math.abs(pa.diff || 0) * 3 + blanks * 4);
      fidelity -= pen;
      add(pen, '段落对齐', pa.status === 'short' ? ('原文比译文多 ' + Math.abs(pa.diff) + ' 段，疑似整段漏译')
        : (pa.status === 'long' ? ('译文比原文多 ' + pa.diff + ' 段') : ('有 ' + blanks + ' 个空段')));
    }
  }
  if(typeof approvedGloss === 'function'){       // 术语只认「已批准」（M4 权威分级）
    const miss = approvedGloss().filter(g => g.foreign && src.indexOf(g.foreign) >= 0 && g.zh && dst.indexOf(g.zh) < 0);
    if(miss.length){
      const pen = Math.min(18, miss.length * 6);
      fidelity -= pen;
      add(pen, '术语未按权威库', miss.slice(0, 5).map(g => g.foreign + '→' + g.zh).join('、'));
    }
  }
  const pDst = protectList(dst);
  const pLost = protectList(src).filter(x => pDst.indexOf(x) < 0);   // 丙
  if(pLost.length){
    const pen = Math.min(12, pLost.length * 4);
    fidelity -= pen;
    add(pen, '占位符保护', pLost.slice(0, 4).join('、') + ' 在译文里没了或被改');
  }
  const srcCjk = /[\u4e00-\u9fff]/.test(src);   // 乙：漏译残留 —— 原文是中文
  const cjkCount = (dst.match(/[\u4e00-\u9fff]/g) || []).length;
  const runs = dst.match(/[A-Za-z][A-Za-z'\u2019-]{3,}(?:\s+[A-Za-z][A-Za-z'\u2019-]{2,}){2,}/g) || [];
  if(srcCjk && cjkCount / Math.max(1, dst.length) < 0.1){
    fidelity -= 12;
    add(12, '译文几乎没翻译', '原文是中文，译文里中文字只有 ' + cjkCount + ' 个，疑似整篇没翻');
  } else if(cjkCount > 0 && runs.length){
    const pen = Math.min(10, runs.length * 5);
    fidelity -= pen;
    add(pen, '未翻译残留', '「' + runs[0].slice(0, 32) + '」等 ' + runs.length + ' 处没翻干净');
  }
  const ratio = dst.length / Math.max(1, src.length);
  if(ratio < 0.4 || ratio > 3){
    fidelity -= 8;
    add(8, '长度比异常', '译文/原文 = ' + ratio.toFixed(2) + (ratio < 0.4 ? '（偏短，可能漏译）' : '（偏长，可能过度翻译）'));
  }

  const sentCount = t => String(t).split(/[.!?。！？…]+/).filter(x => x.trim().length > 0).length;
  const sN = sentCount(src), tN = sentCount(dst);
  if(sN > 0 && Math.abs(sN - tN) / sN > 0.5){
    fluency -= 8;
    add(8, '句数不匹配', '原文 ' + sN + ' 句 / 译文 ' + tN + ' 句');
  }
  const dbl = (dst.match(/[，。、；：,.;:]{2,}|\u3000{2,}|[ \t]{2,}/g) || []).length;
  if(dbl){
    const pen = Math.min(12, dbl * 4);
    fluency -= pen;
    add(pen, '重复标点/空格', dbl + ' 处');
  }
  if(dst.split(/[.!?。！？]+/).some(s2 => s2.trim().length > 200)){
    fluency -= 6;
    add(6, '超长句', '有句子超过 200 字，建议拆开');
  }

  fidelity = Math.max(0, fidelity); fluency = Math.max(0, fluency);
  const score = Math.max(0, Math.min(100, fidelity + fluency));
  return { ok:true, score, level:qLevel(score), fidelity, fluency,
           ratio:Math.round(ratio * 100) / 100, items, clean:items.length === 0,
           text:'忠实度 ' + fidelity + '/60 · 流畅度 ' + fluency + '/40' };
}

function showQuality(){
  const src = (($('#src') || {}).value || '').trim();
  const dst = (typeof extractProofText === 'function' ? extractProofText(LAST_OUT) : '') || (($('#dst') || {}).value || '').trim();
  if(!src || !dst){ toast('原文和译文都要有，才能打分', 'e'); return; }
  const q = qualityScore(src, dst);
  const color = qColor(q.score);
  const chip = 'display:inline-block;padding:3px 10px;border-radius:999px;background:var(--bg2);border:1px solid var(--bd);font-size:12px;color:var(--tx2)';
  const head = [
    '<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px">',
    '  <div style="flex:0 0 88px;width:88px;height:88px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:4px solid ' + color + ';color:' + color + '">',
    '    <div style="font-size:26px;font-weight:700;line-height:1">' + q.score + '</div>',
    '    <div style="font-size:11px;opacity:.85">' + esc(q.level) + '</div>',
    '  </div>',
    '  <div style="flex:1;min-width:0">',
    '    <div style="font-size:13px;line-height:1.6;color:var(--tx1)">' + esc(q.text) + '</div>',
    '    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">',
    '      <span style="' + chip + '">长度比 ' + q.ratio + '</span>',
    '      <span style="' + chip + '">扣分项 ' + q.items.length + ' 条</span>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('');
  const list = q.items.length
    ? '<div><b style="font-size:12.5px;color:var(--tx2)">扣分明细（本地算的，条条可复核）</b><ul style="margin:6px 0 0 18px;font-size:13px;line-height:1.7;color:var(--tx1)">'
      + q.items.map(it => '<li><b style="color:var(--err)">-' + it.pen + '</b> 【' + esc(it.cat) + '】' + esc(it.detail) + '</li>').join('')
      + '</ul></div>'
    : '<div class="alert ok">✓ 没查出数字丢失、整段漏译、术语不符、占位符被改、未翻译残留这类硬伤。</div>';
  const hint = '<div class="alert i" style="margin-top:12px">这是纯本地机械体检：只查「规则能确认」的硬伤，不判断文笔好坏。要更完整的判断点「开始校对」。</div>';
  modal('📊 译文总评分', head + list + hint);
}

/* ── 丁：风格简报（按上方选的体裁调性给一份可执行清单）── */
const TONE_BRIEF = {
  '学术严谨': ['保留长句结构与理论密度，不要为了顺口擅自拆句。', '术语首次出现可在括号里留外文原词，之后统一用中文译名。', '限定语（可能、在某种程度上、通常）不要删——那是学术判断的分寸。', '引用与脚注编号逐字核对，一个都不能错。', '被动语态在强调动作对象时保留，不必都改成主动。'],
  '专业可读': ['准确优先，其次顺畅；拿不准的术语宁可保留原词。', '长句先断成两到三句，但别把因果关系拆散。', '数字、单位、专有名词逐字核对。', '避免「进行……的……」这类空转的机器腔结构。', '段落之间补一句承上启下，别让读者自己猜。'],
  '大众科普': ['术语第一次出现就用一句大白话解释，别直接堆名词。', '句子尽量短，一句只说一件事。', '用类比和具体例子代替抽象定义。', '专业词能换成人话就换，非留不可的加括号注释。', '别为了通俗牺牲准确——宁可说「大致相当于」也不要瞎类比。'],
  '文学性': ['保留原文的节奏、停顿和句长变化，别都抹平成一样长。', '修辞（比喻、排比、反复）一定要译出来，那是文章的骨架。', '说话人的语气、口癖要留住，别都改成标准书面语。', '留白和跳跃是作者有意为之，别擅自补全。', '拿不准的地方保留歧义，别强行选一个解释。'],
  '口语化': ['用说话的词，不用书面词（「所以」而不是「因此」）。', '可以有语气词、可以有省略、可以有不完整的句子。', '短句为主，节奏跟上人的语速。', '俗语俚语优先找中文里说法对应的，别直译。', '别加原文没有的客套和解释——口语是直接的。']
};
function toneBriefFor(tone){ return TONE_BRIEF[tone] || TONE_BRIEF['专业可读']; }
function showToneBrief(){
  const tone = (($('#tone') || {}).value || '专业可读');
  const items = toneBriefFor(tone);
  modal('🎛 风格简报 · ' + esc(tone),
    '<div class="alert i">按你选的「' + esc(tone) + '」给的检查清单——翻译和校对时照着走。换上方下拉框再点一次可换一份。</div>'
    + '<ul style="margin:12px 0 0 18px;font-size:13px;line-height:1.8;color:var(--tx1)">' + items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'
    + '<div class="hint" style="margin-top:12px">清单跟着「体裁调性」一起进校对提示词，不额外花 token。</div>');
}

/* ── 体检中心：开关 + 一键全检 ── */
const AO_KEY = 'tp.auditOpts';
function auditOptsGet(){
  const d = { term:true, pnoun:true, para:true, num:true, quality:true, tone:false, style:true };
  const s = load(AO_KEY, null);
  return (s && typeof s === 'object') ? Object.assign(d, s) : d;
}
function auditOptsApply(){
  const o = auditOptsGet();
  Object.keys(o).forEach(k => { const el = $('#ao-' + k); if(el) el.checked = !!o[k]; });
}
function auditOptsSave(){
  const o = {};
  Object.keys(auditOptsGet()).forEach(k => { const el = $('#ao-' + k); if(el) o[k] = !!el.checked; });
  save(AO_KEY, o);
}
function auditCenterToggle(on){
  const box = $('#audit-center'), btn = $('#btn-audit-center');
  const vis = (typeof on === 'boolean') ? on : (box && box.style.display === 'none');
  if(box) box.style.display = vis ? '' : 'none';
  if(btn) btn.classList.toggle('vs-on', !!vis);
  if(vis) auditOptsApply();
}

function auditAll(){
  const src = (($('#src') || {}).value || '').trim();
  const dst = (($('#dst') || {}).value || '').trim();
  const proof = (typeof extractProofText === 'function' ? extractProofText(LAST_OUT) : '') || '';
  const target = proof || dst;
  if(!target){ toast('先把译文贴进译文框，才能体检', 'e'); return; }
  const o = auditOptsGet();
  const rows = [];
  const add = (name, n, detail, opener) => rows.push({ name, n, detail, opener });
  if(o.term && typeof termAudit === 'function'){
    const r = termAudit(target, src);
    add('术语一致性', (r.conflict || []).length + (r.multi || []).length, '冲突 / 一词多译', 'showTermAudit');
  }
  if(o.pnoun && typeof proNounAudit === 'function'){
    add('专名一致性', (proNounAudit(target, src) || []).length, '同名异译 / 疑似未译 / 数字', 'pnOpen');
  }
  if(o.para && typeof paraAudit === 'function'){
    const r = paraAudit(src, target);
    const n = r.status === 'equal' ? 0 : Math.abs(r.diff || 0) + (r.blanks || []).length;
    add('段落对齐', n, r.status === 'equal' ? '段落数一致' : '段落数对不上（疑似漏段）', 'showParaAudit');
  }
  if(o.num && typeof numAudit === 'function'){
    const r = numAudit(src, target);
    add('数字与格式', r.issueCount || 0, r.clean ? '干净' : '数字 / 百分号 / 否定词有可疑处', 'showNumAudit');
  }
  if(o.style && typeof styleAudit === 'function'){
    const r = styleAudit(target);
    add('翻译腔', r.issueCount || 0, r.clean ? '干净' : '句末落「的」/「的」堆叠/套话直译', 'showStyleAudit');
  }
  if(o.quality && typeof qualityScore === 'function'){
    const q = qualityScore(src, target);
    add('译文总评分', q.items.length, '总分 ' + q.score + '（' + q.level + '）· ' + q.text, 'showQuality');
  }
  if(o.tone) add('风格简报', 0, '按「' + (($('#tone') || {}).value || '专业可读') + '」给的清单', 'showToneBrief');

  if(!rows.length){ toast('一项都没勾，请先在体检中心勾选', 'w'); return; }
  const chip = 'display:inline-block;padding:3px 10px;border-radius:999px;background:var(--bg2);border:1px solid var(--bd);font-size:12px;color:var(--tx2)';
  const bad = rows.filter(r => r.n > 0).length;
  const head = '<div class="alert ' + (bad ? 'w' : 'ok') + '">共跑 ' + rows.length + ' 项：'
    + (bad ? ('有 <b>' + bad + '</b> 项查出问题，下面逐项可点开看细节。') : '全部通过，没查出硬伤。') + '</div>';
  const body = rows.map(r =>
    '<div class="seg" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">'
    + '<b style="min-width:96px">' + esc(r.name) + '</b>'
    + '<span style="' + chip + '">' + (r.n ? ('<b style="color:var(--err)">' + r.n + '</b> 处') : '✓ 通过') + '</span>'
    + '<span style="font-size:12px;color:var(--tx3)">' + esc(r.detail) + '</span>'
    + '<span style="flex:1"></span>'
    + '<button class="btn gray sm" data-aopen="' + esc(r.opener) + '">看细节</button>'
    + '</div>').join('');
  modal('🩺 体检中心 · 结果', head + body
    + '<div class="hint" style="margin-top:12px">全部本地计算 · 不调 AI · 不花 token。「看细节」打开原来的体检面板，可逐条处理。</div>');
  $$('#mBody [data-aopen]').forEach(b => { b.onclick = () => { const f = b.getAttribute('data-aopen'); if(typeof window[f] === 'function') window[f](); }; });
}

/* ═══════════ 智能配图助手（v4.4 关键词标签 · 图片来源待接）═══════════ */
function parseImageTags(text){
  let s = String(text||'').replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
  const m = s.match(/\{[\s\S]*\}/);
  if(m) s = m[0];
  try{
    const j = JSON.parse(s);
    const tags = Array.isArray(j.tags) ? j.tags : [];
    return tags.map(t => ({ zh: (t.zh||t.cn||'').trim(), en: (t.en||t.english||'').trim() })).filter(t => t.zh || t.en);
  }catch(e){
    return String(text||'').split(/[\n,，、]/).map(x=>x.trim()).filter(x=>x && x.length<=24).slice(0,12).map(x=>({zh:x,en:''}));
  }
}
async function extractImageTags(text){
  const sys = '你是一位内容分析助手。请从下面的文本中提取适合用于图片检索的关键词/主题。要求：① 5-12 个；② 覆盖核心主题、关键概念、专名、意象、场景等；③ 具体、可检索（适合作为图片搜索词）；④ 中英文对照。输出严格按 JSON：{"tags":[{"zh":"中文","en":"English"}]}。只输出 JSON，不解释。';
  const user = '【文本】\n' + String(text||'').slice(0, 4000);
  const r = await callModelSimple(sys, user, 1200);
  return parseImageTags(r.text);
}
async function openImageAssistant(text){
  if(!text || !text.trim()){ toast('还没有内容可提取关键词', 'e'); return; }
  modal('🔍 智能配图助手', '<div style="font-size:13px;color:var(--tx2)">⏳ AI 正在分析文本、提取关键词…</div>');
  try{
    const tags = await extractImageTags(text);
    showImageTags(tags);
  }catch(e){
    modal('🔍 智能配图助手', ['<div class="alert e">提取失败：' + esc(e.message) + '</div>','<div style="margin-top:12px"><button class="btn gray" id="img-cancel-err">关闭</button></div>'].join(''));
    $('#img-cancel-err').onclick = closeModal;
  }
}
function showImageTags(tags){
  const chips = tags.map((t, i) => {
    const label = (t.zh && t.en) ? (t.zh + ' / ' + t.en) : (t.zh || t.en);
    return '<span class="img-tag" data-zh="' + esc(t.zh) + '" data-en="' + esc(t.en) + '">' + esc(label) + '</span>';
  }).join('');
  modal('🔍 智能配图助手', [
    '<div style="font-size:13px;color:var(--tx2);margin-bottom:10px">AI 已提取 <b>' + tags.length + '</b> 个关键词。点击标签勾选要用于配图检索的词（可多选）。</div>',
    '<div id="img-tags-wrap" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">' + chips + '</div>',
    '<div style="margin-top:12px"><label class="f">手动补充关键词（用逗号分隔，可选）</label><input id="img-tag-add" placeholder="例如：古希腊、大理石雕像、雨夜街头"></div>',
    '<div style="font-size:12px;color:var(--tx3);margin-top:10px">已选 <b id="img-tag-count">0</b> 个关键词</div>',
    '<div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap"><span style="font-size:11px;color:var(--tx3)">一键跳转搜索：</span><button class="btn sm" id="img-baidu">🔍 百度图片</button><button class="btn sm" id="img-bing">🔍 必应图片</button><button class="btn sm" id="img-pixabay">🔍 Pixabay</button><button class="btn gray" id="img-cancel">关闭</button></div>'
  ].join(''));
  const update = () => {
    const n = document.querySelectorAll('#img-tags-wrap .img-tag.on').length;
    $('#img-tag-count').textContent = n;
  };
  // 一键跳转搜索：勾选词 → 新标签页打开搜索引擎/图库
  const searchProvider = (p) => {
    const tags = [...document.querySelectorAll('#img-tags-wrap .img-tag.on')];
    if(!tags.length){ toast('请先勾选关键词', 'w'); return; }
    const words = tags.map(ch => (p === 'pixabay' ? (ch.dataset.en || ch.dataset.zh) : (ch.dataset.zh || ch.dataset.en))).filter(Boolean).slice(0, 3);
    if(!words.length){ toast('所选关键词缺少可用文字', 'w'); return; }
    const kw = words.join(' ');
    const urls = {
      baidu: 'https://image.baidu.com/search/index?tn=baiduimage&word=' + encodeURIComponent(kw),
      bing: 'https://www.bing.com/images/search?q=' + encodeURIComponent(kw),
      pixabay: 'https://pixabay.com/zh/images/search/' + encodeURIComponent(words.join(' ')) + '/',
    };
    window.open(urls[p], '_blank');
  };
  document.querySelectorAll('#img-tags-wrap .img-tag').forEach(ch => {
    ch.onclick = () => { ch.classList.toggle('on'); update(); };
  });
  $('#img-tag-add').onchange = () => {
    const v = $('#img-tag-add').value.trim();
    if(!v) return;
    v.split(/[,，、]/).map(s=>s.trim()).filter(Boolean).forEach(s => {
      const span = document.createElement('span');
      span.className = 'img-tag on'; span.textContent = s;
      span.dataset.zh = s;
      span.onclick = () => { span.classList.toggle('on'); update(); };
      $('#img-tags-wrap').appendChild(span);
    });
    $('#img-tag-add').value = '';
    update();
  };
  $('#img-cancel').onclick = closeModal;
  $('#img-baidu').onclick = () => searchProvider('baidu');
  $('#img-bing').onclick = () => searchProvider('bing');
  $('#img-pixabay').onclick = () => searchProvider('pixabay');
  update();
}

$('#btn-md').onclick = () => {
  if(!LAST_OUT){ toast('还没有结果可导出'); return; }
  dl('校对结果_' + today() + '.md', LAST_OUT, 'text/markdown');
};
// 智能配图助手入口
$('#btn-img').onclick = () => {
  if(!LAST_OUT){ toast('先跑一次校对，再提取配图关键词'); return; }
  openImageAssistant(extractProofText(LAST_OUT) || LAST_OUT);
};
// 术语一致性体检入口（本地零成本）
$('#btn-audit').onclick = () => showTermAudit();
// 段落对齐体检入口（v4.31.0 · 本地零成本）
$('#btn-para-audit') && ($('#btn-para-audit').onclick = () => showParaAudit());
// 数字与格式体检入口（T-015 · v4.33.0 · 本地零成本）
$('#btn-num-audit') && ($('#btn-num-audit').onclick = () => showNumAudit());
// 标点·书名号对账入口（T-023 · v4.37.0 · 本地零成本）
$('#btn-punct-audit') && ($('#btn-punct-audit').onclick = () => showPunctAudit());
$('#btn-style-audit') && ($('#btn-style-audit').onclick = () => showStyleAudit());
/* 体检中心 + 总评分 + 风格简报（v4.36.0） */
$('#btn-audit-center') && ($('#btn-audit-center').onclick = () => auditCenterToggle());
$('#btn-audit-center-close') && ($('#btn-audit-center-close').onclick = () => auditCenterToggle(false));
$('#btn-audit-all') && ($('#btn-audit-all').onclick = auditAll);
$('#btn-quality') && ($('#btn-quality').onclick = showQuality);
$('#btn-tone') && ($('#btn-tone').onclick = showToneBrief);
if(typeof $$ === 'function'){ $$('#audit-center .opts input[type=checkbox]').forEach(el => { el.onchange = auditOptsSave; }); }
auditOptsApply();
/* 三栏对照 · 翻译区直出（v4.35.0） */
$('#btn-tri-inline') && ($('#btn-tri-inline').onclick = () => triInlineToggle());
['#src', '#dst'].forEach(sel => { const el = $(sel); if(el) el.addEventListener('input', triInlineSchedule); });

/* ═══════════ 改动对照视图（v4.12.0 · P1 · 零 token）═══════════
   把「二、逐条批注」的每一条 [类型] 原文 → 改为「新译」：理由
   解析成可视化对照表：红色删除线 = 原译，绿色高亮 = 修订，逐条可复制。 */
function parseEdits(text){
  const t = String(text || '');
  const edits = [];
  let inAnn = false;
  for(const raw of t.split('\n')){
    if(/^#{2,3}\s*.*逐条批注/.test(raw)){ inAnn = true; continue; }
    if(inAnn && /^#{1,3}\s*/.test(raw) && !/逐条批注/.test(raw)){ break; } // 离开批注区
    if(!inAnn) continue;
    const s = raw.trim();
    if(!/^[-*·]\s*/.test(s)) continue;
    const body = s.replace(/^[-*·]\s*/, '');
    const tm = body.match(/^[\[【]([^\]】]{2,8})[\]】]\s*([\s\S]*)$/);
    if(!tm) continue;
    const type = tm[1].trim();
    let rest = tm[2];
    const arrow = rest.indexOf('→');
    if(arrow < 0) continue;
    let left = rest.slice(0, arrow).replace(/[*`]/g, '').trim();
    let right = rest.slice(arrow + 1).trim().replace(/^改为\s*/, '');
    let newTxt = '', reason = '';
    const qm = right.match(/[「『"']([^」』"']*)[」』"']\s*[：:]?\s*([\s\S]*)$/);
    if(qm){ newTxt = qm[1].trim(); reason = qm[2].trim(); }
    else{
      const ci = right.indexOf('：');
      if(ci >= 0){ newTxt = right.slice(0, ci).trim(); reason = right.slice(ci + 1).trim(); }
      else newTxt = right.trim();
    }
    if(left && newTxt) edits.push({ type, from: left, to: newTxt, reason: reason.replace(/[：:]\s*$/, '') });
  }
  return edits;
}
function showEditDiff(){
  const edits = parseEdits(LAST_OUT);
  if(!edits.length){ toast('没解析到改动条目。批注需含「原文 → 改为「新译」」格式', 'w'); return; }
  const rows = edits.map((e, i) =>
    '<div class="diff-row">' +
      '<span class="diff-type">' + esc(e.type) + '</span>' +
      '<span class="diff-from">' + esc(e.from) + '</span>' +
      '<span class="diff-arrow">→</span>' +
      '<span class="diff-to">' + esc(e.to) + '</span>' +
      '<button class="btn x diff-copy" data-i="' + i + '" title="复制修订结果">⧉</button>' +
      (e.reason ? '<div class="diff-reason">' + esc(e.reason) + '</div>' : '') +
    '</div>'
  ).join('');
  modal('改动对照（' + edits.length + ' 处）', [
    '<div style="font-size:12px;color:var(--tx3);margin-bottom:10px">红色删除线 = 原译，绿色高亮 = 修订。点 ⧉ 复制修订结果，可直接粘贴进文档。</div>',
    '<div style="max-height:58vh;overflow:auto;border:1px solid var(--bd);border-radius:8px">' + rows + '</div>',
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn sm" id="diff-copyall">📋 复制全部修订清单</button><button class="btn gray sm" id="diff-close">关闭</button></div>'
  ].join(''));
  $('#diff-close').onclick = closeModal;
  document.querySelectorAll('.diff-copy').forEach(b => b.onclick = () => {
    const e = edits[+b.dataset.i];
    navigator.clipboard.writeText(e.to).then(() => toast('已复制：' + e.to)).catch(() => toast('复制失败，请手动选中', 'e'));
  });
  $('#diff-copyall').onclick = () => {
    const txt = edits.map((e, i) => (i + 1) + '. ' + e.from + ' → ' + e.to).join('\n');
    navigator.clipboard.writeText(txt).then(() => toast('已复制 ' + edits.length + ' 条修订清单')).catch(() => toast('复制失败', 'e'));
  };
}
$('#btn-diff').onclick = () => {
  if(!LAST_OUT){ toast('先跑一次校对，再看改动对照'); return; }
  showEditDiff();
};
$('#ts-btn-img').onclick = () => {
  const t = extractTransText(TS_LAST_OUT) || $('#ts-src').value.trim();
  if(!t){ toast('先翻译，或输入原文，再提取配图关键词'); return; }
  openImageAssistant(t);
};
$('#btn-wx').onclick = () => {
  if(!LAST_OUT){ toast('还没有结果可导出'); return; }
  const html = wxHtml(LAST_OUT);
  copyRich(html);
  modal('公众号格式已生成', [
    '<p>已把校对结果转换为公众号编辑器兼容的富文本，并<b>复制到剪贴板</b>。现在直接到公众号编辑器里 <kbd>Ctrl</kbd>+<kbd>V</kbd> 粘贴即可，标题、加粗、列表、引用会保留。</p>',
    '<p style="color:var(--tx3);font-size:12px">注意事项：微信编辑器对表格支持有限，表格内容已转为段落形式；如需插图请在粘贴后手动添加。粘贴后建议用「清除格式」再套用一次公众号模板以保证字号统一。</p>',
    '<h3>效果预览</h3>',
    '<div style="background:#fff;color:#333;padding:20px;border-radius:6px;max-height:340px;overflow-y:auto;font-size:14px;line-height:1.8">' + html + '</div>'
  ].join(''));
};
function wxHtml(mdText){
  const body = md(mdText)
    .replace(/style="[^"]*"/g,'')
    .replace(/<h4>/g, '<h4 style="font-size:16px;font-weight:600;margin:22px 0 10px;padding-bottom:6px;border-bottom:1px solid #e5e5e5;color:#222">')
    .replace(/<p>/g, '<p style="margin:12px 0;line-height:1.8;color:#333;font-size:15px">')
    .replace(/<div class="seg">/g, '<p style="margin:12px 0;line-height:1.8;color:#333;font-size:15px">')
    .replace(/<div class="note">/g, '<blockquote style="margin:14px 0;padding:8px 14px;border-left:3px solid #d0d0d0;color:#666;font-size:14px">')
    .replace(/<ul[^>]*>/g, '<ul style="margin:12px 0;padding-left:22px;color:#333;font-size:15px">')
    .replace(/<ol[^>]*>/g, '<ol style="margin:12px 0;padding-left:22px;color:#333;font-size:15px">')
    .replace(/<li>/g, '<li style="margin:6px 0;line-height:1.8">')
    .replace(/<strong>/g, '<strong style="font-weight:600;color:#111">')
    .replace(/<code>/g, '<code style="background:#f5f5f5;padding:1px 5px;border-radius:3px;font-size:14px;color:#c7254e">');
  return '<section style="font-family:\'IBM Plex Serif\',Georgia,\'Source Han Serif SC\',\'Noto Serif SC\',\'Songti SC\',SimSun,serif;font-size:16px;line-height:1.8;letter-spacing:.02em;color:#333">' + body + '</section>';
}
function copyRich(html){
  try{
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.style.cssText = 'position:fixed;left:-9999px;top:0';
    div.innerHTML = html;
    document.body.appendChild(div);
    const r = document.createRange(); r.selectNodeContents(div);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('copy');
    s.removeAllRanges();
    div.remove();
  }catch(e){ toast('富文本复制失败，可改用「导出 Markdown」', 'e'); }
}

/* ═══════════ 历史与弹层 ═══════════ */
function pushHistory(user, out, ext){
  let h = load(LS.history, []);
  h.unshift({ t:Date.now(), title:(user.replace(/^【[^】]*】\s*/,'').slice(0,40)||'未命名'), ext, out });
  if(h.length > 20) h = h.slice(0,20);
  save(LS.history, h);
}
function modal(title, html){
  $('#mTitle').textContent = title;
  $('#mBody').innerHTML = html;
  $('#modal').classList.add('on');
}
function closeModal(){ $('#modal').classList.remove('on'); }
$('#mClose').onclick = () => $('#modal').classList.remove('on');
$('#modal').onclick = e => { if(e.target.id === 'modal') $('#modal').classList.remove('on'); };

/* ═══════════ P1 收录正确性核查（v4.26.0 · AI 查询审核）═══════════
   三问题之一：自动收录会把错误选项也拾取入库。此模块给三处入口
   （术语库行 / 词库行 / 决策面板），AI 判 正确/存疑/错误 + 给建议译法，
   采纳与否由你拍板——AI 只报告不动手。判定依据来源：(待补充：判定依据来源) */
const VERIFY_SYS = '你是术语收录核查员。给定一组「原文词 → 已收录译法」，逐条判定这条收录是否正确。' +
  '判定标准：译法是否为该词在此类别/语境下通行、准确的中文对应；宁可存疑，不硬判；绝不编造出处。' +
  '只输出 JSON 数组，每项：{"i":序号,"verdict":"ok|doubt|bad","reason":"≤40字依据","suggest":"更通行的译法，没有就空字符串","conf":"high|mid|low"}。';
async function verifyEntries(items, btn){
  if(!CFG.apiKey){ toast('先去「设置」填好模型 Key 再核查', 'w'); return null; }
  const old = btn ? btn.innerHTML : '';
  if(btn) btn.innerHTML = '<span class="spin"></span>核查中…';
  try{
    const user = '【待核查收录】\n' + items.map((x, i) =>
      '[' + i + '] ' + (x.src || '—') + ' → ' + (x.dst || '—') + (x.extra ? '（' + x.extra + '）' : '')).join('\n');
    const r = await callModelSimple(VERIFY_SYS, user, 1400);
    const arr = extractJsonArray(r && r.text ? r.text : '');
    if(!arr.length){ toast('模型没返回结构化结果，稍后再试', 'w'); return null; }
    return arr;
  }catch(e){ toast('核查失败：' + errMsg(e), 'w'); return null; }
  finally{ if(btn) btn.innerHTML = old; }
}
function showVerifyResults(items, verdicts, opts){
  const VMAP = { ok:{cls:'ok',t:'✓ 正确'}, doubt:{cls:'doubt',t:'? 存疑'}, bad:{cls:'bad',t:'✗ 错误'} };
  const rows = items.map((it, i) => {
    const v = verdicts.find(x => +x.i === i) || {};
    const m = VMAP[v.verdict] || { cls:'doubt', t:'? 未判定' };
    const sug = String(v.suggest || '').trim();
    return '<div class="vf-row" data-i="' + i + '">' +
      '<span class="vf-badge ' + m.cls + '">' + m.t + '</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px"><b>' + esc(it.src || '—') + '</b> → ' + esc(it.dst || '—') + '</div>' +
        '<div style="font-size:12.5px;color:var(--tx2);margin-top:2px">' + esc(v.reason || '（模型没给依据）') + '</div>' +
        (sug && v.verdict !== 'ok' ? '<div style="font-size:12.5px;margin-top:2px">建议改为：<b style="color:var(--ac)">' + esc(sug) + '</b>' +
          ((opts && opts.onAdopt) ? ' <button class="btn sm" data-adopt style="vertical-align:middle">✓ 采用</button>' : '') + '</div>' : '') +
        (v.verdict === 'ok' && opts && opts.onApprove ? '<div style="font-size:12.5px;margin-top:2px">判定正确，可一键批准为「已批准」 <button class="btn pri sm" data-approve style="vertical-align:middle">✓ 批准</button></div>' : '') +
      '</div>' +
      '<span style="font-size:11px;color:var(--tx3)">置信 ' + esc(v.conf || '?') + '</span>' +
    '</div>';
  }).join('');
  modal('🤖 收录核查结果',
    '<div style="font-size:12.5px;color:var(--tx2);margin-bottom:6px">AI 判定仅供参考，采纳前自己再过目一眼。' + (opts && opts.note ? esc(opts.note) : '') + '</div>' + rows);
  if(opts && opts.onApprove){
    $$('#mBody [data-approve]').forEach(b => b.onclick = () => {
      const i = +b.closest('.vf-row').dataset.i;
      opts.onApprove(i, verdicts.find(x => +x.i === i) || {});
      b.textContent = '✓ 已批准'; b.disabled = true;
    });
  }
  if(opts && opts.onAdopt){
    $$('#mBody [data-adopt]').forEach(b => b.onclick = () => {
      const i = +b.closest('.vf-row').dataset.i;
      const v = verdicts.find(x => +x.i === i) || {};
      if(!opts.onAdopt(i, v)) return;
      b.textContent = '✓ 已采用'; b.disabled = true;
    });
  }
}

/* ═══════════ P2+P3 批注「已修/未修」流转 + 译文标红内联修正（v4.26.0）═══════════
   三问题之二/三：误译提醒只报告不闭环 →
   P2：每条批注带「标记已修」按钮，状态随任务持久化，筛选条出现「未修 N」与「已修 x/N」；
   P3：批注里的「改为『新译』」定位到修订后译文段标红，点击直接改，改完自动写回结果并标已修。 */
function auditParseLi(li){
  const txt = (li.textContent || '').replace(/\s+/g, ' ').trim();
  const m = txt.match(/^\s*[\[【]([^\]】]{2,8})[\]】]\s*(.*)$/);
  const type = m && ERR_TYPES.includes(m[1].trim()) ? m[1].trim() : (li.dataset.err || '');
  const body = m ? m[2] : txt;
  const fm = body.match(/\*\*([^*]+?)\*\*\s*→/) || body.match(/^(.+?)\s*→/);
  const xm = body.match(/改为\s*[「"'](.+?)[」"']/);
  const frag = ((fm && fm[1]) || '').trim();
  const fix = ((xm && xm[1]) || '').trim();
  return { type: type, frag: frag, fix: fix, fp: type + '|' + frag + '|' + fix };
}
function renderAuditControls(){
  const out = $('#out'); if(!out) return;
  out.querySelectorAll('li[data-err]').forEach(li => {
    if(!li.dataset.err) return;
    const a = auditParseLi(li);
    if(!a.fp || a.fp === '|' || a.fp === '||') return;
    li.dataset.fp = a.fp;
    let btn = li.querySelector('.ef-fix-btn');
    if(!btn){
      btn = document.createElement('button');
      btn.className = 'ef-fix-btn';
      btn.type = 'button';
      li.appendChild(btn);
    }
    const done = !!AUDIT_FIX[a.fp];
    btn.textContent = done ? '✓ 已修' : '标记已修';
    btn.classList.toggle('on', done);
    li.classList.toggle('ef-done', done);
    btn.onclick = (ev) => { ev.stopPropagation(); toggleAuditFix(a.fp, li, btn); };
  });
  updateFixProgress();
}
function toggleAuditFix(fp, li, btn){
  if(AUDIT_FIX[fp]) delete AUDIT_FIX[fp]; else AUDIT_FIX[fp] = 1;
  const done = !!AUDIT_FIX[fp];
  btn.textContent = done ? '✓ 已修' : '标记已修';
  btn.classList.toggle('on', done);
  li.classList.toggle('ef-done', done);
  saveTask();
  updateFixProgress();
}
function updateFixProgress(){
  const seg = $('#err-filter'); if(!seg) return;
  const lis = [...document.querySelectorAll('#out li[data-fp]')].filter(li => li.dataset.err);
  const done = lis.filter(li => AUDIT_FIX[li.dataset.fp]).length;
  let p = seg.querySelector('.ef-progress');
  if(!lis.length){ if(p) p.remove(); const c = seg.querySelector('[data-ef="unfixed"]'); if(c) c.remove(); return; }
  if(!p){ p = document.createElement('span'); p.className = 'ef-progress'; seg.appendChild(p); }
  p.textContent = '已修 ' + done + '/' + lis.length;
  const chip = seg.querySelector('[data-ef="unfixed"]');
  if(chip) chip.textContent = '未修 ' + (lis.length - done);
}
function paintErrFixSpans(){
  const out = $('#out'); if(!out) return;
  // 1) 清旧痕（把 span 还原成文本节点，内容原样）
  out.querySelectorAll('.err-fix').forEach(s => {
    s.replaceWith(document.createTextNode(s.textContent));
  });
  // 2) 定位「修订后译文」区间（md() 把所有标题渲染为 h4）
  const h4s = [...out.children].filter(n => n.tagName === 'H4');
  const start = h4s.find(h => /(修订后译文|修订稿|终稿|定稿)/.test(h.textContent));
  if(!start) return;
  const nodes = [];
  let el = start.nextElementSibling;
  while(el && el.tagName !== 'H4'){ nodes.push(el); el = el.nextElementSibling; }
  if(!nodes.length) return;
  // 3) 每条带「改为『新译』」的批注 → 在区间里定位并标红（只包第一处）
  const seen = {};
  out.querySelectorAll('li[data-err]').forEach(li => {
    if(!li.dataset.err) return;
    const a = auditParseLi(li);
    if(!a.fix || a.fix.length < 2) return;
    if(seen[a.fp]) return;
    seen[a.fp] = 1;
    wrapFixSpan(nodes, a.fix, a.fp, a.frag);
  });
}
function wrapFixSpan(nodes, text, fp, frag){
  const cands = [text, text.slice(0, 16)].filter(x => x && x.length >= 2);
  for(const root of nodes){
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while((n = walker.nextNode())){
      for(const c of cands){
        const i = n.nodeValue.indexOf(c);
        if(i >= 0){
          const after = n.splitText(i);
          after.splitText(c.length);
          const span = document.createElement('span');
          span.className = 'err-fix';
          span.dataset.fp = fp;
          span.dataset.frag = frag || '';
          span.textContent = c;
          span.title = 'AI 建议的新译：点击可直接修改';
          after.parentNode.insertBefore(span, after);
          after.remove();
          return true;
        }
      }
    }
  }
  return false;
}
function applyProofEdit(fp, oldTxt, newTxt){
  if(!newTxt){ toast('译文不能为空，已还原', 'w'); paintErrFixSpans(); return; }
  // 在 LAST_OUT 的「修订后译文」段里替换第一处旧译
  const re = /(?:^|\n)(#{1,4}\s*[^\n]*(?:修订后译文|修订稿|终稿|定稿)[^\n]*\n)([\s\S]*?)(?=\n#{1,4}\s|$)/;
  const m = LAST_OUT.match(re);
  let ok = false;
  if(m && m[0].indexOf(oldTxt) >= 0){
    // Word 式「相同错误」处理：段内还有 N 处一样的旧译，问一次是否全部替换
    const rest = m[0].split(oldTxt).length - 2;
    let sec = m[0];
    if(rest > 0 && confirm('修订段里还有 ' + rest + ' 处相同的「' + oldTxt + '」，全部替换为「' + newTxt + '」？')){
      sec = sec.split(oldTxt).join(newTxt);
    }
    sec = sec.replace(oldTxt, newTxt);
    LAST_OUT = LAST_OUT.slice(0, m.index) + sec + LAST_OUT.slice(m.index + m[0].length);
    ok = true;
  }
  if(!ok) toast('结果文本里没找到原句，已按显示更新（重跑校对会以模型输出为准）', 'w');
  AUDIT_FIX[fp] = 1;
  saveTask();
  const out = $('#out');
  out.innerHTML = md(LAST_OUT);
  collapseSections();
  renderDecisionPanel(LAST_OUT);
  markErrorLines();
  renderAuditControls();
  renderErrorFilter(LAST_OUT);
  renderPostBar();
  paintErrFixSpans();
  toast('已修正 ✓ 该条批注自动标为「已修」');
}
(function bindErrFixEdit(){
  const out = $('#out');
  if(!out) return;
  out.addEventListener('click', e => {
    const sp = e.target.closest('.err-fix');
    if(!sp || sp.classList.contains('editing')) return;
    sp.classList.add('editing');
    sp.dataset.orig = sp.textContent;
    sp.contentEditable = 'plaintext-only';
    sp.focus();
    const r = document.createRange(); r.selectNodeContents(sp);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  out.addEventListener('keydown', e => {
    const sp = e.target.closest && e.target.closest('.err-fix.editing');
    if(!sp) return;
    if(e.key === 'Enter'){ e.preventDefault(); sp.blur(); }
    if(e.key === 'Escape'){ sp.dataset.cancel = '1'; sp.blur(); }
  });
  out.addEventListener('focusout', e => {
    const sp = e.target.closest && e.target.closest('.err-fix.editing');
    if(!sp) return;
    sp.classList.remove('editing');
    sp.contentEditable = 'false';
    const cancel = sp.dataset.cancel === '1';
    delete sp.dataset.cancel;
    const orig = sp.dataset.orig || '';
    const nv = (sp.textContent || '').trim();
    if(cancel || nv === orig || !nv){ paintErrFixSpans(); return; }
    applyProofEdit(sp.dataset.fp, orig, nv);
  });
})();

/* ═══════════ 专名一致性体检（v4.28.0，本地零流量，参考 Okapi TermChecker 思路自研） ═══════════ */
function proNounAudit(outText, srcText){
  const F = []; outText = String(outText || ''); srcText = String(srcText || '');
  const nz = s => s.replace(/\s+/g, '');
  // ① 同名异译：「中文名（Latin）」括号绑定，同一外文名对应多种中文译法
  const bind = {};
  const reB = /([一-龥·]{2,14})[（(]([A-Z][A-Za-zÀ-ÿ.'’\- ]{1,40}?)[）)]/g;
  let m;
  while((m = reB.exec(outText))){
    const k = nz(m[2]).toLowerCase();
    (bind[k] = bind[k] || new Set()).add(nz(m[1]));
  }
  Object.keys(bind).forEach(k => {
    const s = bind[k];
    if(s.size > 1){
      const v = [...s];
      F.push({ t: '同名异译', ev: v.join(' / '), d: '同一原文名「' + k + '」在译文里对应 ' + s.size + ' 种不同译法', sugg: v, fixable: true });
    }
  });
  // ② 疑似未译：原文明有的外文多词专名，译文里仍是裸原文（且不在括号里）
  if(srcText){
    const bareRe = /(?<![A-Za-zÀ-ÿ])([A-ZÀ-Þ][a-zà-ÿ'’]+(?:\s+[A-ZÀ-Þ][a-zà-ÿ'’]+)+)(?![a-zà-ÿ])/g;
    const srcL = new Set((srcText.match(bareRe) || []).map(nz));
    const bare = {}; let mm;
    while((mm = bareRe.exec(outText))){
      const before = outText[mm.index - 1] || '';
      if(before === '（' || before === '(') continue;
      bare[mm[1]] = (bare[mm[1]] || 0) + 1;
    }
    Object.keys(bare).forEach(k => {
      if(srcL.has(nz(k))) F.push({ t: '疑似未译', ev: k, d: '原文明有这个词，译文里还是原文（出现 ' + bare[k] + ' 次），可能漏译或没附中文译名', fixable: false });
    });
    // ③ 数字对不上：原文里 ≥3 位的数字（年份/数据）在译文里找不到（中文邻接也算边界）
    const numSet = s => new Set((s.match(/(?<![\d,.])\d[\d,.]{0,12}(?![\d,.])/g) || []).filter(n => n.replace(/[,.]/g, '').length >= 3));
    const ns = numSet(srcText), no = numSet(outText); let c = 0;
    ns.forEach(n => {
      if(!no.has(n) && c < 8){ c++; F.push({ t: '数字对不上', ev: n, d: '原文有 ' + n + '，译文里找不到（可能漏译或被改动）', fixable: false }); }
    });
  }
  return F.slice(0, 20);
}
function pnOpen(){
  if(!LAST_OUT){ toast('还没有校对结果', 'w'); return; }
  const F = __TP_FILES.src || __TP_FILES.dst;
  const list = proNounAudit(LAST_OUT, F ? F.fullText : '');
  if(!list.length){ modal('🔎 专名体检', '<div class="alert i">没发现明显的专名 / 数字不一致——本地零流量检查完成。</div>'); return; }
  let html = '<div class="alert i" style="margin-bottom:10px">本地零流量核对（同名异译 / 疑似未译 / 数字丢失）。可统一的选一种译法点「统一」，其余点「跳过」。</div>';
  list.forEach((f, i) => {
    html += '<div style="border:1px solid var(--bd);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">' +
      '<div style="font-weight:var(--fw-strong)"><span class="t-tag" style="border-color:var(--warn);color:var(--warn)">' + esc(f.t) + '</span> ' + esc(f.ev) + '</div>' +
      '<div style="font-size:12px;color:var(--tx2);margin-top:4px">' + esc(f.d) + '</div>';
    if(f.fixable){
      html += '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        f.sugg.map((z, j) => '<label style="font-size:12px"><input type="radio" name="pn-' + i + '" value="' + esc(z) + '"' + (j === 0 ? ' checked' : '') + '> ' + esc(z) + '</label>').join('') +
        '<button class="btn pri sm" data-pn-unify="' + i + '">统一为所选</button></div>';
    } else {
      html += '<div style="margin-top:6px"><button class="btn gray sm" data-pn-skip="' + i + '">跳过</button></div>';
    }
    html += '</div>';
  });
  modal('🔎 专名体检 · ' + list.length + ' 条', html);
  $$('#mBody [data-pn-unify]').forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.pnUnify;
      const sel = $('#mBody input[name="pn-' + i + '"]:checked');
      if(!sel) return;
      const keep = sel.value;
      let n = 0;
      list[i].sugg.forEach(z => {
        if(z === keep) return;
        const c = LAST_OUT.split(z).length - 1;
        if(c){ n += c; LAST_OUT = LAST_OUT.split(z).join(keep); }
      });
      if(!n){ toast('没有找到其它译法', 'w'); return; }
      $('#out').innerHTML = md(LAST_OUT);
      collapseSections(); markErrorLines(); renderAuditControls(); paintErrFixSpans();
      saveTask();
      const box = b.closest('div[style]');
      if(box) box.style.opacity = .45;
      b.disabled = true; b.textContent = '✓ 已统一（' + n + ' 处）';
      toast('已统一为「' + keep + '」（' + n + ' 处）');
    };
  });
  $$('#mBody [data-pn-skip]').forEach(b => {
    b.onclick = () => { b.disabled = true; b.textContent = '已跳过'; const box = b.closest('div[style]'); if(box) box.style.opacity = .45; };
  });
}
$('#btn-pnoun') && ($('#btn-pnoun').onclick = pnOpen);

/* ═══════════ 三栏逐句对照视图（T-001 · v4.30.0 · 零 token）═══════════
   原文｜原译｜修订 三栏逐句对齐，全部在本地完成，不调 AI、不花 token。
   · 修订栏 = extractProofText(LAST_OUT)，即模型输出里的「## 一、修订后译文」
   · 原译栏 = #dst，也就是送进校对的那份译稿
   · 原文栏 = #src（可选，没填就标「未填写」）
   对齐规则（关键）：先按空行切段，段序号一一对应；段内中文两栏（原译 / 修订）
   按句切分、按顺序配对，句数不等时多出来的句子单独成行 —— 任一行的文字都不会
   串到相邻行。跨语种的「原文」只按段整段展示，不做句级硬配：中英句子数量天然
   不等，硬配必然串行（T-001 验收要求「句对齐不串行」）。 */
let OUT_VIEW = 'doc';
let TRI_PB_DISP = '';

function triSplitParas(t){
  return String(t || '').replace(/\r/g, '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}
function triSplitSents(p){
  const s = String(p || '').replace(/\s+/g, ' ').trim();
  if(!s) return [];
  return s.split(/(?<=[。！？!?…；;])/).map(x => x.trim()).filter(Boolean);
}
function triEscRe(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function triBuildRe(frags){
  const uniq = [...new Set((frags || []).filter(f => f && String(f).length))].sort((a, b) => b.length - a.length);
  if(!uniq.length) return null;
  return new RegExp('(' + uniq.map(triEscRe).join('|') + ')', 'g');
}
function triHit(re, s){
  if(!re || !s) return false;
  re.lastIndex = 0;
  return re.test(s);
}
/* re 可传入预先拼好的正则（v4.35.0 性能关键：不再每渲染一句就重拼一次大正则） */
function triMark(text, frags, cls, re){
  const t = String(text || '');
  if(!t) return '';
  let useRe = re || null;
  if(!useRe){
    const fs2 = (frags || []).filter(f => f && t.indexOf(f) >= 0);
    if(!fs2.length) return esc(t);
    useRe = triBuildRe(fs2);
    if(!useRe) return esc(t);
  }
  const parts = t.split(useRe);
  if(parts.length < 2) return esc(t);
  return parts.map((seg, i) => (i % 2) ? '<span class="' + cls + '">' + esc(seg) + '</span>' : esc(seg)).join('');
}
/* 把 原文 / 原译 / 修订 三份文本整理成逐句行模型（纯函数，便于测试） */
function triBuild(){
  const src = (($('#src') || {}).value || '');
  const dst = (($('#dst') || {}).value || '');
  const rev = (typeof extractProofText === 'function' ? extractProofText(LAST_OUT) : null) || '';
  const edits = (typeof parseEdits === 'function' ? parseEdits(LAST_OUT) : []) || [];
  const sp = triSplitParas(src), dp = triSplitParas(dst), rp = triSplitParas(rev);
  const rows = [];
  const nPara = Math.max(sp.length, dp.length, rp.length);
  const capped = nPara > 400;
  for(let i = 0; i < nPara && i < 400; i++){
    const o = triSplitSents(dp[i] || ''), w = triSplitSents(rp[i] || '');
    const n = Math.max(o.length, w.length, 1);
    for(let k = 0; k < n; k++){
      rows.push({ para: i + 1, k, src: k === 0 ? (sp[i] || '') : '', old: o[k] || '', neu: w[k] || '' });
    }
  }
  return { rows, edits, sp, dp, rp, nPara, capped };
}
function triCopyTable(){
  const M = triBuild();
  if(!M.rows.length){ toast('没有可复制的三栏内容', 'w'); return; }
  const lines = ['段落\t原文\t原译\t修订'];
  M.rows.forEach(r => {
    lines.push([r.k === 0 ? String(r.para) : '', r.k === 0 ? (M.sp[r.para - 1] || '') : '', r.old || '', r.neu || '']
      .map(x => String(x).replace(/[\t\n]+/g, ' ')).join('\t'));
  });
  const txt = lines.join('\n');
  const done = () => toast('已复制三栏表格（' + M.rows.length + ' 行，可直接粘贴到 Word / Excel）');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(done, () => toast('复制失败：浏览器没给剪贴板权限', 'e'));
  }else{
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); done(); }catch(e){ toast('复制失败', 'e'); }
    ta.remove();
  }
}
function renderTriView(){
  const box = $('#out-tri');
  if(!box) return;
  if(!LAST_OUT){
    box.innerHTML = '<div class="alert i">还没有校对结果。先在上方点「开始校对」，出结果后这里会自动生成三栏对照。</div>';
    return;
  }
  const M = triBuild();
  if(!M.rp.length){
    box.innerHTML = '<div class="alert w">这次输出里没找到「## 一、修订后译文」段落，没法生成三栏。可能模型只给了批注、没给修订全文 —— 可以在「设置」里换成更强的模型重跑，或先点「📝 改动对照」逐条看批注。</div>';
    return;
  }
  if(!M.dp.length){
    box.innerHTML = '<div class="alert i">「原译」栏是空的：请把送校对的译文填进上方文本框（或从「文件」载入），再切回三栏对照。</div>';
    return;
  }
  const toFrags = M.edits.map(e => e.to).filter(Boolean);
  const fromFrags = M.edits.map(e => e.from).filter(Boolean);
  /* v4.35.0 性能：正则只在这里拼一次，下面循环全部复用；
     命中片段收进 seen，最后据此判断哪些批注没在正文定位到。 */
  const reAdd = triBuildRe(toFrags), reDel = triBuildRe(fromFrags);
  const seen = new Set();
  const srcOn = !!((($('#src') || {}).value || '').trim());
  let changed = 0;
  // 按段分组：原文一格跨整段（grid-row:span N），原译/修订一格格逐句对齐，
  // 这样「原文整段」与「逐句」互不干扰，也不会出现某格空等高度
  const byPara = [];
  M.rows.forEach(r => { (byPara[r.para - 1] = byPara[r.para - 1] || []).push(r); });
  const body = byPara.map((rows, pi) => {
    const sp = (M.sp[pi] || '').trim();
    const srcHtml = sp ? esc(sp) : '<span class="tri-empty">' + (srcOn ? '—' : '（未填写原文）') + '</span>';
    let out = '<div class="tri-cell src' + (pi ? ' tri-p' : '') + '" style="grid-row:span ' + rows.length + '" data-para="' + (pi + 1) + '">' +
      '<span class="tri-num">¶' + (pi + 1) + '</span>' + srcHtml + '</div>';
    rows.forEach(r => {
      const hasAdd = triHit(reAdd, r.neu);
      const hasDel = triHit(reDel, r.old);
      if(hasAdd || hasDel) changed++;
      if(reAdd){ let m; reAdd.lastIndex = 0; while((m = reAdd.exec(r.neu))) seen.add(m[0]); }
      if(reDel){ let m; reDel.lastIndex = 0; while((m = reDel.exec(r.old))) seen.add(m[0]); }
      const neuHtml = r.neu ? triMark(r.neu, toFrags, 'tri-add', reAdd) : '<span class="tri-empty">—</span>';
      const oldHtml = r.old ? triMark(r.old, fromFrags, 'tri-del', reDel) : '<span class="tri-empty">—</span>';
      out += '<div class="tri-row" data-para="' + r.para + '" data-row="' + r.k + '">' +
        '<div class="tri-cell old' + (r.k ? '' : ' tri-p') + '">' + oldHtml + '</div>' +
        '<div class="tri-cell neu' + (r.k ? '' : ' tri-p') + '">' + (hasAdd ? '<span class="tri-dot" title="本句有改动"></span>' : '') + neuHtml + '</div>' +
        '</div>';
    });
    return out;
  }).join('');
  const missing = M.edits.filter(e => !((e.to && seen.has(e.to)) || (e.from && seen.has(e.from))));
  box.innerHTML =
    '<div class="tri-bar">' +
      '<span class="tri-note">' + M.nPara + ' 段 · ' + M.rows.length + ' 句 · 批注 ' + M.edits.length + ' 处' +
        (changed ? '（' + changed + ' 句含改动）' : '') + ' · 本地生成，不花 token' + (M.capped ? ' · 超过 400 段只显示前 400 段' : '') + '</span>' +
      '<span style="flex:1"></span>' +
      '<button class="btn gray sm" id="tri-copy">⧉ 复制三栏表格</button>' +
      '<button class="btn gray sm" id="tri-copy-rev">⧉ 复制修订全文</button>' +
      '<button class="btn gray sm" id="tri-back">↩ 回文档视图</button>' +
    '</div>' +
    '<div class="tri-table"><div class="tri-head"><div>原文' + (srcOn ? '' : '（未填写）') + '</div><div>原译（送校对稿）</div><div>修订（模型改后）</div></div>' + body + '</div>' +
    (missing.length ? '<div class="tri-miss">⚠ 有 ' + missing.length + ' 条批注没在正文里定位到（可能被并段或改写幅度太大）：' +
      missing.slice(0, 8).map(e => '「' + esc(e.to || e.from) + '」').join('、') + (missing.length > 8 ? ' 等' : '') +
      '。它们仍可在「📝 改动对照」里逐条查看。</div>' : '');
  $('#tri-copy').onclick = triCopyTable;
  $('#tri-copy-rev').onclick = () => {
    const rev = (typeof extractProofText === 'function' ? extractProofText(LAST_OUT) : '') || '';
    if(!rev){ toast('没有可复制的修订全文', 'w'); return; }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(rev).then(() => toast('已复制修订全文'), () => toast('复制失败：浏览器没给剪贴板权限', 'e'));
    }else{
      const ta = document.createElement('textarea'); ta.value = rev; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); toast('已复制修订全文'); }catch(e){ toast('复制失败', 'e'); }
      ta.remove();
    }
  };
  $('#tri-back').onclick = () => setOutView('doc');
}
/* ═══════════ 三栏对照 · 翻译区直出（v4.35.0）═══════════
   原先三栏只能在校对结果里看、得等跑完。现在译文框下加开关，翻译时就能并排看
   原文｜译文，校对跑完自动带上修订列——同一套 triBuild，本地生成、不花 token。 */
let TRI_INLINE_ON = false;
let TRI_INLINE_TIMER = null;

function triInlineHead(){
  const srcOn = !!((($('#src') || {}).value || '').trim());
  return '<div class="tri-head"><div>原文' + (srcOn ? '' : '（未填写）') + '</div><div>译文</div><div>修订' + (LAST_OUT ? '' : '（未校对）') + '</div></div>';
}

function renderTriInline(){
  const box = $('#tri-inline');
  if(!box) return;
  if(!TRI_INLINE_ON){ box.style.display = 'none'; return; }
  box.style.display = '';
  const srcVal = ((($('#src') || {}).value || '')).trim();
  const dstVal = ((($('#dst') || {}).value || '')).trim();
  if(!srcVal && !dstVal){
    box.innerHTML = '<div class="alert i">把原文和译文贴进来，这里会实时三栏并排；校对跑完后自动补上「修订」列。</div>';
    return;
  }
  const M = triBuild();
  const hasRev = !!M.rp.length;
  const MAXR = 300;
  const total = M.rows.length;
  const byPara = [];
  M.rows.slice(0, MAXR).forEach(r => { (byPara[r.para - 1] = byPara[r.para - 1] || []).push(r); });
  const toFrags = M.edits.map(e => e.to).filter(Boolean);
  const fromFrags = M.edits.map(e => e.from).filter(Boolean);
  const reAdd = triBuildRe(toFrags), reDel = triBuildRe(fromFrags);
  const body = byPara.map((rows, pi) => {
    if(!rows || !rows.length) return '';
    const sp = (M.sp[pi] || '').trim();
    const srcHtml = sp ? esc(sp) : '<span class="tri-empty">' + (srcVal ? '—' : '（未填写原文）') + '</span>';
    let out = '<div class="tri-cell src' + (pi ? ' tri-p' : '') + '" style="grid-row:span ' + rows.length + '" data-para="' + (pi + 1) + '">' +
      '<span class="tri-num">¶' + (pi + 1) + '</span>' + srcHtml + '</div>';
    rows.forEach(r => {
      const neuHtml = r.neu ? (hasRev ? triMark(r.neu, toFrags, 'tri-add', reAdd) : esc(r.neu)) : '<span class="tri-empty">—</span>';
      const oldHtml = r.old ? triMark(r.old, fromFrags, 'tri-del', reDel) : '<span class="tri-empty">—</span>';
      out += '<div class="tri-row" data-para="' + r.para + '" data-row="' + r.k + '">' +
        '<div class="tri-cell old' + (r.k ? '' : ' tri-p') + '">' + oldHtml + '</div>' +
        '<div class="tri-cell neu' + (r.k ? '' : ' tri-p') + '">' + neuHtml + '</div>' +
        '</div>';
    });
    return out;
  }).join('');
  box.innerHTML =
    '<div class="tri-bar">' +
      '<span class="tri-note">' + M.nPara + ' 段 · ' + total + ' 句' +
        (hasRev ? ' · 带修订列' : ' · 校对跑完自动补修订列') +
        (total > MAXR ? ' · 只显示前 ' + MAXR + ' 句' : '') + ' · 本地生成，不花 token</span>' +
      '<span style="flex:1"></span>' +
      (hasRev ? '<button class="btn gray sm" id="tri-inline-copy">⧉ 复制三栏表格</button>' : '') +
      '<button class="btn gray sm" id="tri-inline-close">收起</button>' +
    '</div>' +
    '<div class="tri-table">' + triInlineHead() + body + '</div>';
  const cp = $('#tri-inline-copy'); if(cp) cp.onclick = triCopyTable;
  const cl = $('#tri-inline-close'); if(cl) cl.onclick = () => triInlineToggle(false);
}

function triInlineToggle(on){
  TRI_INLINE_ON = (typeof on === 'boolean') ? on : !TRI_INLINE_ON;
  const btn = $('#btn-tri-inline');
  if(btn){
    btn.classList.toggle('vs-on', TRI_INLINE_ON);
    btn.textContent = TRI_INLINE_ON ? '📊 收起三栏' : '📊 三栏对照';
  }
  renderTriInline();
}

function triInlineSchedule(){
  if(!TRI_INLINE_ON) return;
  clearTimeout(TRI_INLINE_TIMER);
  TRI_INLINE_TIMER = setTimeout(renderTriInline, 300);
}

function setOutView(v){
  OUT_VIEW = (v === 'tri' && LAST_OUT) ? 'tri' : 'doc';
  const doc = $('#out'), tri = $('#out-tri');
  if(!doc || !tri) return;
  const pb = $('#post-bar');
  doc.style.display = OUT_VIEW === 'tri' ? 'none' : '';
  tri.style.display = OUT_VIEW === 'tri' ? '' : 'none';
  if(pb){
    if(OUT_VIEW === 'tri'){ TRI_PB_DISP = pb.style.display; pb.style.display = 'none'; }
    else pb.style.display = TRI_PB_DISP;
  }
  $$('#view-seg [data-view]').forEach(b => b.classList.toggle('vs-on', b.dataset.view === OUT_VIEW));
  if(OUT_VIEW === 'tri') renderTriView();
}
/* 每次出结果 / 恢复存档后刷新切换条；没有结果时强制回文档视图 */
function syncOutView(){
  const seg = $('#view-seg');
  if(seg) seg.style.display = LAST_OUT ? 'flex' : 'none';
  if(!LAST_OUT && OUT_VIEW === 'tri') OUT_VIEW = 'doc';
  setOutView(OUT_VIEW);
  if(TRI_INLINE_ON) renderTriInline();
}
$$('#view-seg [data-view]').forEach(b => { b.onclick = () => setOutView(b.dataset.view); });
