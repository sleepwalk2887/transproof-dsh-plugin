/* ═══════════ P1：文档输入解析（docx / pdf / 图片）═══════════ */
// 模块级缓存：每个 side 一份解析结果
const __TP_FILES = { src:null, dst:null };

// CDN 加载器：首次访问某能力时按需懒加载
const __TP_LIBS = { mammoth:null, pdfjs:null, tesseract:null, loadPromise:{} };
async function loadLib(name, urls){
  if(__TP_LIBS[name]) return __TP_LIBS[name];
  if(__TP_LIBS.loadPromise[name]) return __TP_LIBS.loadPromise[name];
  for(const url of urls){
    try{
      __TP_LIBS.loadPromise[name] = new Promise((res, rej)=>{
        const s = document.createElement('script');
        // 超时保护：证书错误等场景下 onerror 可能不触发，超时兜底避免卡死
        const timer = setTimeout(() => { s.remove(); rej(new Error('加载超时:' + url)); }, 10000);
        s.src = url;
        s.onload = () => { clearTimeout(timer); res(window[name]); };
        s.onerror = () => { clearTimeout(timer); rej(new Error('加载失败:' + url)); };
        document.head.appendChild(s);
      });
      __TP_LIBS[name] = await __TP_LIBS.loadPromise[name];
      return __TP_LIBS[name];
    }catch(e){
      __TP_LIBS.loadPromise[name] = null; // 失败后清除缓存，允许下次重试
    }
  }
  throw new Error('无法加载库 ' + name);
}

// ── Tesseract 路径多源解析：worker/core/lang 默认全指 jsdelivr，被墙时
// worker 加载失败会以 undefined 拒绝（→「解析失败undefined」），lang 下载失败会永久挂起 ──
const TESS_CANDIDATES = {
  workerPath: [
    'https://unpkg.com/tesseract.js@5.1.0/dist/worker.min.js',
    'https://registry.npmmirror.com/tesseract.js/5.1.0/files/dist/worker.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.0/dist/worker.min.js'
  ],
  corePath: [
    'https://unpkg.com/tesseract.js-core@5.1.0',
    'https://registry.npmmirror.com/tesseract.js-core/5.1.0/files',
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.0'
  ]
};
const TESS_STATUS_ZH = {
  'loading tesseract core':'下载OCR内核',
  'loading language data':'下载OCR语言包',
  'initializing tesseract':'初始化OCR',
  'recognizing text':'OCR识别中'
};
async function tpReachable(url){
  // Range/cors 都不加：普通 GET 拿到响应头即 cancel，避开预检且只拉几 KB
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = setTimeout(() => { try{ ctl && ctl.abort(); }catch(_){} }, 8000);
  try{
    const r = await fetch(url, { cache:'no-store', signal: ctl ? ctl.signal : undefined });
    if(r.body){ try{ await r.body.cancel(); }catch(_){} }
    return r.ok || r.status === 206;
  }catch(_){ return false; }
  finally{ clearTimeout(timer); }
}
async function tpTessPaths(){
  if(__TP_LIBS.tessPaths) return __TP_LIBS.tessPaths;
  const probeOne = async (list, suffix) => {
    for(const base of list){
      if(await tpReachable(base + suffix)) return base;
    }
    return list[0]; // 全挂也别挡路：真实下载还有一线机会，超时看门狗兜底
  };
  // langPath 语义 = 含平铺 <lang>.traineddata.gz 的目录（单值服务所有语言，
  // npm 的每语言分包布局拼不出来）→ 语言包随应用同源自带，探不到则不传、
  // 回落厂商默认的 jsdelivr 每语言布局
  const originDir = new URL('.', location.href).href.replace(/\/$/, '');
  const [workerPath, corePath, langOk] = await Promise.all([
    probeOne(TESS_CANDIDATES.workerPath, ''),
    probeOne(TESS_CANDIDATES.corePath, '/tesseract-core-simd-lstm.wasm.js'),
    Promise.all([
      tpReachable(originDir + '/chi_sim.traineddata.gz'),
      tpReachable(originDir + '/eng.traineddata.gz')
    ]).then(r => r.every(Boolean))
  ]);
  __TP_LIBS.tessPaths = { workerPath, corePath, langPath: langOk ? originDir : undefined };
  return __TP_LIBS.tessPaths;
}
// 统一 OCR 入口：多源主脚本 + 镜像路径探测 + 240s 看门狗（语言包下载失败会静默挂起）
async function tpRecognize(image, onOcrProgress){
  await loadLib('Tesseract', [
    'https://unpkg.com/tesseract.js@5.1.0/dist/tesseract.min.js',
    'https://registry.npmmirror.com/tesseract.js/5.1.0/files/dist/tesseract.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js'
  ]);
  const p = await tpTessPaths();
  let timer;
  const watchdog = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error('OCR 数据下载超时（语言包/内核），请检查网络后重试')), 240000);
  });
  try{
    return await Promise.race([
      window.Tesseract.recognize(image, 'chi_sim+eng', {
        logger: m => {
          if(onOcrProgress && m && typeof m.progress === 'number' && TESS_STATUS_ZH[m.status || '']){
            onOcrProgress(m);
          }
        },
        errorHandler: e => console.warn('tesseract:', e), // 否则 job 失败会在 onmessage 里 throw Error(event)
        workerPath: p.workerPath,
        corePath: p.corePath,
        langPath: p.langPath
      }),
      watchdog
    ]);
  } finally{ clearTimeout(timer); }
}
// 错误文案兜底：worker onerror 抛的 event.message 是 undefined，直接展示会是「解析失败undefined」
function errMsg(e){
  if(e == null) return '未知错误';
  if(typeof e === 'string') return e || '未知错误';
  if(e.message) return e.message;
  if(e.type) return 'OCR/解析内部错误(' + e.type + ')';
  try{ return JSON.stringify(e); }catch(_){ return String(e); }
}

