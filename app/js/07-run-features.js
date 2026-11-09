/* ═══════════ 提示词构建（模板驱动：文本全部来自 TPL，可被 config.js 覆盖） ═══════════ */
function fill(str, map){ return String(str).replace(/\{\{(\w+)\}\}/g, (m,k) => (map[k] !== undefined ? map[k] : m)); }
function buildSystem(){
  const V = {
    lang: $('#lang').value || '（自动判断）',
    genre: $('#genre').value || '通用文本',
    tone: $('#tone').value,
    depth: $('#depth').value,
    style: $('#style').value,
    variant: $('#variant').value
  };
  const hasSrc = !!$('#src').value.trim();
  const depth = V.depth;

  const L = [];
  L.push(fill(TPL.role, V));
  L.push('');
  L.push(TPL.paramsHeader);
  L.push(fill(TPL.paramsLine, V));
  (TPL.paramsMore||[]).forEach(s => L.push(fill(s, V)));

  L.push('');
  L.push(TPL.rulesHeader);
  (TPL.rules||[]).forEach(r => {
    if(r.startsWith('3. 对照原文') && !hasSrc) return; /* 无原文时跳过该条 */
    L.push(fill(r, V));
  });

  if($('#c-term').checked){
    if(TERMS.length){
      L.push('');
      L.push(TPL.termHeader);
      TERMS.slice(0, 300).forEach(t => {
        L.push('· ' + t.src + ' → ' + t.dst + (t.note ? '（' + t.note + '）' : ''));
      });
      L.push(fill(TPL.termFoot, V));
    }else{
      L.push('');
      L.push(TPL.termEmptyHeader);
      L.push(fill(TPL.termEmpty, V));
    }

    // M4（T-012）：已批准专有译词同样注入，锁定一致 —— 走 approvedGloss() 唯一闸门（09-gloss.js 定义，本文件加载早于 09，需守卫）
    const _ag = (typeof approvedGloss === 'function') ? approvedGloss() : (GLOSS.terms || []).filter(t => t && t.status === 'confirmed' && t.foreign && t.zh);
    if(_ag.length){
      L.push('');
      L.push('【已批准专有译词 · 锁定一致】以下词条经审核「已批准」，全文必须严格照译、保持一致；未列入（待审核/已拒绝）的译法不强制。');
      _ag.slice(0, 120).forEach(t => {
        L.push('· ' + t.foreign + ' → ' + t.zh + (t.type ? '（' + t.type + '）' : ''));
      });
      const _agBrief = _ag.filter(t => t && t.brief);
      if(_agBrief.length){
        L.push('【已批准专名 · 背景速查】以下背景简介仅供理解语境，译名仍以上表锁定词条为准。');
        _agBrief.slice(0, 10).forEach(t => {
          L.push('· ' + t.foreign + ' → ' + t.zh + '：' + String(t.brief).slice(0, 120));
        });
      }
    }
  }

  if($('#c-ext').checked){ L.push(''); L.push(TPL.extHeader); L.push(fill(TPL.ext, V)); }
  if($('#c-note').checked){ L.push(''); L.push(TPL.noteHeader); L.push(fill(TPL.note, V)); }
  if($('#c-format').checked){ L.push(''); L.push(TPL.formatHeader); L.push(fill(TPL.format, V)); }
  if($('#c-deai').checked){ L.push(''); L.push(TPL.deaiHeader); L.push(fill(TPL.deai, V)); }

  if(PREFS.trim()){
    L.push('');
    L.push(TPL.prefsHeader);
    PREFS.split(/[；;\n]/).map(s => s.trim()).filter(Boolean).forEach(s => L.push('· ' + s));
  }

  // 翻译记忆：命中历史定稿的句子，原样保留（跳过重翻，省 token）
  const memHits = findMemoryMatches($('#src').value);
  if(memHits.length){
    L.push('');
    L.push('【历史定稿（翻译记忆）— 以下句子此前已定稿，请原样保留、不要改动】');
    memHits.slice(0, 20).forEach(h => L.push('- ' + h.src + ' → ' + h.dst));
  }
  // v4.23.0 P1：近似命中双档 —— 强（≥0.90）微调复用；弱（0.80–0.90）仅参考
  const fzKeys = new Set(memHits.map(h => tmKey(h.src)));
  const fzHits = findFuzzyMemory($('#src').value, fzKeys, TM_FUZZY_STRONG);
  if(fzHits.length){
    L.push('');
    L.push('【历史定稿 · 近似命中（相似度 ≥90%，仅差标点/错字/个别小改）】');
    L.push('若新句与旧句只差标点、错字、个别虚词或同义小改，按旧定稿微调后复用；若存在实质差异，忽略旧译、按新句处理。');
    fzHits.slice(0, 15).forEach(h => L.push('- ' + h.src + ' → ' + h.dst));
  }
  const fzRef = findFuzzyMemory($('#src').value, fzKeys, TM_FUZZY_WEAK, TM_FUZZY_STRONG);
  if(fzRef.length){
    L.push('');
    L.push('【历史定稿 · 相关参考（相似度 80%–90%，可能只是措辞相近）】');
    L.push('仅供风格与既有译法参考：若确为同句的轻微变体可沿用旧译思路；若句意已变，一律按新句处理，不得直接照抄旧译。');
    fzRef.slice(0, 10).forEach(h => L.push('- ' + h.src + ' → ' + h.dst));
  }

  const extra = $('#extra').value.trim();
  if(extra){
    L.push('');
    L.push(TPL.extraHeader);
    L.push(extra);
  }

  L.push('');
  L.push(TPL.outHeader);
  L.push('');
  const outKey = STAGE === 'pass1' ? 'outPass1' : STAGE === 'pass2' ? 'outPass2' : depth === '体检' ? 'outCheckup' : depth === '逐句' ? 'outSentence' : depth === '精修' ? 'outRefine' : 'outStandard';
  (TPL[outKey]||[]).forEach(s => L.push(fill(s, V)));
  if(STAGE === 'pass1'){
    L.push('', '【本次为一校·硬伤核对】只处理硬伤：漏译/增译/误译/术语不一致/歧义/逻辑关系/数字日期。不要做文风润色、修辞优化或"去机器腔"调整；中文表达通顺即可，保持原译风格。');
  }
  if(STAGE === 'pass2'){
    L.push('', '【本次为二校·文风润色】假定硬伤已在一校修正，本次只处理文风：去机器腔、优化中文表达、统一语体与标点格式。不要改动语义、术语译名与论证方向。');
  }
  if($('#c-ask').checked) (TPL.outAsk||[]).forEach(s => L.push(fill(s, V)));
  L.push('');
  (TPL.hard||[]).forEach(s => L.push(fill(s, V)));
  // 3.1 文档模式：注入段落对齐硬约束，保证修订后译文可逐段回写
  if(docModeActive()){
    L.push('【文档模式硬约束】本次校对结果将被程序逐段写回 Word 原文档，因此：');
    L.push('1.「修订后译文」部分的段落数量、顺序必须与待校对译文完全一致，不得增删、合并或拆分段落；');
    L.push('2. 段落之间用一个空行分隔；');
    L.push('3. 段内如无必要不要使用 Markdown 记号（**、# 等），直接输出纯文本；');
    L.push('4. 图片题注、图表说明所在段落视同普通段落校对，但保持段落独立。');
  } else {
    // v4.21.3：非文档模式也锁死换行/分段——否则 AI 默认把多段拍平成一大段，
    // 粘贴进 Word「保留原格式」也没有换行可保留
    L.push('【结构保持】「修订后译文」的换行与分段必须与待校对译文完全一致：待校对译文如何分行分段，译文就如何分行分段；不得把多段合并成一整段，不得随意拆分段落；相邻段落之间保留一个空行。');
  }
  // v4.22.0：注释标号锁定（脚注/尾注靠编号与原文对应，丢了就没法贴注）
  L.push('【注释标号】正文中的注释标号（如 [1]、(2)、上标数字）必须原样保留在译文对应位置，不得删除、改写、重排或换成其它编号。');
  // v4.29.1：制度纪律（md §4 禁令1 + §5.2 优先级链与不压平概念）
  L.push('【不猜补】遇到无法确认的人名、地名、机构名、历史事件等专名，以及数字、年代、引文、文献名、页码：一律保留原文，并在其后用括号标注（存疑）。绝不猜测、绝不凭印象改写或补全——宁可保留原文存疑，也不得编造看似合理的答案。');
  L.push('【优先级链】当几条要求相互冲突时，按以下优先级取舍：准确性 > 语言自然度 > 术语一致性。语言再流畅也不得牺牲事实准确；不得为了「读起来顺」而删并、压平或弱化原文中的概念区分、限定范围与细微差别。');

  /* 发送前钩子：外部工具可拦截并改写完整提示词 */
  return fireHook('beforeSend', L.join('\n'), V);
}

