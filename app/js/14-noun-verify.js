/* ═══════════ T-022 专名核验 + 术语表回填（v4.39.0）═══════════
   前半：翻译页勾选「翻译后抽专名」→ 译完自动抽专名 + 建议译名 → 回填专有译词库（待审核）。
   后半：专有译词库「🔎 专名核验」面板 → AI 核验 / 人工回填真 URL / 批准 / 一键统一全文。
   衔接：proNounAudit 的同名异译思路、GLOSS、approvedGloss、verifyEntries。 */

/* ── 专名收集（AI 抽取 + 建议译名，回填词库 pending）── */
const TS_COLLECT_SYS = '你是翻译项目的专名收集助手。从原文里抽专有名词（人名、地名、机构、著作、事件、重要概念术语），给一个通行的中文译名建议。宁可漏，不瞎编；不确定译名的条目不要输出。只输出 JSON 数组：[{"foreign":"外文原词","zh":"建议译名","type":"人物|概念|著作|学派|机构|事件|其他","note":"≤30字依据"}]，没有就输出 []。';

async function tsCollectNouns(src){
  src = String(src || '').trim();
  if(!src){ return null; }
  if(!CFG.apiKey){ toast('已跳过专名收集：设置里还没填模型 Key', 'w'); return null; }
  const MAX = 12000;
  const snippet = src.length > MAX ? src.slice(0, MAX) : src;
  try{
    const r = await callModelSimple(TS_COLLECT_SYS, '【原文】' + String.fromCharCode(10) + snippet, 1600);
    const arr = extractJsonArray(r && r.text ? r.text : '');
    if(!Array.isArray(arr) || !arr.length){ toast('专名收集：模型没有抽到专名', 'w'); return null; }
    let sid = 's-trans-noun';
    if(!GLOSS.sources.find(s => s.id === sid)){
      GLOSS.sources.push({ id: sid, name: '翻译专名收集', kind: 'trans', date: new Date().toISOString(), count: 0 });
    }
    let added = 0, skipped = 0;
    for(const x of arr){
      const foreign = normText(x.foreign || '');
      const zh = normText(x.zh || '');
      if(!foreign || !zh) continue;
      if(GLOSS.terms.some(t => t.foreign && fKey(t.foreign) === fKey(foreign))){ skipped++; continue; }
      GLOSS.terms.push({
        id: GID++, zh: zh, foreign: foreign, aliases: [], type: guessType(zh, foreign),
        tags: ['专名收集'], note: normText(x.note || ''), sources: [sid],
        occurrences: [], collections: [], status: 'pending', recommend: '', url: '',
        created: Date.now(), updated: Date.now()
      });
      added++;
    }
    const srcObj = GLOSS.sources.find(s => s.id === sid);
    if(srcObj) srcObj.count += added;
    saveGloss();
    glossLog('collect', 'trans', null, { added: added, skipped: skipped });
    if(typeof renderGloss === 'function') renderGloss();
    toast('专名收集：新增 ' + added + ' 条到专有译词库（待审核）' + (skipped ? '，跳过重复 ' + skipped : '') + ' → 去「专有译词库 → 专名核验」拍板');
    return { added: added, skipped: skipped };
  }catch(e){
    toast('专名收集失败：' + errMsg(e), 'w');
    return null;
  }
}

/* ── 新词/术语收集（T-024：一边译一边填术语表）── */
const TS_COLLECT_TERM_SYS = '你是翻译项目的术语收集助手。从原文里抽「新术语 / 专业词 / 反复出现的关键词」（不限于专有名词），给一个通行的中文译名建议。宁可漏，不瞎编；不确定译名的条目不要输出。只输出 JSON 数组：[{"foreign":"外文原词","zh":"建议译名","type":"人物|概念|著作|学派|机构|事件|其他","note":"≤30字依据"}]，没有就输出 []。';