// config.js 钩子：TP_FILE_HOOKS 允许朋友重写某个解析器
const TP_FILE_HOOKS = (window.TP_CONFIG && window.TP_CONFIG.fileHooks) || {};

// 主入口：file → 统一结构
async function parseFile(file, side, onProgress){
  const ext = (file.name||'').split('.').pop().toLowerCase();
  const hook = TP_FILE_HOOKS[side === 'src' ? 'parseSrc' : 'parseDst'];
  if(hook){ return await hook(file, ext, onProgress); }
  if(ext === 'docx') return await parseDocx(file, onProgress);
  if(ext === 'pdf')  return await parsePdf(file, onProgress);
  if(/^(png|jpe?g|webp|gif|bmp|tiff?)$/.test(ext)) return await parseImage(file, onProgress);
  if(/^(txt|md|markdown)$/.test(ext)) {
    // 纯文本：直接读，转成 docx 兼容结构供下游统一处理
    const text = await file.text();
    return {
      kind: 'txt',
      fileName: file.name,
      chapters: [{ title: '全文', text }],
      fullText: text,
      hasImages: false
    };
  }
  throw new Error('暂不支持的文件格式：' + ext + '（仅支持 .docx / .pdf / 图片 / .txt / .md）');
}

// ── Docx 解析 ──
async function parseDocx(file, onProgress){
  if(onProgress) onProgress('加载 mammoth…', 0.1);
  // 用 loadLib 返回值（缓存命中时 window.mammoth 可能不存在）
  const mammoth = await loadLib('mammoth', [
    'https://registry.npmmirror.com/mammoth/1.8.0/files/mammoth.browser.min.js',
    'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
    'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js'
  ]);
  if(onProgress) onProgress('读取 docx…', 0.4);
  // 纯文本：mammoth 直接搞定
  const txtRes = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const allText = txtRes.value || '';
  // 章节切分：解析 HTML 版（保留段落结构与 pStyle），按 H1/H2 切
  if(onProgress) onProgress('分析章节…', 0.7);
  const htmlRes = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const chapters = splitDocxChapters(htmlRes.value);
  if(onProgress) onProgress('完成', 1);
  return {
    kind:'docx',
    fileName:file.name,
    chapters: chapters.length ? chapters : [{ title:'全文', text:allText }],
    fullText: allText,
    hasImages: /<img\b/i.test(htmlRes.value)
  };
}

// 用 DOMParser 解析 mammoth 输出的 HTML，按 <h1> 切章节，<h2> 作为标题前缀
function splitDocxChapters(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const chapters = []; let cur = { title:'引言', text:'', sub:'' };
  function flush(){
    const combined = (cur.title + (cur.sub ? ' · '+cur.sub : '')).trim() || '(未命名章节)';
    if(cur.text.trim()){ chapters.push({ title: combined, text: cur.text.trim() }); }
    cur = { title:'', text:'', sub:'' };
  }
  doc.body.childNodes.forEach(n => {
    if(n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if(tag === 'h1'){ flush(); cur.title = (n.textContent||'').trim(); }
    else if(tag === 'h2'){ cur.sub = (n.textContent||'').trim(); }
    else { cur.text += (n.textContent||'').trim() + '\n\n'; }
  });
  flush();
  return chapters.length ? chapters : [{ title:'全文', text:(doc.body.textContent||'').trim() }];
}

// v4.21.3：pdf.js 文本项按 Y 坐标分组成行，行内按 X 排序、ASCII 单词边界补空格。
// 原实现 join(' ') 把整页拍成一行 → 源文件换行全丢（AI 无结构可保留，粘贴进 Word 不断行）。
// v4.22.0 版面分析：逐项保留高度与坐标（注释标号/脚注区检测要用）。
// 行聚合按 y 聚簇（容忍 5pt 内基线差）：上标通常比正文基线高 3-5pt，
// 旧的 /4*4 取整会把上标数字拆成独立一行，标号与正文就断开了。
function pdfLineObjs(tc){
  const items = [];
  for(const it of ((tc && tc.items) || [])){
    if(!(it.str || '')) continue;
    const tr = it.transform || [1,0,0,1,0,0];
    items.push({ x: tr[4], y: tr[5], s: it.str, h: Math.abs(it.height || 0) || Math.hypot(tr[2], tr[3]) || 0 });
  }
  items.sort((a,b) => b.y - a.y);           // y 大 = 页面上方
  const lines = [];
  for(const it of items){
    const cur = lines[lines.length - 1];
    if(cur && (cur.anchorY - it.y) <= 5 && (cur.anchorY - it.y) >= 0) cur.items.push(it);
    else lines.push({ anchorY: it.y, items: [it] });
  }
  return lines.map(L => {
    L.items.sort((a,b) => a.x - b.x);
    L.y = L.anchorY;
    L.h = L.items.reduce((m,o) => Math.max(m, o.h || 0), 0);
    return L;
  });
}
function lineJoin(L){
  return (L.items || []).reduce((acc, o) => {
    const s = o.s || '';
    if(!s) return acc;
    if(acc && !/\s$/.test(acc) && !/^\s/.test(s) && /[A-Za-z0-9]$/.test(acc) && /^[A-Za-z0-9]/.test(s)) return acc + ' ' + s;
    return acc + s;
  }, '').trim();
}
function pdfTextLines(tc){
  return pdfLineObjs(tc).map(lineJoin).filter(s => s.length);
}
/* 正文字号：取最长文本行的高度（正文行长 > 脚注行；标题虽大但短） */
function calcBodyH(lines){
  let best = 0, bestLen = 0;
  for(const L of lines){
    if(!(L.h > 0)) continue;
    const len = lineJoin(L).length;
    if(len > bestLen){ bestLen = len; best = L.h; }
  }
  if(best) return best;
  return lines.reduce((m,L) => Math.max(m, L.h || 0), 0) || 12;
}
/* 标号包胶：小字号纯数字（上标标号）→ [n]，让 AI 与贴注都能对上号。
   顺手吃掉标号前的独立空格项（pdf.js 会在 run 间吐 ' ' 项，标号按惯例贴附前词）。 */
function wrapMarkers(L, bodyH){
  const items = L.items || [];
  const out = [];
  for(let i = 0; i < items.length; i++){
    const o = items[i];
    const t = (o.s || '').trim();
    if(t && /^\d{1,3}$/.test(t) && o.h > 0 && bodyH > 0 && o.h < bodyH * 0.85){
      while(out.length && !String(out[out.length - 1].s || '').trim()) out.pop();
      out.push({ s: '[' + t + ']' });
    } else out.push(o);
  }
  return lineJoin({ items: out });
}
const H_END  = /^\s*(注释|注解|尾注|脚注|注脚|译注|校注|Notes|Footnotes|Endnotes|Annotations)\s*[:：]?\s*$/i;
const H_STOP = /^(参考文献|文献目录|Bibliography|References|索引|Index|附录|Appendix|致谢|Acknowledg)/;
const RE_ENTRY = /^\s*[\[［（(]?([0-9]{1,3}|[*†‡§])[\]］）)]?[.．、)]?\s*(\S.*)$/;
const RE_ENTRY_START = /^\s*(\[\d{1,3}\]|\(\d{1,3}\)|\d{1,3}[.)\s]|[*†‡])/;
/* 从 start 起解析注释条目：编号须递增才算新条目（正文数字行不误收），其余行并入当前条目。
   遇到停止标题（参考文献等）返回 stopIdx，让调用方把之后的行还给正文。 */
