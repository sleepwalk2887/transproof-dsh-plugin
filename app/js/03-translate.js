/* ═══════════════════════════════════════════════════════════════
   v4.2 翻译工作台（Step 2）
   原文输入 → 选 Prompt → 个性化 → 调模型 → 送校对 / 文档导出 / 译注入库
   ═══════════════════════════════════════════════════════════════ */
const TS_FILES = { src: null }; // 翻译工作台专用（与校对工作台 __TP_FILES 隔离，避免相互覆盖）

function tsRenderPromptOptions(){
  const sel = $('#ts-prompt'); if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— 不使用 Prompt，用系统默认风格 —</option>' +
    PROMPTS.prompts
      .slice().sort((a,b) => (b.rating||0) - (a.rating||0))
      .map(p => {
        const tags = (p.styleTags || []).slice(0,3).join('·');
        return '<option value="' + p.id + '">' + esc(p.name) + (tags ? ' 〔' + tags + '〕' : '') + (p.rating ? ' ★' + Math.round(p.rating) : '') + '</option>';
      }).join('');
  sel.value = cur; // 保留上次选择
}
function tsRenderPromptMeta(){
  const id = $('#ts-prompt').value;
  const meta = $('#ts-promptMeta');
  if(!id){ meta.innerHTML = '<span style="color:var(--tx3)">使用系统默认翻译风格</span>'; return; }
  const p = PROMPTS.prompts.find(x => x.id === id);
  if(!p){ meta.textContent = ''; return; }
  const srcLabel = { 'from-original':'原文反推', 'from-translation':'真人文章', 'from-postscript':'译者后记', 'manual':'手写', 'from-terms':'术语库提炼' }[p.source] || p.source;
  meta.innerHTML = '<b>' + esc(p.name) + '</b> · 来源：' + esc(srcLabel) +
    (p.styleTags && p.styleTags.length ? ' · 标签：' + p.styleTags.slice(0,4).map(t => '<span class="g-tag">' + esc(t) + '</span>').join('') : '') +
    (p.rating ? ' · <span style="color:var(--ok)">★' + Math.round(p.rating) + '</span>' : '') +
    (p.core ? '<div style="margin-top:4px">' + esc(p.core.slice(0, 140)) + (p.core.length>140?'…':'') + '</div>' : '');
}

/* ── 上传原文（复用 P1 parseFile） ── */
function tsOnSrcFile(file){
  if(!file) return;
  const bar = $('#ts-srcFileBar');
  bar.style.display = 'flex';
  bar.innerHTML = '<span class="fb-spin"></span><span>正在解析 ' + esc(file.name) + '…</span>';
  bar.classList.add('has-file');
  parseFile(file, 'src', (msg, p) => {
    bar.innerHTML = '<span class="fb-spin"></span><span>' + esc(msg) + '</span><span class="fb-progress">' + Math.round(p*100) + '%</span>';
  }).then(async data => {
    if(data.kind === 'docx'){
      try{ data._zipBytes = await file.arrayBuffer(); }catch(_){}
    }
    TS_FILES.src = data;
    tsRenderSrcBar();
    $('#ts-src').value = data.fullText;
    $('#ts-srcStat').textContent = '已解析：' + data.chapters.length + ' 章节 / ' + data.fullText.length + ' 字';
    toast('已解析：' + data.chapters.length + ' 章节，' + data.fullText.length + ' 字');
    saveTask();
  }).catch(err => {
    bar.innerHTML = '';
    bar.classList.remove('has-file');
    toast('解析失败：' + errMsg(err), 'e');
  });
}
function tsRenderSrcBar(){
  const bar = $('#ts-srcFileBar');
  const f = TS_FILES.src;
  if(!f){ bar.style.display = 'none'; bar.innerHTML = ''; bar.classList.remove('has-file'); $('#ts-srcStat').textContent = '未输入'; $('#ts-srcChapterSel').innerHTML = ''; return; }
  bar.style.display = 'flex';
  bar.innerHTML = '<span class="fb-name">' + esc(f.fileName) + '</span><span class="fb-meta">' + kindLabel(f.kind) + ' · ' + f.chapters.length + ' 章节</span><button class="btn x" id="ts-srcX">✕</button>';
  bar.classList.add('has-file');
  $('#ts-srcX').onclick = () => { TS_FILES.src = null; tsRenderSrcBar(); $('#ts-src').value = ''; saveTask(); };
  // 章节下拉
  const sel = $('#ts-srcChapterSel');
  if(f.chapters.length > 1){
    sel.innerHTML = '<select id="ts-chapSel"><option value="-1">全部</option>' +
      f.chapters.map((c,i) => '<option value="' + i + '">' + esc((c.title||'').slice(0,30)) + '</option>').join('') + '</select>';
    $('#ts-chapSel').onchange = e => {
      const idx = +e.target.value;
      $('#ts-src').value = idx < 0 ? f.fullText : f.chapters[idx].text;
    };
  }
}