/* 3.1 文档模式：是否激活（勾选 + dst 是带 zip 的 docx） */
function docModeActive(){
  return !!($('#c-docmode') && $('#c-docmode').checked
    && __TP_FILES.dst && __TP_FILES.dst.kind === 'docx' && __TP_FILES.dst._zipBytes);
}

function buildUser(){
  const src = $('#src').value.trim();
  const dst = $('#dst').value.trim();
  if(src) return '【外文原文】\n' + src + '\n\n【待校对译文】\n' + dst;
  return '【中文稿 — 无外文原文，请作单语润色】\n' + dst;
}

/* ═══════════ 调用模型 ═══════════ */
async function callModel(sys, user, onDelta, which){
  const ctrl = new AbortController();
  // 按调用方归属各自的中断控制器，避免校对页/翻译页互相误中断
  if(which === 'trans'){ TS_ABORT = ctrl; } else { ABORT = ctrl; }
  const timer = setTimeout(() => ctrl.abort(), (CFG.timeout || 180) * 1000);
  try{
    const r = await fetch(CFG.baseUrl.replace(/\/+$/,'') + '/chat/completions', {
      method:'POST',
      signal: ctrl.signal,
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + CFG.apiKey },
      body: JSON.stringify({
        model: CFG.model,
        messages: [{ role:'system', content: sys }, { role:'user', content: user }],
        temperature: CFG.temp,
        max_tokens: CFG.maxTok,
        stream: true
      })
    });
    if(!r.ok){
      const t = await r.text();
      let msg = 'HTTP ' + r.status;
      try{ const j = JSON.parse(t); msg += ' — ' + (j.error?.message || j.message || t.slice(0,200)); }
      catch(e){ msg += ' — ' + t.slice(0,200); }
      if(r.status === 401) msg += '\n\n原因：API Key 无效或已过期。请到「设置」页检查。';
      if(r.status === 402) msg += '\n\n原因：账户余额不足。请到服务商后台充值。';
      if(r.status === 429) msg += '\n\n原因：请求过于频繁。稍等片刻再试。';
      throw new Error(msg);
    }
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = '', full = '', usage = null;
    while(true){
      const { done, value } = await rd.read();
      if(done) break;
      buf += dec.decode(value, { stream:true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for(const ln of lines){
        const s = ln.trim();
        if(!s || !s.startsWith('data:')) continue;
        const d = s.slice(5).trim();
        if(d === '[DONE]') continue;
        try{
          const j = JSON.parse(d);
          if(j.usage) usage = j.usage;
          const delta = j.choices?.[0]?.delta?.content
            || j.choices?.[0]?.delta?.reasoning_content
            || j.choices?.[0]?.message?.content;
          if(delta){ full += delta; onDelta && onDelta(delta, full); }
        }catch(e){}
      }
    }
    return { text: full, usage };
  } finally {
    clearTimeout(timer);
    if(which === 'trans'){ TS_ABORT = null; } else { ABORT = null; }
  }
}

/* ═══════════ 运行 ═══════════ */
function setRun(on, label){
  RUNNING = on;
  $('#btn-run').disabled = on || !!PAUSE;
  $('#btn-ext').disabled = on || !!PAUSE;
  $('#btn-stop').disabled = !on;
  $('#btn-pause').disabled = !on;
  if(!on && !PAUSE) $('#btn-pause').textContent = '⏸ 暂停';
  $('#runIco').innerHTML = on ? '<span class="spin"></span>' : '▶';
  if(label) $('#runTxt').textContent = label;
}
function fmt(n){ return n.toLocaleString('zh-CN'); }
function countChars(s){ return s.replace(/\s/g,'').length; }

/* ═══════════ 进度条（v4.14.0）═══════════ */
function showProgress(prefix){
  const w = document.getElementById((prefix || '') + 'progress-wrap');
  if(w) w.style.display = 'flex';
}
function hideProgress(prefix){
  const w = document.getElementById((prefix || '') + 'progress-wrap');
  if(w) w.style.display = 'none';
}
function updateProgress(chars, total, prefix){
  const pct = total > 0 ? Math.min(95, Math.round(chars / total * 100)) : 0;
  const bar = document.getElementById((prefix || '') + 'progress-bar');
  const txt = document.getElementById((prefix || '') + 'progress-txt');
  if(bar) bar.style.width = pct + '%';
  if(txt) txt.textContent = pct + '% · ' + fmt(chars) + ' 字';
}

/* ═══════════ 校对前「质量预估」（P1，借鉴 qe4pe/divemt 工作量预估）═══════════ */
const EST_SYS = [
  '你是一位资深翻译审校。现在只需「快速扫一眼」待校对的译文，输出质量预估，不要逐句修改。',
  '只花很少的注意力，给出：整体水平、问题最集中的段落、建议的校对阶段。',
  '严格只输出一个 JSON 对象（不要任何多余文字、不要 markdown 围栏），字段如下：',
  '{',
  '  "score": 0到100的整数（整体质量分，越高越好）',
  '  "level": "等级，S/A/B/C/D 之一"',
  '  "summary": "一句话总结整体水平与主要症结（中文，40字内）"',
  '  "hotspots": [{"para":"段落定位，如 第2段","issue":"该段最突出的问题（一句话）"}]，最多3条，确实没有就输出空数组',
  '  "suggestStage": "一校 或 二校（一校=先抓硬伤：漏译/误译/术语/数字日期；二校=精修文风去机器腔）"',
  '  "effort": "预计改动工作量：小/中/大"',
  '}',
  '要求：score 与 level 要互相匹配；只列问题确实集中的段落，不要凑数。'
].join('\n');

async function estimateQuality(){
  if(RUNNING) return;
  if(!CFG.apiKey){ toast('请先到「设置」页填写 API Key', 'e'); document.querySelector('nav button[data-page="p-set"]').click(); return; }
  if(!CFG.baseUrl || !CFG.model){ toast('请先到「设置」页补全接口地址与模型名', 'e'); return; }
  const src = $('#src').value.trim();
  const dst = $('#dst').value.trim();
  if(!dst){ toast('请先粘贴待校对的译文', 'e'); $('#dst').focus(); return; }

  const btn = $('#btn-estimate');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span><span>预估中…</span>';
  try{
    // 只扫前段（省 token，符合「快速扫一眼」定位，不做全文精读）
    const user = [
      src ? '【外文原文（节选）】\n' + src.slice(0, 2000) : '',
      '【译文（节选）】\n' + dst.slice(0, 4000),
      src && src.length > 2000 ? '（原文超过 2000 字，仅扫前段作快速预估）' : '',
      dst.length > 4000 ? '（译文超过 4000 字，仅扫前段作快速预估）' : ''
    ].filter(Boolean).join('\n\n');

    const { text } = await callModelSimple(EST_SYS, user, 900);
    const o = extractJsonObject(text);
    if(!o) throw new Error('未能解析预估结果');
    window.TP_EST = o; // T-016：交付报告复用本次 AI 预估
    renderEstimate(o);
  }catch(err){
    toast('质量预估失败：' + err.message, 'e');
  }finally{
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

function renderEstimate(o){
  const score = Math.max(0, Math.min(100, Math.round(Number(o.score) || 0)));
  const level = String(o.level || '—');
  const color = score >= 85 ? 'var(--ok)' : score >= 70 ? '#d4a72c' : score >= 50 ? '#d4882c' : 'var(--err)';
  const hotspots = Array.isArray(o.hotspots) ? o.hotspots.slice(0, 3) : [];
  const chip = 'display:inline-block;padding:3px 10px;border-radius:999px;background:var(--bg2);border:1px solid var(--bd);font-size:12px;color:var(--tx2)';
  const html = [
    '<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px">',
    '  <div style="flex:0 0 88px;width:88px;height:88px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:4px solid ' + color + ';color:' + color + '">',
    '    <div style="font-size:26px;font-weight:700;line-height:1">' + score + '</div>',
    '    <div style="font-size:11px;opacity:.85">' + esc(level) + '</div>',
    '  </div>',
    '  <div style="flex:1;min-width:0">',
    '    <div style="font-size:13.5px;line-height:1.6;color:var(--tx1)">' + esc(o.summary || '') + '</div>',
    '    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">',
    '      <span style="' + chip + '">建议阶段：' + esc(o.suggestStage || '—') + '</span>',
    '      <span style="' + chip + '">预计工作量：' + esc(o.effort || '—') + '</span>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('');
  const hp = hotspots.length
    ? '<div style="margin-top:4px"><b style="font-size:12.5px;color:var(--tx2)">问题集中段落</b><ul style="margin:6px 0 0 18px;font-size:13px;line-height:1.6;color:var(--tx1)">'
      + hotspots.map(h => '<li><span style="color:var(--tx3)">' + esc(h.para || '') + '</span> — ' + esc(h.issue || '') + '</li>').join('')
      + '</ul></div>'
    : '';
  const hint = '<div class="alert i" style="margin-top:12px">这是快速扫描的粗略预估，未逐句校对。确认方向后点「开始校对」正式处理。</div>';
  modal('📊 译文质量预估', html + hp + hint);
}

/* ═══════════ 疑难句标注（AI 提议 · 人拍板）═══════════ */
const HARD_SYS = `你是资深译校专家，只为「人类拍板」提供材料，绝不擅自改写。
任务：从下面的【译文】中挑出真正影响理解的疑难句（宁缺毋滥，最多 8 条；通顺可读的不要报）。
问题类型 type 只能取：歧义 | 多义 | 指代不清 | ASR乱码 | 语义过载 | 可读性差。
对每一条输出：
- seg：该句在【译文】中的原样片段，必须是译文的精确连续子串，字符一字不改（含空格与标点），不得用省略号截断
- why：为什么难读（40 字以内）
- opts：1~3 个候选译法（结合原文改译；ASR 乱码则给修复后的写法）
- rec：推荐的 opts 下标（从 0 开始；没有可靠推荐填 -1）
- conf：你对这次判断的把握 "高"|"中"|"低"
若没有值得报告的问题，输出 []。
只输出 JSON 数组，不要围栏、不要解释：[{"seg":"","type":"","why":"","opts":[""],"rec":0,"conf":"中"}]`;
let HARD_ITEMS = [];

// 在文本中定位 seg：先精确匹配，失败再做「忽略空白差异」的宽松匹配
function locateSeg(txt, seg){
  if(!seg) return null;
  let i = txt.indexOf(seg);
  if(i >= 0) return { start: i, len: seg.length };
  const flat = []; let s = '';
  for(let k = 0; k < txt.length; k++){ const c = txt[k]; if(/\s/.test(c)) continue; s += c; flat.push(k); }
  const fseg = String(seg).replace(/\s+/g, '');
  if(!fseg) return null;
  const p = s.indexOf(fseg);
  if(p < 0) return null;
  const start = flat[p], end = flat[p + fseg.length - 1] + 1;
  return { start, len: end - start };
}

function hardTypeColor(t){
  return ({ '歧义':'#6e5cf2', '多义':'#6e5cf2', '指代不清':'#4f8cff', 'ASR乱码':'var(--err)', '语义过载':'#d4882c', '可读性差':'#d4a72c' })[t] || 'var(--tx2)';
}
function renderHardModal(){
  const cards = HARD_ITEMS.map((it, i) => {
    const opts = (Array.isArray(it.opts) ? it.opts : []).slice(0, 3);
    const rec = Number(it.rec);
    const conf = String(it.conf || '—');
    const confColor = conf === '高' ? 'var(--ok)' : conf === '中' ? '#d4a72c' : 'var(--err)';
    const chip = 'display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;border:1px solid var(--bd)';
    const optHtml = opts.map((o, k) =>
      '<label style="display:flex;gap:6px;align-items:flex-start;cursor:pointer;font-size:13px;line-height:1.55;margin:4px 0">'
      + '<input type="radio" name="hard-opt-' + i + '" data-o="' + k + '"' + (k === rec ? ' checked' : '') + ' style="margin-top:3px;flex:0 0 auto">'
      + '<span>' + esc(o) + (k === rec ? ' <b style="color:var(--ac);font-size:11px">AI 推荐</b>' : '') + '</span></label>').join('');
    const customHtml = '<label style="display:flex;gap:6px;align-items:center;cursor:pointer;font-size:13px;margin:6px 0 2px">'
      + '<input type="radio" name="hard-opt-' + i + '" data-o="-1"' + (rec < 0 || !opts.length ? ' checked' : '') + '> 自行输入（自己翻译 / 编辑后纳入）</label>'
      + '<input class="hard-custom" placeholder="在这里写你自己的译法……" style="width:100%">';
    return '<div class="hard-card" data-i="' + i + '" style="border:1px solid var(--bd);border-radius:8px;padding:10px 12px;margin-bottom:10px;background:var(--bg2)">'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      + '<span style="' + chip + ';color:' + hardTypeColor(it.type) + '">' + esc(it.type || '疑难') + '</span>'
      + '<span style="' + chip + ';color:' + confColor + '">把握 ' + esc(conf) + '</span>'
      + '<span style="font-size:12.5px;color:var(--tx3);flex:1;min-width:120px">原文：' + esc(String(it.seg || '').slice(0, 90)) + '</span>'
      + '</div>'
      + '<div style="font-size:13px;color:var(--tx1);margin:7px 0 4px">' + esc(it.why || '') + '</div>'
      + (optHtml || '') + customHtml
      + '<div style="margin-top:8px;display:flex;gap:8px"><button class="btn sm hard-apply" data-i="' + i + '">✓ 纳入译文</button>'
      + '<button class="btn gray sm hard-skip" data-i="' + i + '">跳过</button></div>'
      + '</div>';
  }).join('');
  modal('⚠ 疑难句标注 · AI 提议，你拍板',
    '<div class="alert i" style="margin-bottom:10px">AI 只报告、不动手：每条可选候选译法、可编辑、可自己写；点「纳入译文」才会写回译文框，跳过的保持原样。</div>' + cards);
  $$('#mBody .hard-apply').forEach(b => b.onclick = () => hardApply(+b.dataset.i));
  $$('#mBody .hard-skip').forEach(b => b.onclick = () => {
    const c = b.closest('.hard-card');
    if(c){ c.style.opacity = '.45'; b.textContent = '已跳过'; b.disabled = true; }
  });
}
function hardApply(i){
  const it = HARD_ITEMS[i]; if(!it) return;
  const card = document.querySelector('.hard-card[data-i="' + i + '"]'); if(!card) return;
  const checked = card.querySelector('input[type=radio]:checked');
  let chosen = '';
  if(checked && checked.dataset.o === '-1'){
    const ci = card.querySelector('.hard-custom');
    chosen = ci ? ci.value.trim() : '';
  }else if(checked){
    const opts = Array.isArray(it.opts) ? it.opts : [];
    chosen = String(opts[+checked.dataset.o] || '').trim();
  }
  if(!chosen){ toast('请先选一个候选译法，或在「自行输入」里写一个', 'e'); return; }
  const ta = $('#dst');
  const loc = locateSeg(ta.value, it.seg);
  if(!loc){ toast('在译文中找不到原句（可能已被改动），可复制原句手动替换', 'e'); return; }
  ta.value = ta.value.slice(0, loc.start) + chosen + ta.value.slice(loc.start + loc.len);
  try{ saveTask(); }catch(e){}
  card.style.borderColor = 'var(--ok)';
  card.style.opacity = '.6';
  const bar = card.querySelector('.hard-apply');
  if(bar){ bar.textContent = '✓ 已纳入'; bar.disabled = true; }
  toast('已纳入译文');
}
async function hardSentences(){
  if(RUNNING) return;
  if(!CFG.apiKey){ toast('请先到「设置」页填写 API Key', 'e'); document.querySelector('nav button[data-page="p-set"]').click(); return; }
  const src = $('#src').value.trim(), dst = $('#dst').value.trim();
  if(!dst){ toast('请先粘贴待校对的译文', 'e'); $('#dst').focus(); return; }
  const btn = $('#btn-hard'), old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>标注中…';
  try{
    const user = [
      src ? '【外文原文】\n' + src.slice(0, 6000) : '',
      '【译文】\n' + dst.slice(0, 9000)
    ].filter(Boolean).join('\n\n');
    const { text } = await callModelSimple(HARD_SYS, user, 1600);
    const arr = extractJsonArray(text) || [];
    HARD_ITEMS = arr.filter(it => it && typeof it.seg === 'string' && it.seg.trim()).slice(0, 8);
    if(!HARD_ITEMS.length){ modal('⚠ 疑难句标注', '<div class="alert i">未发现明显疑难句，译文整体可读性良好。</div>'); return; }
    renderHardModal();
  }catch(err){
    toast('疑难标注失败：' + err.message, 'e');
  }finally{
    btn.disabled = false; btn.innerHTML = old;
  }
}

/* ═══════════ 原文/译文整理（校对前预处理：排序、重分段、去噪）═══════════ */
const TIDY_SYS = `你是文本整理助手，把用户给的（可能来自语音转写/OCR、段落错乱的）文本整理成干净、可直接使用的文本：
1. 修正明显的转写错字与标点乱码；不确定的地方保留原文，绝不臆改专有名词、数字与引用
2. 按语义重新分段；只在顺序明显错乱时调整，不删减内容、不改写风格、不增删信息
3. 去掉重复行、页码残留、多余空白
只输出整理后的文本本身：不要解释、不要 markdown 围栏。`;
async function tidyText(side){
  if(RUNNING) return;
  if(!CFG.apiKey){ toast('请先到「设置」页填写 API Key', 'e'); document.querySelector('nav button[data-page="p-set"]').click(); return; }
  const ta = $(side === 'src' ? '#src' : '#dst');
  const btn = $(side === 'src' ? '#btn-tidy-src' : '#btn-tidy-dst');
  const before = ta.value;
  if(!before.trim()){ toast('没有可整理的文本', 'e'); return; }
  const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>整理中…';
  try{
    const { text } = await callModelSimple(TIDY_SYS, before.slice(0, 12000), 6000);
    const clean = String(text || '').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    if(!clean) throw new Error('整理结果为空');
    // 用 insertText 保留 textarea 原生撤销栈（Ctrl+Z 可回退）
    ta.focus(); ta.select();
    const ok = document.execCommand && document.execCommand('insertText', false, clean);
    if(!ok) ta.value = clean;
    try{ saveTask(); }catch(e){}
    toast('整理完成：' + before.length + ' → ' + clean.length + ' 字（Ctrl+Z 可撤销）');
  }catch(err){
    toast('整理失败：' + err.message, 'e');
  }finally{
    btn.disabled = false; btn.innerHTML = old;
  }
}
$('#btn-hard') && ($('#btn-hard').onclick = hardSentences);
$('#btn-tidy-src') && ($('#btn-tidy-src').onclick = () => tidyText('src'));
$('#btn-tidy-dst') && ($('#btn-tidy-dst').onclick = () => tidyText('dst'));

async function run(extOnly){
  if(RUNNING) return;
  if(!CFG.apiKey){ toast('请先到「设置」页填写 API Key', 'e'); document.querySelector('nav button[data-page="p-set"]').click(); return; }
  if(!CFG.baseUrl || !CFG.model){ toast('请先到「设置」页补全接口地址与模型名', 'e'); return; }
  const dst = $('#dst').value.trim();
  if(!dst){ toast('请先粘贴待校对的译文', 'e'); $('#dst').focus(); return; }

  const t0 = Date.now();
  setRun(true, extOnly ? '延伸分析中' : '校对中');
  $('#outHint').textContent = '生成中…';
  const out = $('#out');
  out.innerHTML = '<span class="caret"></span>';
  $('#stats').style.display = 'none';
  $('#decision-panel').style.display = 'none'; // 新一轮先收起决策面板
  $('#post-bar').style.display = 'none'; // 新一轮先收起分类/接力条
  if(typeof setOutView === 'function') setOutView('doc'); // v4.30.0：新一轮回到文档视图

  let sys, user;
  if(extOnly){
    const lang = $('#lang').value || '（自动判断）';
    const termTxt = TERMS.length ? TERMS.slice(0,300).map(t => t.src + ' → ' + t.dst + (t.note?'（'+t.note+'）':'')).join('\n') : '（未设术语库）';
    sys = [
      fill(TPL.extRole, {lang}),
      '',
      '【必须覆盖的对象】',
      '(a) 一词多译的抽象概念；(b) 学科内涵有演变或流派分歧的术语；(c) 中文无对应概念的文化专有词；(d) 原文歧义、双关、语法悬置处；(e) 两岸三地译名或新旧译差异明显的词。',
      '',
      '【每个词条按此结构输出】',
      '### 词条：原文词',
      '**字面/词源**：……',
      '**通行译法**：',
      '- 译法一（代表译者/出处）：理据与适用语境；',
      '- 译法二（……）：……',
      '**本语境推荐**：明确推荐一个译法。**理由**：结合该词在本句/本文中的具体用法说明为何此译最贴切。',
      '**代价说明**：采用该译法会牺牲或弱化原文的哪些义项。',
      '**建议处理**：是否需要加译注，注释文字拟为……',
      '',
      '【输出开头先给】'
    ].concat(TPL.extOut||[]).concat([
      '',
      '【硬性约束】',
      '· 不得编造译法或出处。凡不确定该译法是否通行，明确写"该译法通行度无法确认"。',
      '· 不要写客套话，直接从「## 一」开始。',
      TERMS.length ? '\n【已锁定术语，延伸时须与此一致】\n' + termTxt : ''
    ]).join('\n');
    sys = fireHook('beforeSend', sys, {mode:'ext'});
    user = ($('#src').value.trim() ? '【外文原文】\n' + $('#src').value.trim() + '\n\n' : '') + '【译文】\n' + dst;
  }else{
    sys = buildSystem();
    user = buildUser();
  }

  try{
    let lastFull = '';
    const total = extOnly ? Math.round(countChars(dst) * 0.8) : Math.round(countChars(dst) * 1.8);
    showProgress();
    updateProgress(0, total);
    const renderStream = makeStreamRenderer(out);
    const { text, usage } = await callModel(sys, user, (d, full) => {
      lastFull = full;
      renderStream(full);
      updateProgress(full.length, total);
    });
    hideProgress();
    LAST_OUT = text;
    out.style.whiteSpace = '';
    out.innerHTML = md(text);
    collapseSections(); // v4.11.0：批注/注释/争议/待确认默认折叠
    renderDecisionPanel(text); // v4.2.1：输出含争议词条时亮出点选面板
    // v4.9.0：错误分类统计筛选 + 阶段接力 + 同步到项目看板
    markErrorLines();
    renderAuditControls(); // P2：批注「已修/未修」状态（v4.26.0）
    renderErrorFilter(text);
    dedupAuditLines(); // v4.29.0：折叠模型退化重复的批注（反馈 FB-MVBZVHKG-SOZ）
    paintErrFixSpans(); // P3：修订段标红 + 点击内联修正（v4.26.0）
    renderStageNext();
    renderPostBar();
    syncToProject(text, dst);
    learnFromResult($('#src').value, extractProofText(text) || ''); // 翻译记忆：自动学习句对
    // 自动术语体检（本地零成本）：发现问题自动提示，一键处理
    const autoAudit = termAudit(extractProofText(text) || dst, $('#src').value);
    if(autoAudit.conflict.length || autoAudit.multi.length){
      toast('🩺 术语体检发现 ' + (autoAudit.conflict.length + autoAudit.multi.length) + ' 处不一致，点「术语体检」一键处理', 'w');
    }
    // 自动段落对齐体检（v4.31.0 · 本地零成本）：段数对不上多半是漏译/多译
    if(typeof paraAudit === 'function'){
      const autoPara = paraAudit($('#src').value, extractProofText(text) || dst);
      if(autoPara.status !== 'equal' || autoPara.blanks.length){
        toast('🧩 段落对齐：原文 ' + autoPara.srcN + ' 段 / 译文 ' + autoPara.dstN + ' 段' +
          (autoPara.blanks.length ? '，含 ' + autoPara.blanks.length + ' 个空段' : '') + '，点「段落对齐」看位置', 'w');
      }
    }
    if(typeof numAudit === 'function'){
      const autoNum = numAudit($('#src').value, extractProofText(text) || dst);
      if(autoNum.issueCount){
        toast('🔢 数字体检：发现 ' + autoNum.issueCount + ' 处可疑（丢失/多出/百分号/漏否定），点「数字体检」看位置', 'w');
      }
    }
    saveTask();
    if(typeof syncOutView === 'function') syncOutView(); // v4.30.0：亮出「📄 文档 / 📊 三栏对照」切换条
    const tokTxt = usage
      ? '输入 ' + fmt(usage.prompt_tokens||0) + ' + 输出 ' + fmt(usage.completion_tokens||0) + ' = ' + fmt(usage.total_tokens||0) + ' tokens'
      : '（服务商未返回用量）';
    $('#s-time').textContent = ((Date.now()-t0)/1000).toFixed(1) + ' 秒';
    $('#s-src').textContent = fmt(countChars($('#src').value));
    $('#s-dst').textContent = fmt(countChars(dst));
    $('#s-out').textContent = fmt(countChars(text));
    $('#s-tok').textContent = tokTxt;
    $('#stats').style.display = 'flex';
    $('#outHint').textContent = '完成 · ' + new Date().toLocaleTimeString('zh-CN');
    pushHistory(user, text, extOnly);
    /* 3.1 文档模式：校对完成后亮出下载按钮 */
    $('#btn-docout').style.display = docModeActive() ? '' : 'none';
    $('#btn-trackdoc').style.display = docModeActive() ? '' : 'none';
    if(docModeActive()){
      const ext = extractProofText(text);
      const segs = ext ? ext.split(/\n\s*\n/).filter(s => s.trim()) : [];
      toast('文档模式就绪：识别到 ' + segs.length + ' 个译文段落，点「下载校对后文档」（直接替换）或「导回 Word（修订模式）」（改动带修订痕迹、可接受/拒绝）生成 Word', 'ok');
    }
    /* ── 完成后的对外出口（正式版新增）── */
    const RESULT = {
      text, usage, mode: extOnly ? 'ext' : 'proof',
      ms: Date.now() - t0,
      meta: { lang: $('#lang').value, genre: $('#genre').value, tone: $('#tone').value, depth: $('#depth').value },
      src: $('#src').value, dst,
      // P1：附带文件上下文（如果有）
      attachments: ['src','dst'].map(side => {
        const f = __TP_FILES[side];
        return f ? { side, name:f.fileName, kind:f.kind, chapters:f.chapters.length, chapterIdx:f._chapterIdx } : null;
      }).filter(Boolean)
    };
    fireHook('afterComplete', RESULT);
    window.dispatchEvent(new CustomEvent('transproof:complete', { detail: RESULT }));
    try{ if(window.parent && window.parent !== window) window.parent.postMessage({ type:'transproof:complete', detail: RESULT }, '*'); }catch(_){}
    if(CFG.webhook && /^https?:\/\//i.test(CFG.webhook)){
      fetch(CFG.webhook, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ event:'complete', result: RESULT })
      }).catch(()=>{});
    }
  }catch(err){
    const isAbort = err.name === 'AbortError';
    if(isAbort && PAUSE_REQUESTED){
      // 暂停：保留已生成内容，进入暂停态，可续写
      PAUSE = { extOnly, full: lastFull, sys, user, total };
      RUNNING = false;
      $('#btn-run').disabled = true;
      $('#btn-ext').disabled = true;
      $('#btn-stop').disabled = true;
      $('#btn-pause').disabled = false;
      $('#btn-pause').textContent = '▶ 继续';
      $('#outHint').textContent = '已暂停 · 已生成 ' + fmt((lastFull || '').length) + ' 字';
      hideProgress();
      return;
    }
    fireHook('onError', err);
    window.dispatchEvent(new CustomEvent('transproof:error', { detail: { message: err.message } }));
    try{ if(window.parent && window.parent !== window) window.parent.postMessage({ type:'transproof:error', detail: { message: err.message } }, '*'); }catch(_){}
    let msg = err.message;
    if(!isAbort){
      if(/Failed to fetch|NetworkError|Load failed/i.test(msg)){
        msg = '无法连接到模型接口。\n\n可能原因：\n· 网络不通，或接口地址（Base URL）填错了\n· 浏览器插件（广告拦截、隐私防护）拦截了请求，可尝试无痕窗口\n· 服务商临时不可用\n\n请到「设置」页点「测试连接」进一步排查。';
      }else if(/timed out|timeout/i.test(msg)){
        msg = '请求超时。可到「设置」页把「超时（秒）」调大后重试；若文本过长，建议拆分成两三次校对。';
      }
    }
    hideProgress();
    out.innerHTML = '<div class="alert ' + (isAbort ? 'w' : 'e') + '">' +
      (isAbort ? '已停止，或请求超时（当前上限 ' + CFG.timeout + ' 秒，可在设置页调大）。' : esc(msg).replace(/\n/g,'<br>')) + '</div>';
    $('#outHint').textContent = isAbort ? '已停止' : '出错';
  }finally{
    PAUSE_REQUESTED = false;
    if(!PAUSE) setRun(false, '开始校对');
  }
}
$('#btn-pause').onclick = () => {
  if(RUNNING){
    PAUSE_REQUESTED = true;
    if(ABORT) ABORT.abort();
  } else if(PAUSE){
    continueRun();
  }
};
async function continueRun(){
  if(!PAUSE) return;
  const p = PAUSE;
  PAUSE = null;
  setRun(true, '继续校对中');
  showProgress();
  const out = $('#out');
  const sys = '你之前正在输出一份校对结果，但被中断。下面是你已经输出的部分。请从断点处**接着**输出剩余部分：不要重复已生成的内容，不要从头开始，不要写"好的"之类客套话，直接续写。';
  const user = '【已生成的内容】\n' + p.full + '\n\n【请继续】接着上面的内容，从断点处继续输出剩余部分。';
  try{
    let cont = '';
    const renderStream = makeStreamRenderer(out);
    const { text } = await callModel(sys, user, (d, full) => {
      cont = full;
      out.textContent = p.full + '\n' + full;
      updateProgress((p.full.length + full.length), (p.total + full.length) * 1.2);
    });
    const full2 = p.full + '\n' + cont;
    hideProgress();
    LAST_OUT = full2;
    out.style.whiteSpace = '';
    out.innerHTML = md(full2);
    collapseSections();
    renderDecisionPanel(full2);
    markErrorLines();
    renderAuditControls(); // P2：批注「已修/未修」状态（v4.26.0）
    renderErrorFilter(full2);
    paintErrFixSpans(); // P3：修订段标红 + 点击内联修正（v4.26.0）
    renderStageNext();
    renderPostBar();
    syncToProject(full2, $('#dst').value);
    saveTask();
    $('#outHint').textContent = '完成（续写）· ' + new Date().toLocaleTimeString('zh-CN');
  }catch(err){
    hideProgress();
    out.innerHTML = '<div class="alert e">' + esc(err.message).replace(/\n/g,'<br>') + '</div>';
    $('#outHint').textContent = '续写出错';
  }finally{
    setRun(false, '开始校对');
  }
}
$('#btn-run').onclick = () => run(false);
$('#btn-ext').onclick = () => run(true);
$('#btn-estimate').onclick = estimateQuality;
$('#btn-stop').onclick = () => { if(ABORT) ABORT.abort(); };
document.addEventListener('keydown', e => {
  if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){ e.preventDefault(); run(false); }
});