function parseNoteEntries(lines, start, join){
  const out = [];
  let cur = null, expected = null, stopIdx = -1;
  for(let i = start; i < lines.length; i++){
    const s = join(lines[i]);
    if(!s) continue;
    if(H_STOP.test(s)){ stopIdx = i; break; }
    if(H_END.test(s)){ if(cur){ out.push(cur); cur = null; } continue; }
    const m = s.match(RE_ENTRY);
    if(m){
      const raw = m[1];
      const num = /^[0-9]+$/.test(raw) ? parseInt(raw, 10) : null;
      const ok = num === null ? out.length < 400 : (expected === null ? num <= 400 : num === expected);
      if(ok){
        if(cur) out.push(cur);
        cur = { n: raw, text: m[2] };
        if(num !== null) expected = num + 1;
        continue;
      }
    }
    if(cur) cur.text += ' ' + s;   // 条目续行
  }
  if(cur) out.push(cur);
  return { entries: out, stopIdx };
}
/* 页底脚注区起点：优先找分隔线（页面下 60% 的纯横线/点线行），否则找页底小字号条目行。
   返回首个脚注行下标，没找到返回 -1。bodyH=0 表示无版面信息（OCR 行），只走分隔线支路。 */
function detectFootBlock(lines, bodyH, pageH){
  if(!lines || lines.length < 2) return -1;
  let start = -1;
  for(let i = lines.length - 1; i >= Math.floor(lines.length * 0.4); i--){
    const s = lineJoin(lines[i]);
    if(s && s.length <= 40 && /^[\s\-–—_·.=*•]+$/.test(s) && /[-–—_·.]/.test(s)){ start = i; break; }
  }
  if(start < 0 && bodyH > 0){
    for(let i = 0; i < lines.length; i++){
      const L = lines[i];
      if(L.y < pageH * 0.45 && L.h > 0 && L.h < bodyH * 0.78 && RE_ENTRY_START.test(lineJoin(L))){ start = i; break; }
    }
  }
  if(start >= 0 && bodyH > 0){
    let hit = 0;
    for(let i = start; i < lines.length; i++){
      const L = lines[i];
      if((L.h > 0 && L.h < bodyH * 0.85) || RE_ENTRY_START.test(lineJoin(L))) hit++;
    }
    if(!hit) return -1;
  }
  return start;
}
/* 从输出/译文中抽出注释标号集合：[1]、（1）、(1)、上标 ¹²³⁴… */
function markersIn(text){
  const SUP = { '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9' };
  const set = new Set();
  const re = /[\[［（(]\s*(\d{1,3}|[a-hA-H])\s*[\]］）)]|[⁰¹²³⁴⁵⁶⁷⁸⁹]/g;
  let m;
  while((m = re.exec(text || '')) !== null) set.add(m[1] || SUP[m[0]] || m[0]);
  return set;
}