async function tsCollectTerms(src){
  src = String(src || '').trim();
  if(!src){ return null; }
  if(!CFG.apiKey){ toast('已跳过术语收集：设置里还没填模型 Key', 'w'); return null; }
  const MAX = 12000;
  const snippet = src.length > MAX ? src.slice(0, MAX) : src;
  try{
    const r = await callModelSimple(TS_COLLECT_TERM_SYS, '【原文】' + String.fromCharCode(10) + snippet, 1600);
    const arr = extractJsonArray(r && r.text ? r.text : '');
    if(!Array.isArray(arr) || !arr.length){ toast('术语收集：模型没有抽到新词', 'w'); return null; }
    let sid = 's-trans-term';
    if(!GLOSS.sources.find(s => s.id === sid)){
      GLOSS.sources.push({ id: sid, name: '翻译术语收集', kind: 'trans', date: new Date().toISOString(), count: 0 });
    }
    let added = 0, skipped = 0;
    for(const x of arr){
      const foreign = normText(x.foreign || '');
      const zh = normText(x.zh || '');
      if(!foreign || !zh) continue;
      if(GLOSS.terms.some(t => t.foreign && fKey(t.foreign) === fKey(foreign))){ skipped++; continue; }
      GLOSS.terms.push({
        id: GID++, zh: zh, foreign: foreign, aliases: [], type: guessType(zh, foreign),
        tags: ['术语收集'], note: normText(x.note || ''), sources: [sid],
        occurrences: [], collections: [], status: 'pending', recommend: '', url: '',
        created: Date.now(), updated: Date.now()
      });
      added++;
    }
    const srcObj = GLOSS.sources.find(s => s.id === sid);
    if(srcObj) srcObj.count += added;
    saveGloss();
    glossLog('collect', 'trans', null, { added: added, skipped: skipped });
    if(typeof renderGloss === 'function') renderGloss();
    toast('术语收集：新增 ' + added + ' 条到专有译词库（待审核）' + (skipped ? '，跳过重复 ' + skipped : '') + ' → 去「专有译词库」拍板');
    return { added: added, skipped: skipped };
  }catch(e){
    toast('术语收集失败：' + errMsg(e), 'w');
    return null;
  }
}