/* ── System prompt 构建 ── */
function buildTransSystem(){
  const L = [];
  const id = $('#ts-prompt').value;
  const p = id ? PROMPTS.prompts.find(x => x.id === id) : null;

  // 基础身份
  const lang = $('#ts-lang').value;
  L.push('你是一位专业的学术翻译家，正在把【' + (lang === 'auto' ? '外文' : lang) + '原文】译成【中文】。');
  L.push('');

  // 风格指令（Prompt 库 / 系统默认）
  if(p){
    L.push('【翻译风格指令 — 来自 Prompt 库「' + p.name + '」】');
    L.push(p.fullPrompt);
    L.push('');
  } else {
    L.push('【默认风格】译文通顺忠实，符合中文表达习惯；术语首次出现附原文括注；不使用「值得注意的是」「综上所述」等机器腔填充语。');
    L.push('');
  }

  // 个性化
  const len = $('#ts-len').value;
  L.push('【句长偏好】' + ({ short:'短句（中文不超过 30 字）', medium:'中句（30-60 字为主）', long:'长句（60 字以上，保留复杂从句）' }[len] || ''));
  const mode = +$('#ts-mode').value;
  L.push('【直译/意译】1-5 档，当前 = ' + mode + '（1=逐字直译；3=平衡；5=自由意译）');
  L.push('');

  // 术语锁定
  const termMode = $('#ts-term').value;
  if(termMode !== 'off' && TERMS.length){
    const sample = TERMS.slice(0, 80).map(t => t.src + ' → ' + t.dst + (t.note ? '（' + t.note + '）' : '')).join('\n');
    L.push('【术语库锁定 — ' + (termMode === 'strict' ? '严格一致，不容手写变体' : '已确认术语严格一致') + '】');
    L.push(sample);
    L.push('');
  }
  if(GLOSS.terms.length && termMode !== 'off'){
    // M4（T-012）：走 approvedGloss() 唯一闸门（只认已批准词条）
    const _ag = (typeof approvedGloss === 'function') ? approvedGloss() : GLOSS.terms.filter(t => t.status === 'confirmed' && t.foreign && t.zh);
    const sample = _ag.filter(t => termActive(t)).slice(0, 60)
      .map(t => t.foreign + ' → ' + t.zh + (t.tags && t.tags.length ? ' [' + t.tags.join(',') + ']' : '')).join('\n');
    if(sample){
      L.push('【专有译词库 — confirmed 状态】');
      L.push(sample);
      L.push('');
    }
  }

  // 全局偏好
  if(PREFS){
    L.push('【全局风格偏好】');
    L.push(PREFS);
    L.push('');
  }

  // 译注
  if($('#ts-notes').value === 'on'){
    L.push('【译注要求】');
    L.push('翻译完成后，请在文末另起一段 `# 译注建议`，按下列格式逐条列出本次翻译过程产生的注释：');
    L.push('- 人名 → 中文译名（外文原文，生卒年）：类别=人物，备注=简要说明；建议入库=术语库');
    L.push('- 概念/术语 → 中文译名（外文原文）：类别=概念，备注=简要说明；建议入库=术语库');
    L.push('- 著作/篇名 → 中文译名（外文原文，年份）：类别=著作，备注=作者；建议入库=专有译词库');
    L.push('格式严格按上述模板，每条一行，便于程序解析入库。');
    L.push('');
  } else {
    L.push('【译注】本次无需生成译注建议。');
    L.push('');
  }

  // 文档模式段落对齐约束
  if(TS_FILES.src && TS_FILES.src.kind === 'docx' && TS_FILES.src._zipBytes){
    const paraCount = countBodyParagraphs(TS_FILES.src._zipBytes);
    L.push('【文档模式硬约束】译文将被程序逐段写回原文 Word 文档：');
    L.push('1.「# 译文」部分的段落数量、顺序必须与原文（' + paraCount + ' 个正文段落）完全一致，不得增删、合并或拆分；');
    L.push('2. 段落之间用一个空行分隔；');
    L.push('3. 段内如无必要不要使用 Markdown 记号（**、# 等），直接输出纯文本。');
    L.push('');
  }

  // 输出格式
  L.push('【输出格式 — 必须严格遵守，第一行就是标题本身，不得添加任何开场白】');
  L.push('输出的第一行必须是「# 译文」四个字符（井号+空格+译文两个字），不要加粗、不要变形、不要省略；');
  L.push('然后空一行开始译文正文，段落之间空一行。');
  L.push('');
  L.push('示例开头：');
  L.push('# 译文');
  L.push('');
  L.push('（译文正文，段落之间空一行）');
  if($('#ts-notes').value === 'on'){
    L.push('');
    L.push('译注段以「# 译注建议」另起一段开始，逐条列出，每条一行。');
  }
  L.push('');
  L.push('禁止输出「好的，以下是译文」「翻译如下」等任何客套开场白——直接以「# 译文」开头。');

  return L.join('\n');
}