// ── PDF 解析（自动判别文字型 vs 扫描件）──
async function parsePdf(file, onProgress){
  if(onProgress) onProgress('加载 pdf.js…', 0.05);
  await loadLib('pdfjs', [
    'https://registry.npmmirror.com/pdfjs-dist/3.11.174/files/build/pdf.min.js',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
    'https://cdn.bootcdn.net/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdn.staticfile.org/pdf.js/3.11.174/pdf.min.js'
  ]);
  // 配置 worker（pdfjs 3.x 用 pdfjsLib 全局）
  if(!window.pdfjsLib.GlobalWorkerOptions.workerSrc){
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://registry.npmmirror.com/pdfjs-dist/3.11.174/files/build/pdf.worker.min.js';
  }
  if(onProgress) onProgress('读取 PDF…', 0.2);
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data:buf }).promise;
  const total = pdf.numPages;
  let allText = '';
  const chapterMap = []; let curChap = { title:'全部页面', text:'', pageStart:1, pageEnd:total };

  // outline 章节
  let outline = null;
  try { outline = await pdf.getOutline(); } catch(_){}
  if(outline && outline.length){
    // 把每个 outline 项解析成 [startPage]
    const pageChap = [];
    for(const o of outline){
      if(o.items && o.items.length) continue; // 仅顶层
      let p = 1;
      try{
        if(typeof o.dest === 'string'){
          const pageIdx = await pdf.getPageIndex(o.dest);
          p = pageIdx + 1;
        } else if(Array.isArray(o.dest) && o.dest[0]){
          const ref = pdf.doc?.catalog?.get(o.dest[0]) || o.dest[0];
          // 直接用 PDF.js 解析
          const pageIdx = await pdf.getPageIndex(ref);
          p = pageIdx + 1;
        }
      }catch(_){}
      pageChap.push({ title:o.title, page:p });
    }
    pageChap.sort((a,b)=>a.page-b.page).forEach((c,i,arr) => {
      c.pageEnd = (arr[i+1] && arr[i+1].page>1) ? arr[i+1].page-1 : total;
    });
    pageChap.forEach(c => chapterMap.push({ title:c.title.replace(/[^\x20-\x7E\u00A0-\u024F\u3000-\u303F\uFF00-\uFFEF一-鿿㐀-䶿가-힯]/g,'').trim() || '第'+c.page+'页', text:'', pageStart:c.page, pageEnd:c.pageEnd }));
  }

  // 逐页解析：先抽文字层；文字层几乎为空 → 该页单独 OCR（堵住混合型 PDF 漏页）
  let ocrPages = 0;
  const scanReport = [];
  const notes = [];        // v4.22.0 提取的注释条目（页底脚注 foot + 文末尾注 end）
  let inEndnotes = false;  // 已进入文末尾注区（跨页状态）
  for(let p=1; p<=total; p++){
    if(onProgress) onProgress('解析第 '+p+' / '+total+' 页…', 0.2 + 0.75*p/total);
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const notesBefore = notes.length;
    const lineObjs = pdfLineObjs(tc);
    const bodyH = calcBodyH(lineObjs);
    let pageH = 792; try{ pageH = page.getViewport({ scale:1 }).height; }catch(_){}
    // v4.22.0：脚注区/尾注区检测——注释条目进 notes，正文只留标号不留注释文本
    const footStart = detectFootBlock(lineObjs, bodyH, pageH);
    let bodyEnd = footStart >= 0 ? footStart : lineObjs.length;
    let endStart = -1;
    if(inEndnotes){ endStart = 0; bodyEnd = 0; }
    else {
      const hi = lineObjs.findIndex(L => H_END.test(lineJoin(L)));
      if(hi >= 0 && p > 1){ inEndnotes = true; endStart = hi + 1; bodyEnd = Math.min(bodyEnd, hi); }
    }
    let endRest = [];
    if(footStart >= 0){
      parseNoteEntries(lineObjs, footStart, lineJoin).entries.forEach(e => notes.push({ n:e.n, text:e.text, page:p, kind:'foot' }));
    }
    if(endStart >= 0){
      const r = parseNoteEntries(lineObjs, endStart, lineJoin);
      r.entries.forEach(e => notes.push({ n:e.n, text:e.text, page:p, kind:'end' }));
      if(r.stopIdx >= 0){ inEndnotes = false; endRest = lineObjs.slice(r.stopIdx); } // 停止标题（参考文献等）之后归还正文
    }
    // v4.21.3：按行保留源文换行（原 join 全页拍平成一行）；v4.22.0：上标标号包胶成 [n]
    let pageText = lineObjs.slice(0, bodyEnd).map(L => wrapMarkers(L, bodyH)).filter(s => s.length).join('\n')
      .replace(/[^\n\x20-\x7E\u00A0-\u024F\u3000-\u303F\uFF00-\uFFEF一-鿿㐀-䶿가-힯]/g, '')
      .replace(/ {3,}/g, ' ')
      .trim();
    if(endRest.length){
      const rt = endRest.map(L => wrapMarkers(L, bodyH)).filter(s => s.length).join('\n');
      if(rt) pageText = (pageText ? pageText + '\n' : '') + rt;
    }
    const gotNewNotes = notes.length > notesBefore;
    let method = '文本层', conf = null;
    if(pageText.replace(/\s/g, '').length < 8 && !gotNewNotes){
      // 文字层缺失/极少 → 该页按扫描页单独 OCR
      method = 'OCR'; ocrPages++;
      if(onProgress) onProgress('第 '+p+' 页无文字层，OCR 识别…', 0.2 + 0.75*p/total);
      const ocr = await ocrPdfPage(page, m => {
        if(onProgress) onProgress('第 '+p+' 页无文字层 · ' + (TESS_STATUS_ZH[m.status] || m.status) + ' ' + Math.round(m.progress*100) + '%', 0.2 + 0.75*p/total);
      });
      pageText = ocr.text; conf = ocr.conf;
      // v4.22.0 OCR 页没有字号信息：只做分隔线/尾注标题级检测，正文切掉注释区
      const oLines = (pageText || '').split('\n').map(s => ({ y:0, h:0, items:[{ x:0, s, h:0 }] }));
      const oFoot = detectFootBlock(oLines, 0, pageH);
      let oStart = -1, oCut = -1;
      if(inEndnotes){ oStart = 0; oCut = 0; }
      else {
        const hi = oLines.findIndex(L => H_END.test(lineJoin(L)));
        if(hi >= 0 && p > 1){ inEndnotes = true; oStart = hi + 1; oCut = hi; }
      }
      let cut = oLines.length;
      if(oFoot >= 0) cut = Math.min(cut, oFoot);
      if(oCut >= 0) cut = Math.min(cut, oCut);
      if(oFoot >= 0){
        parseNoteEntries(oLines, oFoot, lineJoin).entries.forEach(e => notes.push({ n:e.n, text:e.text, page:p, kind:'foot' }));
      }
      if(oStart >= 0){
        const r = parseNoteEntries(oLines, oStart, lineJoin);
        r.entries.forEach(e => notes.push({ n:e.n, text:e.text, page:p, kind:'end' }));
        if(r.stopIdx >= 0){ inEndnotes = false; oLines._rest = oLines.slice(r.stopIdx).map(L => lineJoin(L)).filter(s => s.length).join('\n'); }
      }
      if(cut < oLines.length || cut === 0){
        pageText = oLines.slice(0, cut).map(L => lineJoin(L)).filter(s => s.length).join('\n');
      }
      if(oLines._rest) pageText = (pageText ? pageText + '\n' : '') + oLines._rest;
      if(!pageText.replace(/\s/g, '') && notes.length > notesBefore) method = '注释页';
    }
    else if(gotNewNotes && pageText.replace(/\s/g, '').length < 8){ method = '注释页'; }
    scanReport.push({ page:p, method, chars:(pageText||'').length, conf });
    allText += '\n\n[第 '+p+' 页]\n' + (pageText || '（空白）') + '\n';
    // 按页范围归到章节
    const ch = chapterMap.find(c => p >= c.pageStart && p <= c.pageEnd);
    if(ch) ch.text += (pageText || '') + '\n\n';
  }

  if(!chapterMap.length){
    // 无 outline：用"第N章"正则硬切
    const hard = splitTextByChapterKeywords(allText);
    chapterMap.push(...hard);
  }
  if(onProgress) onProgress('完成', 1);
  return {
    kind: ocrPages === total ? 'pdf-scan' : (ocrPages > 0 ? 'pdf-mixed' : 'pdf-text'),
    fileName:file.name,
    chapters: chapterMap.map(c => ({ title:c.title, text:c.text.trim(), pageStart:c.pageStart, pageEnd:c.pageEnd })).filter(c => c.text),
    fullText: allText.trim(),
    hasImages: ocrPages > 0,
    scanReport,
    notes   // v4.22.0 注释条目（贴注功能数据源）
  };
}

