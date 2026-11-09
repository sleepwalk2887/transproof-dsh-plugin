/* ═══════════ 4.23.0 P1：修订模式 —— 逐词/逐字 diff 生成 w:del / w:ins ═══════════
   原理：与「替换模式」共用解包回写引擎；差别在于改动段不再整段覆盖，而是
   拆成「删除的旧文字（w:del + w:delText，Word 显示删除线）」和「新增的新文字
   （w:ins，显示下划线）」，Word/WPS 打开后可在「审阅」页逐条接受/拒绝。
   段落级格式（w:pPr：缩进/对齐/行距）与图片完全不碰，首个 run 的 rPr 作为
   新 run 的样式模板 → 字号/字体/加粗保留。 */
const TP_W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function tpTokens(s){
  // ASCII 连串（字母/数字）成词，空白成段，其余单字符成词 → 贴近 Word 的修订粒度
  return String(s).match(/[A-Za-z0-9_]+|\s+|[^\s]/gu) || [];
}
function tpDiffOps(a, b, cap){
  const n = a.length, m = b.length;
  if(!n && !m) return [];
  if(!n) return [{ t: '+', s: b.join('') }];
  if(!m) return [{ t: '-', s: a.join('') }];
  // DP 规模超限（长段落×长段落）→ 降级为整段删除+整段新增，保证不卡死
  if(n * m > cap) return [{ t: '-', s: a.join('') }, { t: '+', s: b.join('') }];
  const dp = [];
  for(let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
  for(let i = n - 1; i >= 0; i--)
    for(let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  const push = (t, ch) => { const last = ops[ops.length - 1]; if(last && last.t === t) last.s += ch; else ops.push({ t, s: ch }); };
  let i = 0, j = 0;
  while(i < n && j < m){
    if(a[i] === b[j]){ push('=', a[i]); i++; j++; }
    else if(dp[i + 1][j] >= dp[i][j + 1]){ push('-', a[i]); i++; }
    else { push('+', b[j]); j++; }
  }
  while(i < n){ push('-', a[i]); i++; }
  while(j < m){ push('+', b[j]); j++; }
  return ops;
}
function tpRun(doc, rPr, text, tag){
  const r = doc.createElementNS(TP_W_NS, 'w:r');
  if(rPr) r.appendChild(rPr.cloneNode(true));
  const t = doc.createElementNS(TP_W_NS, tag); // 普通文字 w:t / 删除文字 w:delText
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  return r;
}
function writeTrackedDiff(doc, target, newText, revId, date){
  const p = target.p;
  const firstR = p.getElementsByTagName('w:r')[0];
  const rPr = firstR ? firstR.getElementsByTagName('w:rPr')[0] : null; // 首 run 样式模板
  const ops = tpDiffOps(tpTokens(target.text), tpTokens(newText), 250000);
  // 清空段内子节点、仅留 w:pPr（段落级格式保留）；rPr 已在清理前克隆
  for(const ch of Array.from(p.childNodes)){
    if(ch.nodeType === 1 && ch.localName === 'pPr') continue;
    p.removeChild(ch);
  }
  for(const op of ops){
    if(op.t === '='){ p.appendChild(tpRun(doc, rPr, op.s, 'w:t')); continue; }
    const wrap = doc.createElementNS(TP_W_NS, op.t === '-' ? 'w:del' : 'w:ins');
    wrap.setAttributeNS(TP_W_NS, 'w:id', String(++revId.v));
    wrap.setAttributeNS(TP_W_NS, 'w:author', 'TransProof');
    wrap.setAttributeNS(TP_W_NS, 'w:date', date);
    wrap.appendChild(tpRun(doc, rPr, op.s, op.t === '-' ? 'w:delText' : 'w:t'));
    p.appendChild(wrap);
  }
}
async function exportProofreadDocx(track){
  const f = __TP_FILES.dst;
  if(!f || !f._zipBytes){ toast('请先在译文侧上传 Word 文档并勾选「文档模式」', 'e'); return; }
  const proofText = extractProofText(LAST_OUT);
  if(!proofText){ toast('校对结果里没有找到「修订后译文」段，无法回写', 'e'); return; }
  const btn = track ? $('#btn-trackdoc') : $('#btn-docout');
  btn.disabled = true; const old = btn.textContent; btn.textContent = '⏳ 生成中…';
  try{
    await loadLib('JSZip', ['https://registry.npmmirror.com/jszip/3.10.1/files/dist/jszip.min.js', 'https://cdn.bootcdn.net/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js']);
    const zip = await window.JSZip.loadAsync(f._zipBytes);
    const xml = await zip.file('word/document.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if(doc.getElementsByTagName('parsererror').length) throw new Error('document.xml 解析失败');

    // 1) 收集 body 直系段落（跳过表格内段落，避免误伤复杂结构）
    const body = doc.getElementsByTagName('w:body')[0];
    const paras = [];
    for(const p of Array.from(body.children)){
      if(p.tagName === 'w:p'){
        const ts = Array.from(p.getElementsByTagName('w:t'));
        const text = ts.map(t => t.textContent).join('').trim();
        if(text) paras.push({ p, ts, text });
      }
    }
    if(!paras.length) throw new Error('文档中没有可替换的文字段落');

    // 2) 切分校对后的译文段
    const segs = proofText.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    // 去掉每段开头可能的列表/标题 markdown 记号（文档模式下不该有，防御性清理）
    const clean = segs.map(s => s.replace(/^#{1,4}\s*/m, '').replace(/^\s*[-*]\s+/m, '').trim());

    // 3) 对齐策略：一一对应；数量不匹配时按顺序对应到 min，多余忽略、缺失保留原文
    const n = Math.min(paras.length, clean.length);
    let replaced = 0, unchanged = 0;
    if(track){
      /* 修订模式：逐词/逐字 diff → w:del + w:ins，Word 审阅页可接受/拒绝 */
      const revId = { v: 0 };
      const date = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      for(let i = 0; i < n; i++){
        const target = paras[i];
        const newText = clean[i];
        if(newText === target.text){ unchanged++; continue; }
        writeTrackedDiff(doc, target, newText, revId, date);
        replaced++;
      }
    } else {
      for(let i = 0; i < n; i++){
        const target = paras[i];
        const newText = clean[i];
        if(newText === target.text){ unchanged++; continue; }
        // 写入第一个 w:t，清空其余（保留首个 run 的样式属性 → 字体/字号/加粗全保留）
        let first = true;
        for(const t of target.ts){
          if(first){ t.textContent = newText; t.setAttribute('xml:space', 'preserve'); first = false; }
          else t.textContent = '';
        }
        replaced++;
      }
    }
    const mismatchNote = paras.length !== clean.length
      ? '；⚠ 段落数不匹配（原文档 ' + paras.length + ' 段 / 校对输出 ' + clean.length + ' 段），已按顺序对应前 ' + n + ' 段，其余保留原文'
      : '';

    // 4) 序列化回写（补回 XML 声明）
    let serialized = new XMLSerializer().serializeToString(doc);
    // Chromium 的 XMLSerializer 会自带一个 <?xml?> 声明——先剥掉再统一补回，
    // 否则 document.xml 出现两条声明，Word/WPS 会判定文件损坏无法打开
    serialized = serialized.replace(/^\s*<\?xml[^>]*\?>\s*/i, '');
    const newXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + serialized;
    zip.file('word/document.xml', newXml);
    // 修订模式：settings.xml 加 w:trackChanges，让 Word 默认处于「记录修订」状态
    if(track){
      try{
        const stf = zip.file('word/settings.xml');
        if(stf){
          let st = await stf.async('string');
          if(!/<w:trackChanges[\s/>]/.test(st)) st = st.replace(/(<w:settings\b[^>]*>)/, '$1<w:trackChanges/>');
          zip.file('word/settings.xml', st);
        }
      }catch(_){} // settings 缺失/异常不阻断主流程
    }

    // 5) 打包下载
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    const baseName = (f.fileName || '文档.docx').replace(/\.docx$/i, '');
    if(track){
      dlBlob('校对修订_' + baseName + '.docx', blob);
      toast('已生成修订模式文档：' + replaced + ' 段带修订痕迹、' + unchanged + ' 段未动。用 Word 打开 →「审阅」→ 逐条接受/拒绝' + mismatchNote, replaced ? 'ok' : '');
    }else{
      dlBlob('校对后_' + baseName + '.docx', blob);
      toast('已生成：替换 ' + replaced + ' 段，未变 ' + unchanged + ' 段' + mismatchNote, replaced ? 'ok' : '');
    }
    glossLog(track ? 'exportDocxTrack' : 'exportDocx', 'dst:' + f.fileName, null, { track: !!track, replaced, unchanged, paras: paras.length, segs: clean.length });
  }catch(err){
    toast('文档生成失败：' + err.message, 'e');
  }finally{
    btn.disabled = false; btn.textContent = old;
  }
}
$('#btn-docout').onclick = () => exportProofreadDocx(false);
$('#btn-trackdoc').onclick = () => exportProofreadDocx(true);
// 勾/取消文档模式即时显隐两个导出按钮（恢复任务后无需重跑一次也能用）
$('#c-docmode').addEventListener('change', () => {
  const v = docModeActive() ? '' : 'none';
  $('#btn-docout').style.display = v;
  $('#btn-trackdoc').style.display = v;
});

/* ═══════════════════════════════════════════════════════════════
   专有译词库（3.0）
   数据流：导入文件 → 解析候选词条 → 归一化合并 → 审核 → 入库 → 导出/同步
   ═══════════════════════════════════════════════════════════════ */
/* GLOSS / PROMPTS 数据声明已提升到 01-core.js（避免 02/03 加载即引用时 ReferenceError） */
function savePrompts(){ save(LS_PROMPTS, PROMPTS); }
function newPromptId(){ return 'p_' + Date.now() + '_' + Math.floor(Math.random()*1000); }
function saveGloss(){ save(LS_GLOSS, GLOSS); }
function glossLog(action, target, before, after){
  GLOSS.log.unshift({ t: Date.now(), action, target, before: before||null, after: after||null });
  if(GLOSS.log.length > 500) GLOSS.log.length = 500;
}
let GID = GLOSS.terms.reduce((m,t)=>Math.max(m, Number(t.id)||0), 0) + 1;

// ── 繁简转换（懒加载 OpenCC）──
let __t2s = null;
async function t2s(text){
  if(!text) return text;
  try{
    if(!__t2s){
      await loadLib('OpenCC', ['https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js', 'https://unpkg.com/opencc-js@1.0.5/dist/umd/full.js']);
      __t2s = window.OpenCC.Converter({ from:'t', to:'cn' });
    }
    return await __t2s(text);
  }catch(_){ return text; }
}
// 全半角 + 空白归一
function normText(s){
  return String(s||'')
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 索引行解析启发式 ──
// 支持形态：
//   中文词目……12, 45          中文，外文……12       外文（中文）……12
//   中文（外文），12           外文 中文 12           中文，外文, 12
function parseIndexLine(line){
  let s = normText(line);
  if(!s || s.length < 2) return null;
  // 1) 剥离行尾页码：数字序列（逗号/空格分隔），前面容许 …… 或 , 或 。 或 —
  let pages = [];
  const pm = s.match(/(?:…+|\.+|-{1,2}|,|，|:|：|\s)\s*(\d+(?:\s*[,,，]\s*\d+)*)\s*$/);
  if(pm){ pages = pm[1].split(/[,,，]/).map(x=>x.trim()).filter(Boolean); s = s.slice(0, pm.index).trim(); }
  s = s.replace(/[…·，,;；:：]+$/, '').trim();
  if(!s) return null;

  // 2) 括号模式：中文（外文） 或 外文（中文）
  const br = s.match(/^(.+?)[（(](.+?)[）)]$/);
  if(br){
    const a = br[1].trim(), b = br[2].trim();
    const aIsZh = isZh(a), bIsZh = isZh(b);
    if(aIsZh && !bIsZh) return mkEntry(a, b, pages, s);
    if(!aIsZh && bIsZh) return mkEntry(b, a, pages, s);
    if(aIsZh && bIsZh) return mkEntry(a, b, pages, s); // 都是中文：b 作别名处理由归一层做
  }
  // 3) 分隔符模式：中文，外文 / 外文，中文 / 中文 外文
  const parts = s.split(/[,,，]|\s{2,}/).map(x=>x.trim()).filter(Boolean);
  if(parts.length >= 2){
    let zh = '', foreign = '';
    for(const p of parts){
      if(isZh(p) && !zh) zh = p;
      else if(!isZh(p) && !foreign) foreign = p;
      else if(isZh(p) && zh) { /* 第二个中文片段并入 zh（少见）*/ }
      else if(!isZh(p) && foreign){ foreign += ' ' + p; }
    }
    if(zh && foreign) return mkEntry(zh, foreign, pages, s);
    if(zh) return mkEntry(zh, '', pages, s);
  }
  // 4) "外文 中文"（空格分隔，如 "Aufhebung 扬弃"）
  const sp = s.split(/\s+/);
  if(sp.length >= 2 && !isZh(sp[0]) && isZh(sp[sp.length-1])){
    return mkEntry(sp[sp.length-1], sp.slice(0,-1).join(' '), pages, s);
  }
  // 5) 纯中文词目 / 纯外文词条
  if(isZh(s)) return mkEntry(s, '', pages, s);
  if(/[A-Za-zÀ-ÿā-žÁ-ý]/.test(s)) return mkEntry('', s, pages, s);
  return null;
}
function isZh(s){ return /[\u4e00-\u9fff]/.test(s); }
function zhRatio(s){ const c = String(s||''); const zh = (c.match(/[\u4e00-\u9fff]/g)||[]).length; return c.length ? zh/c.length : 0; }
function mkEntry(zh, foreign, pages, raw){
  return { zh: zh||'', foreign: foreign||'', pages, raw };
}

// ── 文件导入分发 ──
async function parseGlossFile(file){
  const ext = (file.name||'').split('.').pop().toLowerCase();
  const text = async () => new TextDecoder('utf-8').decode(await file.arrayBuffer());
  if(ext === 'txt')  return parseIndexText(await text(), file.name);
  if(ext === 'csv')  return parseCsvText(await text(), file.name);
  if(ext === 'json') return parseJsonText(await text(), file.name);
  if(ext === 'tbx' || ext === 'xml') return parseTbxText(await text(), file.name);
  if(ext === 'xlsx' || ext === 'xls') return await parseXlsxFile(file);
  if(ext === 'docx') return await parseGlossDocx(file);
  if(ext === 'pdf')  return await parseGlossPdf(file);
  throw new Error('不支持的格式 .' + ext + '（支持 txt / csv / json / tbx / xml / xlsx / docx / pdf）');
}

// TXT：逐行索引解析
async function parseIndexText(text, name){
  const entries = [];
  const NOISE = /^(索引|目錄|目录|Index|INDEX|Contents|CONTENTS|附錄|附录|参考文献|人名索引|术语索引|名词索引|主題索引|主题索引|词条|詞條)$/i;
  for(const line of text.split(/\r?\n/)){
    const raw = line.trim();
    if(NOISE.test(raw)) continue;            // 标题/分组行
    if(/^[A-Z]?$/.test(raw)) continue;        // 字母分组行（A/B/C…）
    const e = parseIndexLine(line);
    if(e && (e.zh || e.foreign)){
      // 无页码且无外文的超短纯中文行大概率是分组标题（如"德国观念论"），跳过
      if(!(e.pages||[]).length && !e.foreign && e.zh.length <= 6 && zhRatio(e.zh) === 1 && !/[，,、]/.test(e.zh)) continue;
      entries.push(e);
    }
  }
  if(!entries.length) throw new Error('未识别出任何词条，请检查索引格式（每行一条：词目……页码）');
  return { kind:'index', name, entries };
}

// CSV：列映射（src,dst,cat,note 或 外文,中文,类别,备注）
async function parseCsvText(text, name){
  const rows = csvParse(text);
  if(rows.length < 2) throw new Error('CSV 内容为空');
  const head = rows[0].map(h => String(h||'').trim().toLowerCase());
  // 自动猜列
  const c = {
    foreign: idxOf(head, ['src','外文','foreign','原文','term','en','english','德文','法文']),
    zh:      idxOf(head, ['dst','中文','zh','译名','中文译名','chinese','译文']),
    cat:     idxOf(head, ['cat','category','类别','分类','类型']),
    note:    idxOf(head, ['note','备注','说明','注释','note']),
    pages:   idxOf(head, ['pages','页码','页','page'])
  };
  const entries = [];
  if(c.zh >= 0 || c.foreign >= 0){
    for(const r of rows.slice(1)){
      const zh = c.zh >= 0 ? (r[c.zh]||'').trim() : '';
      const foreign = c.foreign >= 0 ? (r[c.foreign]||'').trim() : '';
      if(!zh && !foreign) continue;
      entries.push({ zh, foreign, cat: c.cat>=0 ? (r[c.cat]||'').trim() : '', note: c.note>=0 ? (r[c.note]||'').trim() : '', pages: c.pages>=0 ? String(r[c.pages]||'').split(/[,,，\s]+/).filter(x=>/^\d+$/.test(x)) : [], raw: r.join('|') });
    }
  } else {
    // 无表头：按"每行一个词条（词目……页码）"解析
    return parseIndexText(text, name);
  }
  if(!entries.length) throw new Error('CSV 未识别出数据行');
  return { kind:'csv', name, entries, header: head };
}
function idxOf(arr, keys){ for(const k of keys){ const i = arr.indexOf(k); if(i >= 0) return i; } return -1; }
function csvParse(text){
  const out = []; let row = [], cur = '', q = false;
  for(let i=0;i<text.length;i++){
    const ch = text[i];
    if(q){
      if(ch === '"'){ if(text[i+1] === '"'){ cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else {
      if(ch === '"') q = true;
      else if(ch === ','){ row.push(cur); cur = ''; }
      else if(ch === '\n'){ row.push(cur); out.push(row); row = []; cur = ''; }
      else if(ch !== '\r') cur += ch;
    }
  }
  if(cur || row.length){ row.push(cur); out.push(row); }
  return out.filter(r => r.some(c => String(c).trim()));
}

// JSON：数组 [{src,dst,...}] 或 [{zh,foreign,...}]
async function parseJsonText(text, name){
  let data;
  try{ data = JSON.parse(text); }catch(e){ throw new Error('JSON 解析失败：' + e.message); }
  if(!Array.isArray(data)) throw new Error('JSON 顶层必须是数组');
  const entries = data.map(o => ({
    zh: String(o.zh || o.dst || o['中文'] || o['译名'] || '').trim(),
    foreign: String(o.foreign || o.src || o['外文'] || o['原文'] || '').trim(),
    cat: String(o.cat || o['类别'] || o['类型'] || '').trim(),
    note: String(o.note || o['备注'] || '').trim(),
    pages: Array.isArray(o.pages) ? o.pages.map(String) : [],
    raw: JSON.stringify(o).slice(0, 120)
  })).filter(e => e.zh || e.foreign);
  if(!entries.length) throw new Error('JSON 无有效词条');
  return { kind:'json', name, entries };
}

// TBX：XML 解析 termEntry
async function parseTbxText(text, name){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const tes = Array.from(doc.getElementsByTagName('termEntry'));
  if(!tes.length) throw new Error('未找到 termEntry 节点（不是合法 TBX？）');
  const entries = [];
  for(const te of tes){
    let zh = '', foreign = '';
    const langSets = Array.from(te.children).filter(n => n.tagName === 'langSet');
    for(const ls of langSets){
      const lang = ls.getAttribute('xml:lang') || ls.getAttribute('lang') || '';
      const terms = Array.from(ls.getElementsByTagName('term'));
      const val = terms.length ? terms[0].textContent.trim() : '';
      if(!val) continue;
      if(/^zh/i.test(lang) || isZh(val)) zh = zh || val;
      else foreign = foreign || val;
    }
    if(zh || foreign) entries.push({ zh, foreign, pages: [], raw: te.getAttribute('id') || '' });
  }
  if(!entries.length) throw new Error('TBX 内无有效词条');
  return { kind:'tbx', name, entries };
}

// XLSX：SheetJS
async function parseXlsxFile(file){
  await loadLib('XLSX', ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js']);
  const wb = window.XLSX.read(await file.arrayBuffer(), { type:'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { header:1, raw:false }).map(r => r.map(c => String(c==null?'':c).trim()));
  if(rows.length < 2) throw new Error('Excel 数据为空');
  const head = rows[0].map(h => h.toLowerCase());
  const c = {
    foreign: idxOf(head, ['外文','src','foreign','原文','term']),
    zh:      idxOf(head, ['中文','dst','zh','译名','中文译名']),
    cat:     idxOf(head, ['类别','cat','category','类型']),
    note:    idxOf(head, ['备注','note','说明'])
  };
  if(c.zh < 0 && c.foreign < 0) throw new Error('Excel 表头找不到「中文/外文」列，请用第一行为表头');
  const entries = [];
  for(const r of rows.slice(1)){
    const zh = c.zh>=0 ? (r[c.zh]||'') : '';
    const foreign = c.foreign>=0 ? (r[c.foreign]||'') : '';
    if(!zh && !foreign) continue;
    entries.push({ zh, foreign, cat: c.cat>=0?(r[c.cat]||''):'' , note: c.note>=0?(r[c.note]||''):'', pages: [], raw: r.join('|') });
  }
  if(!entries.length) throw new Error('Excel 未识别出数据行');
  return { kind:'xlsx', name: file.name, entries, header: head };
}

// DOCX 索引：mammoth 转文本后逐行
async function parseGlossDocx(file){
  const mammoth = await loadLib('mammoth', ['https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', 'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js']);
  const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return parseIndexText(res.value || '', file.name);
}

// PDF 索引：pdf.js 抽文字后逐行
async function parseGlossPdf(file){
  await loadLib('pdfjs', ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js', 'https://cdn.bootcdn.net/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdn.staticfile.org/pdf.js/3.11.174/pdf.min.js']);
  if(!window.pdfjsLib.GlobalWorkerOptions.workerSrc){
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.bootcdn.net/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let all = '';
  for(let p=1;p<=pdf.numPages;p++){
    const tc = await (await pdf.getPage(p)).getTextContent();
    // 按 y 坐标分组成行
    const lines = {};
    for(const it of tc.items){
      const y = Math.round(it.transform[5] / 4) * 4;
      (lines[y] = lines[y] || []).push({ x: it.transform[4], s: it.str });
    }
    Object.keys(lines).sort((a,b)=>b-a).forEach(y => {
      const line = lines[y].sort((a,b)=>a.x-b.x).map(o=>o.s).join(' ').trim();
      if(line) all += line + '\n';
    });
    all += '\n';
  }
  return parseIndexText(all, file.name);
}

/* ═══════════ 智能扫描抽词（v4.17）═══════════
   用 LLM 从普通文章 / PDF / DOC / TXT 语义抽取术语，规避「把标题目录当术语」的低级错误 */
const SCAN_SYS = `你是专业的学术翻译术语整理助手。你的任务是从「待翻译的学术/专业文本」中提取需要统一译法的【专有术语】。

【必须提取】人名、地名、机构名、著作/文章名、学派/主义/思潮名、专业概念术语、专有缩写与代号。
【严格排除】章节标题、小标题、目录、页眉页脚、脚注/尾注编号、参考文献条目；普通名词与日常表达（如 "the"、"analysis"、"重要"、"因此"）；无术语价值的泛化词组。
【输出格式】只输出一个 JSON 数组，不要任何解释、不要 Markdown 代码块围栏。每项形如：
{"foreign":"原文术语","zh":"标准译名（不确定则空字符串）","type":"人物/概念/著作/学派/机构/事件/其他","note":"简注或使用约束（可空）","conf":"high/mid/low"}
conf 表示把握度：high=确为术语且译名确定；mid=是术语但译名存疑；low=可能只是普通词、拿不准。`;

// 清洗 LLM 返回：剥离 markdown 围栏、定位首个 JSON 数组；解析失败则按对象逐个兜底
function extractJsonArray(text){
  if(!text) return [];
  let s = String(text).trim();
  s = s.replace(/```(?:json|JSON)?/g, '').replace(/```/g, '');
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if(a < 0 || b <= a) return [];
  try{ const j = JSON.parse(s.slice(a, b + 1)); return Array.isArray(j) ? j : []; }
  catch(e){
    const out = [], re = /\{[^{}]*\}/g; let m;
    while((m = re.exec(s.slice(a, b + 1)))){ try{ out.push(JSON.parse(m[0])); }catch(_){} }
    return out;
  }
}

// 解析 LLM 返回的单个 JSON 对象（剥围栏、定位首 { 尾 }）
function extractJsonObject(text){
  if(!text) return null;
  let s = String(text).trim();
  s = s.replace(/```(?:json|JSON)?/g, '').replace(/```/g, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if(a < 0 || b <= a) return null;
  try{ const j = JSON.parse(s.slice(a, b + 1)); return (j && typeof j === 'object' && !Array.isArray(j)) ? j : null; }
  catch(e){ return null; }
}

// 文本分块：按约 size 字切分，尽量在换行/句末断，避免截断术语
function splitChunks(text, size){
  const chunks = []; let s = String(text || '').trim();
  while(s.length > size){
    let cut = s.lastIndexOf('\n', size);
    if(cut < size * 0.5) cut = s.lastIndexOf('。', size);
    if(cut < size * 0.5) cut = s.lastIndexOf('.', size);
    if(cut < size * 0.5) cut = size;
    chunks.push(s.slice(0, cut + 1));
    s = s.slice(cut + 1).trim();
  }
  if(s) chunks.push(s);
  return chunks;
}

// ── 集合（collection）辅助 ──
function newCollectionId(){ return 'c' + Date.now() + '_' + Math.floor(Math.random() * 1000); }
function getCollection(cid){ return GLOSS.collections.find(c => c.id === cid); }
// 术语是否命中「当前启用的集合」：未分组术语始终视为命中（向后兼容）
function termActive(t){
  const cols = Array.isArray(t.collections) ? t.collections : [];
  if(!cols.length) return true;
  return cols.some(cid => { const c = getCollection(cid); return !c || c.enabled !== false; });
}

// 智能扫描主流程：解析文件 → 分块 → LLM 抽词 → 建集合 → 归一入库
async function smartScanFile(file, onProgress){
  if(!CFG.apiKey){ toast('请先在「设置」页配置 API Key，再使用智能扫描', 'e'); throw new Error('no key'); }
  if(onProgress) onProgress('解析文件…', 0.05);
  const parsed = await parseFile(file, 'src', onProgress);
  const text = (parsed.fullText || '').trim();
  if(!text){ toast('未能从文件中提取到文字', 'e'); throw new Error('empty'); }
  const chunks = splitChunks(text, 2500);
  const all = []; const seen = new Set();
  for(let i = 0; i < chunks.length; i++){
    if(onProgress) onProgress('智能抽词 ' + (i + 1) + '/' + chunks.length + ' …', 0.1 + 0.85 * (i / chunks.length));
    const r = await callModel(SCAN_SYS, '待翻译文本（片段）：\n---\n' + chunks[i] + '\n---', null, 'gloss');
    for(const e of extractJsonArray(r.text)){
      if(!e || typeof e !== 'object') continue;
      const foreign = String(e.foreign || '').trim();
      const zh = String(e.zh || '').trim();
      if(!foreign && !zh) continue;
      const fk = foreign ? fKey(foreign) : ('zh:' + zh);
      if(seen.has(fk)) continue;
      seen.add(fk);
      all.push({ foreign, zh, cat: e.type || '其他',
        note: (e.note ? String(e.note).trim() : '') + (e.conf === 'low' ? '（低置信度，请人工确认）' : ''),
        conf: e.conf || 'mid', pages: [] });
    }
  }
  if(!all.length){ toast('未抽取出术语（文本可能不含专有术语）', 'e'); return { added: 0 }; }
  const cid = newCollectionId();
  const cname = (file.name || '扫描').replace(/\.[^.]+$/, '') || '扫描';
  GLOSS.collections.push({ id: cid, name: cname, source: file.name, kind: 'scan', enabled: true, createdAt: Date.now(), note: '' });
  const res = await glossIngest({ name: file.name, kind: 'scan', entries: all.map(e => ({ ...e, collections: [cid] })) });
  // 高置信度且有译名 → 自动确认并推荐；其余留待人工审核
  for(const e of all){
    if(e.conf === 'high' && e.zh){
      const hit = e.foreign
        ? GLOSS.terms.find(t => t.foreign && fKey(t.foreign) === fKey(e.foreign))
        : GLOSS.terms.find(t => t.zh === e.zh);
      if(hit && hit.status === 'pending'){ hit.status = 'confirmed'; if(!hit.recommend) hit.recommend = 'rec'; }
    }
  }
  const col = getCollection(cid); if(col) col.count = all.length;
  saveGloss(); renderGloss();
  return { added: res.added, merged: res.merged, cid, total: all.length };
}

// ── 归一化合并引擎：候选 entries → 入库 ──
// 外文比较键：忽略逗号/句点/空格/引号等标点差异（Hegel, G. W. F. == Hegel G. W. F.）
function fKey(s){ return String(s||'').toLowerCase().replace(/[,.\s'"()\[\]·-]+/g, ''); }
async function glossIngest(parsed){
  const sid = 's' + Date.now();
  GLOSS.sources.push({ id: sid, name: parsed.name, kind: parsed.kind, date: new Date().toISOString(), count: parsed.entries.length });
  let added = 0, merged = 0, conflicts = 0, aliasAdded = 0;

  for(const e of parsed.entries){
    // 归一：繁→简、全半角
    let zh = normText(await t2s(e.zh || ''));
    let foreign = normText(e.foreign || '');
    const pages = (e.pages || []).map(String);
    if(!zh && !foreign) continue;

    // 查找已有词条：外文比较键相同 → 合并（含大小写/标点差异）
    let hit = null;
    const fk = fKey(foreign);
    if(fk){
      hit = GLOSS.terms.find(t => t.foreign && fKey(t.foreign) === fk);
    }
    if(!hit && zh){
      // 中文主词相同 且（对方无外文 或 外文一致）
      hit = GLOSS.terms.find(t => t.zh === zh && (!t.foreign || !foreign || fKey(t.foreign) === fk));
    }
    if(hit){
      // 合并：别名 / 来源 / 页码 / 备注
      if(Array.isArray(e.collections)){ hit.collections = hit.collections || []; e.collections.forEach(c => { if(!hit.collections.includes(c)) hit.collections.push(c); }); }
      if(zh && zh !== hit.zh && !(hit.aliases||[]).includes(zh)){ hit.aliases = hit.aliases || []; hit.aliases.push(zh); aliasAdded++; }
      if(foreign && !hit.foreign) hit.foreign = foreign;
      if(hit.sources.indexOf(sid) < 0) hit.sources.push(sid);
      hit.occurrences = hit.occurrences || [];
      if(pages.length) hit.occurrences.push({ sid, pages });
      if(e.cat && !hit.type) hit.type = e.cat;
      if(e.note && (hit.note||'').indexOf(e.note) < 0) hit.note = (hit.note ? hit.note + '；' : '') + e.note;
      if(hit.status === 'confirmed' && foreign && hit.foreign && fKey(hit.foreign) !== fk){
        hit.status = 'pending'; hit.note = (hit.note ? hit.note+'；' : '') + '⚠ 外文冲突：' + hit.foreign + ' vs ' + foreign;
        conflicts++;
      }
      hit.updated = Date.now();
      merged++;
    } else {
      // 冲突检测：同中文主词、不同外文 → 仍新建但标记
      const clash = zh ? GLOSS.terms.find(t => t.zh === zh && t.foreign && foreign && fKey(t.foreign) !== fk) : null;
      const t = {
        id: GID++, zh, foreign, aliases: [], type: e.cat || guessType(zh, foreign),
        tags: [], note: e.note || (clash ? '⚠ 同名异源（外文不同）：' + clash.foreign : ''),
        sources: [sid], occurrences: pages.length ? [{ sid, pages }] : [],
        collections: Array.isArray(e.collections) ? e.collections : [],
        status: 'pending', recommend: '', created: Date.now(), updated: Date.now()
      };
      GLOSS.terms.push(t);
      if(clash){ t.note = (t.note ? t.note + '；' : '') + '⚠ 同名异源：另一条外文为 ' + clash.foreign; conflicts++; }
      added++;
    }
  }
  saveGloss();
  glossLog('import', 'source:' + sid, null, { name: parsed.name, added, merged, conflicts });
  renderGloss();
  return { added, merged, conflicts, aliasAdded };
}

// 类型自动猜测
function guessType(zh, foreign){
  if(/《.+》/.test(zh || '')) return '著作';
  const name = foreign || '';
  // 人名模式：Xxx, Xxx. / Xxx Xxx（首字母大写两词以上、无小写概念词）
  if(/^[A-ZÀ-Ý][a-zà-ÿ]+,\s*[A-ZÀ-Ý.]/.test(name)) return '人物';
  if(/^[A-ZÀ-Ý][a-zà-ÿ]+(\s+[A-ZÀ-Ý][a-zà-ÿ]+)+$/.test(name) && !/^(the|being|not|with|and)\b/i.test(name)) return '人物';
  return '概念';
}

// ── 自动标签规则引擎 ──
const DEF_RULES = [
  { id:'r1', pattern:'Hegel|黑格尔', tag:'德国观念论', on:true },
  { id:'r2', pattern:'Kant|康德', tag:'德国观念论', on:true },
  { id:'r3', pattern:'Althusser|阿尔都塞', tag:'结构马克思主义', on:true },
  { id:'r4', pattern:'Heidegger|海德格尔|Dasein|此在', tag:'现象学', on:true },
  { id:'r5', pattern:'Husserl|胡塞尔|现象学', tag:'现象学', on:true },
  { id:'r6', pattern:'Marx|马克思|资本|剩余价值|阶级|无产阶级', tag:'马克思主义', on:true },
  { id:'r7', pattern:'Gramsci|葛兰西|霸权', tag:'西方马克思主义', on:true },
  { id:'r8', pattern:'Lukács|卢卡奇|物化|总体性', tag:'西方马克思主义', on:true },
  { id:'r9', pattern:'Derrida|德里达|解构', tag:'解构主义', on:true },
  { id:'r10', pattern:'Foucault|福柯|谱系|规训', tag:'后结构主义', on:true }
];
function ensureRules(){
  if(!GLOSS.rules || !GLOSS.rules.length) GLOSS.rules = DEF_RULES.slice();
}
function applyAutoTags(term){
  ensureRules();
  let hit = 0;
  const text = (term.zh + ' ' + term.foreign + ' ' + (term.aliases||[]).join(' '));
  for(const r of GLOSS.rules){
    if(r.on === false) continue;
    try{
      const re = new RegExp(r.pattern, 'i');
      if(re.test(text) && (term.tags||[]).indexOf(r.tag) < 0){ term.tags = term.tags || []; term.tags.push(r.tag); hit++; }
    }catch(_){}
  }
  return hit;
}
function applyAutoTagsAll(){
  let n = 0;
  GLOSS.terms.forEach(t => { n += applyAutoTags(t); });
  if(n){ saveGloss(); renderGloss(); }
  return n;
}