// 解析 docx 计算正文段落数（不依赖 dom 但要 JSZip）
async function countBodyParagraphs(zipBytes){
  try{
    await loadLib('JSZip', ['https://registry.npmmirror.com/jszip/3.10.1/files/dist/jszip.min.js', 'https://cdn.bootcdn.net/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js']);
    const zip = await window.JSZip.loadAsync(zipBytes);
    const xml = await zip.file('word/document.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const body = doc.getElementsByTagName('w:body')[0];
    if(!body) return 0;
    let n = 0;
    for(const p of Array.from(body.children)) if(p.tagName === 'w:p'){
      const t = p.getElementsByTagName('w:t');
      const text = Array.from(t).map(x => x.textContent).join('').trim();
      if(text) n++;
    }
    return n;
  }catch(_){ return 0; }
}

/* ── 提取译文段 ── */
function extractTransText(mdText){
  const t = String(mdText || '').trim();
  if(!t) return null;
  // 路径 A：模型守规矩，输出了 "# 译文" 或 "**译文**" 标题
  const m = t.match(/(?:^|\n)(?:#{1,3}\s*译\s*文[^\n]*|\*\*译\s*文\*\*)\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n\*\*?译\s*注|#\s*译注|\n*$)/);
  if(m && m[1].trim()) return m[1].trim();
  // 路径 B（回退）：模型没写标题，直接给了译文正文。
  // 策略：把"从开头到译注段之前"的全文当译文（译注段之后的部分剔除）。
  const noteStart = t.search(/(?:^|\n)(?:#{1,3}\s*译\s*注|\*\*译注|【译注)/);
  let body = noteStart > 0 ? t.slice(0, noteStart) : t;
  // 再兜一层：如果正文里有"---"分隔线后跟"译注建议"字样，也切掉
  const hrIdx = body.search(/\n-{3,}\s*\n\s*(?:#|\*\*)?\s*译/);
  if(hrIdx > 0) body = body.slice(0, hrIdx);
  body = body.replace(/^(?:好的|以下是|翻译如下|译文如下)[^\n]*[:：]?\s*\n/, ''); // 去掉模型客套开场白
  body = body.replace(/^\s*(?:#\s*|\*\*\s*)?译\s*文(?:\s*\*\*)?\s*[:：]?\s*\n/, ''); // 去掉可能残留的"译文"标题行（含粗体变体）
  body = body.trim();
  return body || null;
}
function extractTransNotes(mdText){
  const t = String(mdText || '');
  // 兼容多种标题写法：# 译注建议 / ## 译注 / **译注建议** / 【译注建议】
  const m = t.match(/(?:^|\n)(?:#{1,3}\s*译\s*注[^\n]*|\*\*译注[^*]*\*\*|【译注[^\]】]*】)\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n\*\*[^*]{0,12}：|\n*$)/);
  if(!m) return null;
  return m[1].split(/\n/).map(s => s.trim().replace(/^[-*·]\s*/, '')).filter(Boolean);
}

/* ── 跑翻译 ── */
let TS_ABORT = null;
let TS_RUNNING = false;
async function tsRun(){
  if(TS_RUNNING){ toast('翻译正在进行中，请勿重复点击', 'w'); return; }
  const src = $('#ts-src').value.trim();
  if(!src){ toast('请先输入或上传原文', 'e'); return; }
  TS_RUNNING = true;
  $('#ts-btn-run').disabled = true;
  $('#ts-btn-stop').disabled = false;
  $('#ts-actions').hidden = false;
  $('#ts-actions').style.display = 'flex';
  $('#ts-btn-docout').disabled = true;
  $('#ts-out').innerHTML = '';
  $('#ts-outHint').textContent = '运行中…';
  $('#ts-runStat').textContent = '⏳';
  const t0 = Date.now();
  const sys = buildTransSystem();
  const MAX_IN_CHARS = CFG.maxInChars || 80000; // 原文截断上限（可在设置页调整）
  const user = '【外文原文】\n' + src.slice(0, MAX_IN_CHARS);
  if(src.length > MAX_IN_CHARS){
    toast('原文 ' + src.length + ' 字超过 ' + MAX_IN_CHARS + ' 字上限，已截断到上限。建议：切章节翻译，或启用更智能的分块模式', 'w');
  }
  try{
    const tsTotal = Math.round(countChars(src) * 1.3);
    showProgress('ts-');
    updateProgress(0, tsTotal, 'ts-');
    const tsRender = makeStreamRenderer($('#ts-out'));
    const { text, usage } = await callModel(sys, user, (d, full) => {
      tsRender(full);
      updateProgress(full.length, tsTotal, 'ts-');
    }, 'trans');
    hideProgress('ts-');
    TS_LAST_OUT = text;
    $('#ts-out').style.whiteSpace = '';
    $('#ts-out').innerHTML = md(text);
    $('#ts-s-time').textContent = ((Date.now()-t0)/1000).toFixed(1) + ' 秒';
    $('#ts-s-src').textContent = fmt(countChars(src));
    $('#ts-s-out').textContent = fmt(countChars(text));
    $('#ts-s-tok').textContent = usage ? (fmt((usage.prompt_tokens||0)+(usage.completion_tokens||0)) + ' tokens') : '（未返回）';
    $('#ts-stats').style.display = 'flex';
    $('#ts-outHint').textContent = '完成 · ' + new Date().toLocaleTimeString('zh-CN');
    $('#ts-runStat').textContent = '✓';
    saveTask();
    // T-022 专名收集：译完自动抽专名 + 建议译名入词库（勾选了翻译页「翻译后抽专名」才做）
    if($('#ts-c-noun') && $('#ts-c-noun').checked && typeof tsCollectNouns === 'function') tsCollectNouns(src).catch(() => {});
    if($('#ts-c-term') && $('#ts-c-term').checked && typeof tsCollectTerms === 'function') tsCollectTerms(src).catch(() => {});
    // 文档模式按钮：仅当原文是 docx 时启用
    if(TS_FILES.src && TS_FILES.src.kind === 'docx' && TS_FILES.src._zipBytes){
      $('#ts-btn-docout').disabled = false;
    }
    // Prompt 评分提示（轻量）
    const id = $('#ts-prompt').value;
    if(id){
      const p = PROMPTS.prompts.find(x => x.id === id);
      if(p){
        p.useCount = (p.useCount || 0) + 1;
        savePrompts();
      }
    }
  }catch(err){
    hideProgress('ts-');
    $('#ts-outHint').textContent = '失败';
    $('#ts-runStat').textContent = '✗';
    $('#ts-out').innerHTML = '<div class="alert e">' + esc(err.message) + '</div>';
  }finally{
    TS_RUNNING = false;
    $('#ts-btn-run').disabled = false;
    $('#ts-btn-stop').disabled = true;
  }
}
let TS_LAST_OUT = '';

$('#ts-btn-run').onclick = tsRun;
$('#ts-btn-stop').onclick = () => { if(TS_ABORT) TS_ABORT.abort(); toast('已中断'); };
$('#ts-btn-collections').onclick = () => openCollectionPicker();
$('#ts-srcUpload').onclick = () => $('#ts-srcFile').click();
$('#ts-srcFile').onchange = e => { tsOnSrcFile(e.target.files[0]); e.target.value = ''; };
$('#ts-srcClear').onclick = () => { TS_FILES.src = null; tsRenderSrcBar(); $('#ts-src').value = ''; saveTask(); };
$('#ts-prompt').onchange = tsRenderPromptMeta;
// 初始化 Prompt 下拉
setTimeout(tsRenderPromptOptions, 150);

/* ── 一键送校对 ── */
$('#ts-btn-sendproof').onclick = () => {
  const txt = extractTransText(TS_LAST_OUT);
  if(!txt){ toast('译文里找不到译文段，请确认模型输出格式', 'e'); return; }
  $('#dst').value = txt;
  // 原文完整转交：文本直接填入；文件（含 docx）整体挂到校对页文件槽，保留章节选择能力
  if(TS_FILES.src){
    $('#src').value = TS_FILES.src.fullText || '';
    __TP_FILES.src = TS_FILES.src;
    renderFileBar('src');
  }
  // 切到校对工作台
  document.querySelector('button[data-page="p-work"]').click();
  toast('已送校对：原文 + 译文都已就位，可点「开始校对」', 'ok');
};

/* ── 文档模式导出（翻译→原文 docx） ── */
async function tsExportTransDocx(){
  if(!TS_FILES.src || TS_FILES.src.kind !== 'docx' || !TS_FILES.src._zipBytes){
    toast('请先上传原文 docx 文件', 'e'); return;
  }
  const proofText = extractTransText(TS_LAST_OUT);
  if(!proofText){ toast('译文里找不到「# 译文」段', 'e'); return; }
  try{
    await loadLib('JSZip', ['https://registry.npmmirror.com/jszip/3.10.1/files/dist/jszip.min.js', 'https://cdn.bootcdn.net/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js']);
    const zip = await window.JSZip.loadAsync(TS_FILES.src._zipBytes);
    const xml = await zip.file('word/document.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const body = doc.getElementsByTagName('w:body')[0];
    const paras = [];
    for(const p of Array.from(body.children)){
      if(p.tagName === 'w:p'){
        const ts = Array.from(p.getElementsByTagName('w:t'));
        const text = ts.map(t => t.textContent).join('').trim();
        if(text) paras.push({ p, ts, text });
      }
    }
    const segs = proofText.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const n = Math.min(paras.length, segs.length);
    let replaced = 0;
    for(let i = 0; i < n; i++){
      const target = paras[i], newText = segs[i];
      if(newText === target.text) continue;
      let first = true;
      for(const t of target.ts){
        if(first){ t.textContent = newText; t.setAttribute('xml:space','preserve'); first = false; }
        else t.textContent = '';
      }
      replaced++;
    }
    let serialized = new XMLSerializer().serializeToString(doc);
    serialized = serialized.replace(/^\s*<\?xml[^>]*\?>\s*/i, '');
    const newXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + serialized;
    zip.file('word/document.xml', newXml);
    const blob = await zip.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const baseName = (TS_FILES.src.fileName || '原文.docx').replace(/\.docx$/i, '');
    dlBlob('翻译后_' + baseName + '.docx', blob);
    toast('已生成：替换 ' + replaced + ' 段' + (paras.length !== segs.length ? '（⚠ 段数不匹配，余段保留原文）' : ''), 'ok');
  }catch(err){
    toast('导出失败：' + err.message, 'e');
  }
}
$('#ts-btn-docout').onclick = tsExportTransDocx;

/* ── 导出 Markdown ── */
$('#ts-btn-export-md').onclick = () => {
  if(!TS_LAST_OUT){ toast('还没有译文', 'e'); return; }
  dl('译文_' + today() + '.md', TS_LAST_OUT, 'text/markdown');
};

/* ── 译注建议入库 ── */
function tsShowNotesImport(){
  const notes = extractTransNotes(TS_LAST_OUT);
  if(!notes || !notes.length){ toast('译文里没有「# 译注建议」段，或本轮关了译注生成', 'e'); return; }
  // 解析每条："中文（外文，备注）：类别=xxx，备注=yyy"
  // 简化：提示用户选类型 + 确认；批量入术语库或词库
  const parsed = notes.map(line => {
    // 尝试多种格式
    let m;
    // 形式 A：人物 → 福柯（Michel Foucault，1926-1984）：人物；备注=法国哲学家
    m = line.match(/^(.+?)\s*[→\-]\s*(.+?)：(.+?)$/);
    if(m) return { raw: line, target: m[1].trim(), original: m[2].trim(), cat: m[3].trim() };
    return { raw: line, target: line, original: '', cat: '' };
  });
  modal('译注建议入库（' + parsed.length + ' 条）— 勾选要入库的，再选目的地', [
    '<div style="max-height:340px;overflow:auto;border:1px solid var(--bd);border-radius:8px">',
    parsed.map((p, i) => '<label style="display:flex;gap:8px;padding:6px 10px;border-bottom:1px solid var(--bd)">' +
      '<input type="checkbox" data-ni="' + i + '" checked style="width:auto">' +
      '<div style="flex:1;font-size:12.5px"><b>' + esc(p.target) + '</b>' + (p.original ? ' <span style="color:var(--tx3)">（' + esc(p.original) + '）</span>' : '') +
      (p.cat ? '<div style="color:var(--tx3);font-size:11.5px">' + esc(p.cat) + '</div>' : '') + '</div></label>').join(''),
    '</div>',
    '<div style="display:flex;gap:8px;margin-top:12px;align-items:center">' +
      '<label><input type="radio" name="ts-impdest" value="terms" checked style="width:auto"> 入术语库（src/dst 形式）</label>' +
      '<label><input type="radio" name="ts-impdest" value="gloss" style="width:auto"> 入专有译词库（zh/foreign 形式）</label>' +
      '<span style="flex:1"></span>' +
      '<button class="btn pri" id="ts-notes-ok">✓ 入库</button>' +
      '<button class="btn gray sm" id="ts-notes-cancel">取消</button>' +
    '</div>'
  ].join(''));
  $('#ts-notes-cancel').onclick = closeModal;
  $('#ts-notes-ok').onclick = () => {
    const dest = document.querySelector('input[name="ts-impdest"]:checked').value;
    const picks = Array.from(document.querySelectorAll('[data-ni]:checked')).map(c => parsed[+c.dataset.ni]);
    let added = 0;
    picks.forEach(p => {
      if(dest === 'terms'){
        if(!p.target) return;
        // 已存在则跳过
        const ex = TERMS.find(x => x.src.toLowerCase() === p.target.toLowerCase() || x.dst === p.target);
        if(ex) return;
        TERMS.push({ src: p.original || '?', dst: p.target, cat: guessCat('', p.cat || '') || '其他', note: p.cat || '' });
        added++;
      } else {
        if(!p.target || !p.original || p.original === '?') return;
        const ex = GLOSS.terms.find(t => t.zh === p.target && t.foreign === p.original);
        if(ex) return;
        GLOSS.terms.push({ zh: p.target, foreign: p.original, aliases: [], type: '概念', tags: [], status: 'pending', recommend: 'rec', note: p.cat || '', sources: [], occurrences: [], id: GID++ });
        added++;
      }
    });
    save(LS.terms, TERMS); renderTerms();
    saveGloss(); renderGloss();
    closeModal();
    toast('✓ 已入' + (dest==='terms'?'术语库':'专有译词库') + '：' + added + ' 条');
  };
}
$('#ts-btn-notes').onclick = tsShowNotesImport;