function splitTextByChapterKeywords(text){
  // 兜底：用"第 N 章"或大写罗马数字切
  const out = [{ title:'前言', text:'' }];
  const re = /\n\s*(第\s*[一二三四五六七八九十百千零0-9]+\s*章[^\n]*|Chapter\s+\d+[^\n]*|CHAPTER\s+[IVXLCDM]+[^\n]*)\n/g;
  let last = 0, m;
  while((m = re.exec(text))){
    out[out.length-1].text = text.slice(last, m.index).trim();
    out.push({ title:m[1].trim(), text:'' });
    last = m.index + m[0].length;
  }
  out[out.length-1].text = text.slice(last).trim();
  return out.filter(c => c.text);
}

// 单页 OCR（混合型 PDF 用）：渲染一页成图 → tesseract 识别，返回文字与置信度
async function ocrPdfPage(page, onOcrProgress){
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width; canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const { data } = await tpRecognize(blob, onOcrProgress);
  return { text: (data.text || '').trim(), conf: typeof data.confidence === 'number' ? Math.round(data.confidence) : null };
}

// PDF 扫描件：把每页渲染成图片 → tesseract.js OCR
async function parsePdfAsScan(file, pdf, total, onProgress){
  if(onProgress) onProgress('加载 OCR…', 0.1);
  const ocrAll = [];
  for(let p=1; p<=total; p++){
    if(onProgress) onProgress('OCR 第 '+p+' / '+total+' 页…', 0.1 + 0.85*p/total);
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale:2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext:ctx, viewport }).promise;
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const { data:{ text } } = await tpRecognize(blob, m => {
      if(onProgress) onProgress('OCR 第 '+p+' / '+total+' 页 · ' + (TESS_STATUS_ZH[m.status] || m.status) + ' ' + Math.round(m.progress*100) + '%', 0.1 + 0.85*p/total);
    });
    ocrAll.push({ page:p, text: (text||'').trim() });
  }
  if(onProgress) onProgress('完成', 1);
  return {
    kind:'pdf-scan',
    fileName:file.name,
    chapters: ocrAll.map(o => ({ title:'第 '+o.page+' 页', text:o.text })),
    fullText: ocrAll.map(o => '【第 '+o.page+' 页】\n'+o.text).join('\n\n'),
    hasImages: true
  };
}

// ── 图片输入解析（直接 OCR）──
async function parseImage(file, onProgress){
  if(onProgress) onProgress('加载 OCR…', 0.1);
  const { data:{ text } } = await tpRecognize(file, m => {
    if(onProgress) onProgress((TESS_STATUS_ZH[m.status] || m.status) + ' ' + Math.round(m.progress*100) + '%', 0.4 + 0.55*(m.progress || 0));
  });
  if(onProgress) onProgress('完成', 1);
  return {
    kind:'image',
    fileName:file.name,
    chapters:[{ title:file.name, text:(text||'').trim() }],
    fullText:(text||'').trim(),
    hasImages:true
  };
}