/* ── 专名核验面板 ── */
function gvPendingTerms(){
  return GLOSS.terms.filter(t => t && t.status === 'pending' && t.foreign && t.zh)
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
function renderGvPanel(){
  const box = $('#gv-list');
  if(!box) return;
  const list = gvPendingTerms();
  const MAXN = 20;
  const shown = list.slice(0, MAXN);
  if(!shown.length){
    box.innerHTML = '<div class="alert i">没有待核验的词条。翻译页勾选「翻译后抽专名」译完自动收集，或到词条管理把词条打回「待审核」，这里就会出现核验清单。</div>';
  } else {
    box.innerHTML = shown.map(t => {
      const urlBtn = t.url
        ? '<a class="btn gray sm" href="' + esc(t.url) + '" target="_blank" rel="noopener" title="打开依据 URL">🔗 依据</a>'
        : '<button class="btn gray sm" data-gv-url="' + t.id + '" title="人工回填证明这条译法的真 URL">🔗 回填依据</button>';
      return '<div class="gv-row" data-id="' + t.id + '" style="display:flex;gap:10px;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid var(--bd);border-radius:8px;margin-bottom:6px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13.5px;font-weight:600">' + esc(t.zh) + (t.type ? ' <span class="g-tag">' + esc(t.type) + '</span>' : '') + (t.url ? ' <span style="font-size:11px;color:var(--ok)">有依据</span>' : '') + '</div>' +
          '<div style="font-size:12.5px;color:var(--tx2)">' + esc(t.foreign) + '</div>' +
          (t.note ? '<div style="font-size:11.5px;color:var(--tx3)">' + esc(t.note) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' +
          '<button class="btn sm" data-gv-wiki="' + t.id + '">🔎 查维基</button>' +
          '<button class="btn sm" data-gv-verify="' + t.id + '">🤖 核验</button>' +
          urlBtn +
          '<button class="btn sm" data-gv-approve="' + t.id + '">✓ 批准</button>' +
          '<button class="btn gray sm" data-gv-reject="' + t.id + '">✕ 拒绝</button>' +
        '</div>' +
      '</div>';
    }).join('') + (list.length > MAXN ? '<div class="muted sm" style="margin-top:8px">还有 ' + (list.length - MAXN) + ' 条待核验，请到「词条管理」按状态筛「待审核」。</div>' : '');
  }
  const batchBtn = $('#btn-gv-batch');
  if(batchBtn){
    batchBtn.disabled = !list.length;
    batchBtn.textContent = '🤖 AI 批量核验' + (list.length ? '（' + list.length + ' 条）' : '');
  }
  const unifyBtn = $('#btn-gv-unify');
  if(unifyBtn) unifyBtn.disabled = !approvedGloss().length;

  box.querySelectorAll('[data-gv-verify]').forEach(b => {
    b.onclick = async () => {
      const t = GLOSS.terms.find(x => String(x.id) === String(b.dataset.gvVerify));
      if(!t) return;
      const items = [{ src: t.foreign || '', dst: t.zh || '', extra: t.type || '' }];
      const vs = await verifyEntries(items, b);
      if(!vs) return;
      showVerifyResults(items, vs, {
        onApprove: () => { glossSetStatus(t.id, 'confirmed'); renderGvPanel(); },
        onAdopt: (k, v) => {
          if(!v.suggest) return false;
          t.zh = v.suggest; t.status = 'pending';
          saveGloss(); glossLog('status', 'term:' + t.id, 'adopt', 'pending');
          if(typeof renderGlossTable === 'function') renderGlossTable();
          renderGvPanel();
          toast('已改为建议译法，状态仍是「待审核」');
          return true;
        }
      });
    };
  });
  box.querySelectorAll('[data-gv-wiki]').forEach(b => {
    b.onclick = () => {
      const t = GLOSS.terms.find(x => String(x.id) === String(b.dataset.gvWiki));
      if(t && typeof gvWikiLookup === 'function') gvWikiLookup(t);
    };
  });
  box.querySelectorAll('[data-gv-url]').forEach(b => {
    b.onclick = () => {
      const t = GLOSS.terms.find(x => String(x.id) === String(b.dataset.gvUrl));
      if(t) gvSetUrl(t);
    };
  });
  box.querySelectorAll('[data-gv-approve]').forEach(b => {
    b.onclick = () => {
      const t = GLOSS.terms.find(x => String(x.id) === String(b.dataset.gvApprove));
      if(t && glossSetStatus(t.id, 'confirmed')) renderGvPanel();
    };
  });
  box.querySelectorAll('[data-gv-reject]').forEach(b => {
    b.onclick = () => {
      const t = GLOSS.terms.find(x => String(x.id) === String(b.dataset.gvReject));
      if(t && glossSetStatus(t.id, 'rejected')) renderGvPanel();
    };
  });
}

function gvSetUrl(t){
  const cur = t.url || '';
  modal('🔗 回填依据 URL', [
    '<div style="font-size:13.5px;margin-bottom:6px"><b>' + esc(t.zh || '—') + '</b> <span style="color:var(--tx2)">' + esc(t.foreign || '') + '</span></div>',
    '<p style="font-size:12.5px;color:var(--tx2);margin-bottom:8px">把证明这条译法的<b>真 URL</b>贴进来（学术库 / 维基 / 出版社页面都行）。AI 核验给的是建议，真 URL 才是你拍板的依据；留空并保存 = 清空依据。</p>',
    '<input id="gv-url-input" value="' + esc(cur) + '" placeholder="https://…" style="width:100%">',
    '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri sm" id="gv-url-save">保存</button><button class="btn gray sm" id="gv-url-cancel">取消</button></div>'
  ].join(''));
  $('#gv-url-save').onclick = () => {
    const v = normText($('#gv-url-input').value);
    if(v && (v.indexOf('http://') !== 0 && v.indexOf('https://') !== 0)){ toast('URL 需以 http(s):// 开头', 'w'); return; }
    t.url = v; t.updated = Date.now();
    saveGloss(); glossLog('url', 'term:' + t.id, cur, v);
    closeModal(); renderGvPanel();
    if(typeof renderGlossTable === 'function') renderGlossTable();
    toast(v ? '依据 URL 已保存' : '已清空依据 URL');
  };
  $('#gv-url-cancel').onclick = closeModal;
}

/* ── AI 批量核验待审核词条（一次最多 20 条）── */
async function gvBatchVerify(){
  const list = gvPendingTerms().slice(0, 20);
  if(!list.length){ toast('没有待核验的词条', 'w'); return; }
  const items = list.map(t => ({ src: t.foreign || '', dst: t.zh || '', extra: t.type || '' }));
  const vs = await verifyEntries(items, $('#btn-gv-batch'));
  if(!vs) return;
  showVerifyResults(items, vs, {
    note: '共 ' + items.length + ' 条待审核词条。采纳建议 = 改成建议译法（仍待审核）；批准 = 设为「已批准」开始全文锁定。',
    onApprove: (i) => { glossSetStatus(list[i].id, 'confirmed'); },
    onAdopt: (i, v) => {
      if(!v.suggest) return false;
      const t = list[i];
      t.zh = v.suggest; t.status = 'pending';
      saveGloss(); glossLog('status', 'term:' + t.id, 'adopt', 'pending');
      return true;
    }
  });
  renderGvPanel();
  if(typeof renderGlossTable === 'function') renderGlossTable();
}

/* ── 一键统一全文：按已批准词条，把「其他译法（外文）」统一成批准译法 ── */
function gvUnifyInText(text, terms){
  let out = String(text || ''), n = 0;
  const nz = s => String(s || '').split('').filter(c => c.charCodeAt(0) > 32).join('').toLowerCase();
  for(const t of terms){
    const foreign = normText(t.foreign || '');
    if(!foreign) continue;
    const fk = nz(foreign);
    const zh = normText(t.zh || '');
    if(!zh) continue;
    const aliases = (t.aliases || []).map(x => normText(x)).filter(Boolean);
    const opens = ['（', '('];
    for(let oi = 0; oi < opens.length; oi++){
      const open = opens[oi];
      const close = open === '（' ? '）' : ')';
      let idx = 0;
      while((idx = out.indexOf(open, idx)) !== -1){
        const closeIdx = out.indexOf(close, idx + 1);
        if(closeIdx === -1 || closeIdx - idx - 1 > 60){ idx++; continue; }
        const fn = out.slice(idx + 1, closeIdx);
        if(nz(fn) !== fk){ idx = closeIdx + 1; continue; }
        let j = idx - 1, zhPart = '';
        while(j >= 0 && zhPart.length < 14){
          const ch = out[j];
          if(/[一-龥·]/.test(ch)){ zhPart = ch + zhPart; j--; }
          else break;
        }
        zhPart = normText(zhPart);
        if(zhPart && zhPart !== zh && aliases.indexOf(zhPart) !== -1){
          out = out.slice(0, j + 1) + zh + out.slice(j + 1 + zhPart.length);
          n++;
          idx = j + 1 + zh.length;
        } else {
          idx = closeIdx + 1;
        }
      }
    }
  }
  return { out: out, n: n };
}
function gvUnifyAll(){
  const terms = approvedGloss();
  if(!terms.length){ toast('没有「已批准」的词条可统一', 'w'); return; }
  const r1 = gvUnifyInText(LAST_OUT, terms);
  const r2 = gvUnifyInText(TS_LAST_OUT, terms);
  let total = r1.n + r2.n;
  if(!total){ toast('全文没有发现与已批准译名不一致的写法（只统一「中文（外文）」括号绑定形式）', 'w'); return; }
  if(r1.n){
    LAST_OUT = r1.out;
    $('#out').innerHTML = md(LAST_OUT);
    collapseSections(); markErrorLines(); renderAuditControls(); paintErrFixSpans();
  }
  if(r2.n){
    TS_LAST_OUT = r2.out;
    $('#ts-out').innerHTML = md(TS_LAST_OUT);
  }
  saveTask();
  toast('一键统一完成：替换 ' + total + ' 处（校对结果 ' + r1.n + '，译文 ' + r2.n + '）');
}

/* ── 事件绑定 ── */
$('#btn-gv-batch') && ($('#btn-gv-batch').onclick = gvBatchVerify);
$('#btn-gv-unify') && ($('#btn-gv-unify').onclick = gvUnifyAll);

/* 页面初始化时先渲染一次（此后由 renderGloss 负责刷新） */
if($('#gv-list')) renderGvPanel();

/* 测试与外部调用出口 */
window.gvUnifyInText = gvUnifyInText;
window.tsCollectNouns = tsCollectNouns;
window.tsCollectTerms = tsCollectTerms;
window.renderGvPanel = renderGvPanel;