// ── UI 渲染 ──
function renderFileBar(side){
  const bar = $('#'+side+'FileBar'); if(!bar) return;
  const data = __TP_FILES[side];
  bar.innerHTML = '';
  if(!data){
    bar.classList.remove('has-file');
    const btn = document.createElement('button');
    btn.className = 'btn gray'; btn.id = 'btn-'+side+'-file'; btn.textContent = '📂 上传' + (side==='src'?'原文':'译文') + '文档';
    btn.onclick = () => $('#'+side+'File').click();
    bar.appendChild(btn);
    const tid = document.createElement('button');
    tid.className = 'btn gray sm'; tid.id = 'btn-tidy-' + side;
    tid.textContent = side === 'src' ? '🧽 原文整理' : '🧽 译文整理';
    tid.title = '对噪声文本（语音转写/OCR/段落乱序）排序整理、重分段、去噪：只修明显的乱，不删内容、不改风格、不臆改专名与数字（v4.24.0）';
    tid.onclick = () => tidyText(side);
    bar.appendChild(tid);
    const tip = document.createElement('span');
    tip.style.cssText = 'font-size:11px;color:var(--tx3)';
    tip.textContent = '支持 .docx / .pdf / 图片（扫描件自动 OCR）';
    bar.appendChild(tip);
    const inp = document.createElement('input');
    inp.type='file'; inp.id = side+'File'; inp.accept='.docx,.pdf,image/*'; inp.hidden = true;
    inp.onchange = e => onFileChosen(side, e.target.files[0]);
    bar.appendChild(inp);
    return;
  }
  bar.classList.add('has-file');
  const name = document.createElement('span');
  name.className = 'fb-name';
  name.innerHTML = '📄 ' + esc(data.fileName) + '<span class="fb-meta">'
    + esc(kindLabel(data.kind)) + (data.chapters.length ? ' · '+data.chapters.length+' 章节' : '')
    + (data.hasImages ? ' · 含图' : '') + ((data.notes && data.notes.length) ? ' · 注释 ' + data.notes.length + ' 条' : '') + '</span>';
  bar.appendChild(name);

  // v4.24：整理按钮（bar 每次重建，需回填）
  const tid2 = document.createElement('button');
  tid2.className = 'btn gray sm'; tid2.id = 'btn-tidy-' + side;
  tid2.textContent = side === 'src' ? '🧽 原文整理' : '🧽 译文整理';
  tid2.title = '对噪声文本（语音转写/OCR/段落乱序）排序整理、重分段、去噪：只修明显的乱，不删内容、不改风格、不臆改专名与数字（v4.24.0）';
  tid2.onclick = () => tidyText(side);
  bar.appendChild(tid2);

  // v4.3：扫描质检报告入口（PDF 逐页解析后生成）
  if(data.scanReport && data.scanReport.length){
    const ocrN = data.scanReport.filter(r => r.method === 'OCR').length;
    const emptyN = data.scanReport.filter(r => r.chars === 0).length;
    const lowConf = data.scanReport.filter(r => r.method === 'OCR' && r.conf !== null && r.conf < 70).length;
    const rpt = document.createElement('button');
    rpt.className = 'btn sm gray';
    rpt.style.cssText = 'font-size:11px;margin-left:4px';
    rpt.textContent = '📋 扫描报告 ' + data.scanReport.length + ' 页' + (ocrN ? ' · ' + ocrN + ' 页 OCR' : '') + ((emptyN || lowConf) ? ' ⚠' : '');
    rpt.onclick = () => showScanReport(data);
    bar.appendChild(rpt);
  }

  // v4.3：原文侧导出 docx（PDF/图片/文本 → docx；docx 本身即 docx 无需转）
  if(side === 'src' && data.kind !== 'docx'){
    const ex = document.createElement('button');
    ex.className = 'btn sm';
    ex.style.cssText = 'font-size:11px;margin-left:4px';
    ex.textContent = '📥 导出原文 docx';
    ex.onclick = () => exportOriginalDocx();
    bar.appendChild(ex);
  }

  if(data.chapters.length > 1){
    const sel = document.createElement('select');
    const allOpt = document.createElement('option');
    allOpt.value = ''; allOpt.textContent = '全部（'+data.chapters.length+' 章）';
    sel.appendChild(allOpt);
    data.chapters.forEach((c,i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = (i+1) + '. ' + c.title.slice(0,28);
      sel.appendChild(o);
    });
    const cur = data._chapterIdx;
    sel.value = cur === undefined ? '' : cur;
    sel.onchange = () => fillFromChapter(side, sel.value === '' ? -1 : +sel.value);
    bar.appendChild(sel);
  }

  const x = document.createElement('button');
  x.className = 'btn x'; x.textContent = '✕ 清除';
  x.onclick = () => { __TP_FILES[side] = null; renderFileBar(side); $('#'+side).value = ''; saveTask(); };
  bar.appendChild(x);

  // 3.1 文档模式勾选框联动：仅 dst 侧 docx 可用
  const dm = $('#c-docmode');
  if(dm){
    const usable = (side === 'dst' && data.kind === 'docx' && !!data._zipBytes);
    if(usable){
      dm.disabled = false;
      $('#docModeWrap').style.color = '';
      $('#docModeHint').textContent = '（'+data.fileName+'）';
    } else if(side === 'dst'){
      dm.disabled = true; dm.checked = false;
      $('#docModeWrap').style.color = 'var(--tx3)';
      $('#docModeHint').textContent = '（需上传 .docx 译文）';
    }
  }
}

function kindLabel(k){ return ({'docx':'Word 文档','pdf-text':'PDF（文字型）','pdf-scan':'PDF（扫描件）','pdf-mixed':'PDF（混合·含扫描页）','image':'图片'})[k] || k; }

// 扫描质检报告弹窗（PDF 逐页解析后的质量一览）
function showScanReport(data){
  const report = data.scanReport || [];
  const ocrN = report.filter(r => r.method === 'OCR').length;
  const emptyN = report.filter(r => r.chars === 0).length;
  const rows = report.map(r => {
    let status = '✅ 正常';
    if(r.chars === 0) status = '⚠️ 空白页';
    else if(r.method === 'OCR' && r.conf !== null && r.conf < 70) status = '⚠️ 低置信度';
    return '<tr><td>' + r.page + '</td><td>' + (r.method === 'OCR' ? 'OCR 识别' : '文字层') + '</td><td>' + r.chars + '</td><td>' + (r.conf === null ? '—' : r.conf + '%') + '</td><td>' + status + '</td></tr>';
  }).join('');
  modal('扫描质检报告', [
    '<div style="font-size:13px;color:var(--tx2);line-height:1.8;margin-bottom:12px">共 <b>' + report.length + '</b> 页' + (ocrN ? '，其中 <b>' + ocrN + '</b> 页为 OCR 识别' : '') + (emptyN ? '，<b style="color:var(--err)">' + emptyN + '</b> 页空白' : '') + '。<br>空白页或低置信度 OCR 页建议人工核对，避免内容遗漏。</div>',
    '<div style="max-height:52vh;overflow:auto"><table class="g-table"><thead><tr><th>页码</th><th>识别方式</th><th>字数</th><th>OCR 置信度</th><th>状态</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
  ].join(''));
}

/* ═══════════ v4.3：原文 PDF/图片/文本 → docx 导出 ═══════════
   最小 OOXML 重建：文字按章节/段落写入 docx（保文字，丢版式） */
function escXml(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }

async function buildDocxFromChapters(chapters){
  await loadLib('JSZip', ['https://registry.npmmirror.com/jszip/3.10.1/files/dist/jszip.min.js', 'https://cdn.bootcdn.net/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js']);
  const zip = new window.JSZip();
  const paras = [];
  const list = chapters && chapters.length ? chapters : [{ title:'', text:'' }];
  list.forEach(c => {
    if(c.title && list.length > 1){
      paras.push('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>' + escXml(c.title) + '</w:t></w:r></w:p>');
    }
    String(c.text || '').split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(line => {
      paras.push('<w:p><w:r><w:t xml:space="preserve">' + escXml(line) + '</w:t></w:r></w:p>');
    });
  });
  const body = paras.length ? paras.join('') : '<w:p/>';
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' + body + '</w:body></w:document>';
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';
  const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
    '</w:styles>';
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', docRels);
  zip.file('word/styles.xml', styles);
  return await zip.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

async function exportOriginalDocx(){
  const f = __TP_FILES.src;
  if(!f){ toast('请先在原文侧上传文件', 'e'); return; }
  if(!f.fullText || !f.fullText.trim()){ toast('未解析到任何文字，无法导出', 'e'); return; }
  try{
    const blob = await buildDocxFromChapters(f.chapters);
    const base = (f.fileName || '原文').replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = base + '.docx'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('已导出：' + base + '.docx（文字版，图片与复杂版式未保留）');
  }catch(e){ toast('导出失败：' + e.message, 'e'); }
}

// 用户选章节后回填 textarea
function fillFromChapter(side, idx){
  const data = __TP_FILES[side]; if(!data) return;
  if(idx < 0){ data._chapterIdx = undefined; $('#'+side).value = data.fullText; return; }
  data._chapterIdx = idx;
  $('#'+side).value = data.chapters[idx].text;
}

// 用户选择文件后的总入口
async function onFileChosen(side, file){
  if(!file) return;
  const bar = $('#'+side+'FileBar');
  // 渲染进度态
  bar.innerHTML = '<span class="fb-spin"></span><span>正在解析 '+esc(file.name)+'…</span>';
  bar.classList.add('has-file');
  try{
    const data = await parseFile(file, side, (msg, p) => {
      bar.innerHTML = '<span class="fb-spin"></span><span>'+esc(msg)+'</span><span class="fb-progress">' + Math.round(p*100) + '%</span>';
    });
    // 3.1 文档模式：译文侧 docx 保留原始 zip 字节，供校对后回写
    if(side === 'dst' && data.kind === 'docx'){
      try{ data._zipBytes = await file.arrayBuffer(); }catch(_){}
    }
    __TP_FILES[side] = data;
    renderFileBar(side);
    // 默认回填"全部"
    fillFromChapter(side, -1);
    toast('已解析：'+data.chapters.length+' 章节，'+data.fullText.length+' 字'+((data.notes && data.notes.length) ? ' · 注释 '+data.notes.length+' 条' : ''));
    saveTask();
  }catch(err){
    renderFileBar(side);
    toast('解析失败：' + errMsg(err), 'e');
  }
}

/* ═══════════ 任务断点续传（本地快照，避免重新上传扫描）═══════════ */
const LS_TASK = 'tp.task';
function fileSnap(f){
  if(!f) return null;
  return { kind:f.kind, fileName:f.fileName, chapters:f.chapters, fullText:f.fullText, hasImages:f.hasImages, _chapterIdx:f._chapterIdx, scanReport:f.scanReport || null, notes:f.notes || [] };
}
function saveTask(){
  try{
    const snap = {
      page: ((document.querySelector('nav button.on')||{}).dataset||{}).page || 'p-work',
      work: { src:$('#src').value, dst:$('#dst').value, extra:$('#extra').value, out:LAST_OUT, auditFix: (typeof AUDIT_FIX === 'object' && AUDIT_FIX && Object.keys(AUDIT_FIX).length) ? AUDIT_FIX : null },
      trans: { src:$('#ts-src').value, out:TS_LAST_OUT },
      files: { src:fileSnap(__TP_FILES.src), dst:fileSnap(__TP_FILES.dst), tsSrc:fileSnap(TS_FILES.src) },
      t: Date.now()
    };
    const has = snap.work.src || snap.work.dst || snap.work.extra || snap.trans.src || snap.work.out || snap.files.src || snap.files.dst || snap.files.tsSrc;
    if(has) localStorage.setItem(LS_TASK, JSON.stringify(snap));
    else localStorage.removeItem(LS_TASK);
  }catch(e){ /* localStorage 满或隐私模式：静默失败 */ }
}
function restoreTask(s){
  if(!s) return;
  if(s.files && s.files.src) __TP_FILES.src = s.files.src;
  if(s.files && s.files.dst) __TP_FILES.dst = s.files.dst;
  if(s.files && s.files.tsSrc) TS_FILES.src = s.files.tsSrc;
  if(s.work){
    if(s.work.src) $('#src').value = s.work.src;
    if(s.work.dst) $('#dst').value = s.work.dst;
    if(s.work.extra) $('#extra').value = s.work.extra;
    if(s.work.out){
      LAST_OUT = s.work.out; $('#out').innerHTML = md(s.work.out); $('#outHint').textContent = '已恢复上次结果';
      AUDIT_FIX = (s.work.auditFix && typeof s.work.auditFix === 'object') ? s.work.auditFix : {};
      markErrorLines(); renderAuditControls(); renderErrorFilter(LAST_OUT); dedupAuditLines(); paintErrFixSpans();
    }
  }
  if(s.trans){
    if(s.trans.src) $('#ts-src').value = s.trans.src;
    if(s.trans.out){ TS_LAST_OUT = s.trans.out; $('#ts-out').innerHTML = md(s.trans.out); $('#ts-outHint').textContent = '已恢复上次译文'; }
  }
  renderFileBar('src'); renderFileBar('dst');
  tsRenderSrcBar();
  if(s.files && s.files.tsSrc) $('#ts-srcStat').textContent = '已恢复：' + s.files.tsSrc.chapters.length + ' 章节';
  if(s.page){ const b = document.querySelector('nav button[data-page="'+s.page+'"]'); if(b) b.click(); }
  saveTask();
  if(typeof syncOutView === 'function') syncOutView(); // v4.30.0：恢复结果后同步刷新视图切换条
}
function promptResumeTask(){
  try{
    const raw = localStorage.getItem(LS_TASK);
    if(!raw) return;
    const s = JSON.parse(raw);
    const has = (s.work && (s.work.src||s.work.dst||s.work.out)) || (s.trans && (s.trans.src||s.trans.out)) || (s.files && (s.files.src||s.files.dst||s.files.tsSrc));
    if(!has) return;
    const fname = ((s.files && (s.files.src||s.files.tsSrc||s.files.dst)) || {}).fileName || '';
    modal('继续上次任务？', [
      '<div style="font-size:13px;color:var(--tx2);line-height:1.9">检测到上次未完成的任务（' + new Date(s.t).toLocaleString('zh-CN') + '）。<br>· 文件：' + (fname ? '<b>' + esc(fname) + '</b>' : '无') + '<br>· 文本与输出已自动保存，可直接继续，无需重新上传扫描。</div>',
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn pri" id="resume-yes">✅ 恢复上次任务</button><button class="btn gray" id="resume-no">忽略，重新开始</button></div>'
    ].join(''));
    $('#resume-yes').onclick = () => { restoreTask(s); closeModal(); toast('已恢复上次任务'); };
    $('#resume-no').onclick = () => { localStorage.removeItem(LS_TASK); closeModal(); };
  }catch(e){}
}

/* ═══════════ 3.1 文档模式：从校对输出中提取"修订后译文"段 ═══════════ */
function extractProofText(mdText){
  const t = String(mdText || '');
  // 匹配 "## 一、修订后译文"（兼容：## 修订后译文 / ## 一. 修订后译文 / ### 修订后译文）
  const m = t.match(/(?:^|\n)#{2,3}\s*[一二三四五六1-9]?[、.．]?\s*修订后译文[^\n]*\n([\s\S]*?)(?=\n#{2,3}\s|\n*$)/);
  if(m) return m[1].trim();
  // 兜底：精修模式可能输出"## 终稿"/"## 定稿"
  const m2 = t.match(/(?:^|\n)#{2,3}\s*[^\n]*(终稿|定稿|修订稿)[^\n]*\n([\s\S]*?)(?=\n#{2,3}\s|\n*$)/);
  if(m2) return m2[2].trim();
  return null;
}

/* ═══════════ 3.1 文档模式：docx 解包回写引擎（图片零接触） ═══════════
   原理：docx = zip 包；word/document.xml 是内容，word/media/ 是图片。
   只把"修订后译文"写回各段落的文字节点（w:t），图片节点（w:drawing）
   与样式属性完全不碰 → 图片原位保留、字号/加粗/字体等格式不变。 */