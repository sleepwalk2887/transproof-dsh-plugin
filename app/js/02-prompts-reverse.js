/* ═══════════ 页面切换 ═══════════ */
$$('nav button').forEach(b => b.onclick = () => {
  $$('nav button').forEach(x => x.classList.remove('on'));
  $$('.page').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  $('#' + b.dataset.page).classList.add('on');
  if(b.dataset.page === 'p-term') renderTerms();
  if(b.dataset.page === 'p-set') renderDataStat();
  if(b.dataset.page === 'p-gloss') renderGloss();
});

/* ═══════════════════════════════════════════════════════════════
   v4.0 Prompt 库 · 翻译风格指令库
   4 种入口：上传真人文章 / 粘贴译者后记 / 手写 / 从术语库提炼
   反推结果先预览再入库；评分学习排序
   ═══════════════════════════════════════════════════════════════ */
function renderPrompts(){
  const q = ($('#pm-q')?.value || '').toLowerCase().trim();
  const list = PROMPTS.prompts.filter(p =>
    !q || (p.name + ' ' + (p.styleTags||[]).join(' ') + ' ' + (p.source||'') + ' ' + (p.core||'')).toLowerCase().includes(q)
  );
  list.sort((a,b) => (b.rating||0) - (a.rating||0) || ((b.useCount||0)) - ((a.useCount||0)));
  $('#pm-count').textContent = PROMPTS.prompts.length + ' 条' + (list.length !== PROMPTS.prompts.length ? '（筛选 ' + list.length + '）' : '');
  const tb = $('#pm-table tbody');
  if(!list.length){
    tb.innerHTML = '<tr><td colspan="6"><div class="pm-empty">' + (PROMPTS.prompts.length ? '没有匹配的 Prompt' : 'Prompt 库还是空的——上方选一种方式入库第一条吧') + '</div></td></tr>';
    return;
  }
  tb.innerHTML = list.map(p => {
    const i = PROMPTS.prompts.indexOf(p);
    const tags = (p.styleTags || []).slice(0, 4).map(t => '<span class="g-tag">' + esc(t) + '</span>').join('');
    const rating = Math.round(p.rating || 0);
    const stars = [1,2,3,4,5].map(n => '<span data-idx="' + i + '" data-v="' + n + '" class="' + (n <= rating ? 'on' : '') + '">★</span>').join('');
    const srcLabel = { 'from-original':'原文反推', 'from-translation':'真人文章', 'from-postscript':'译者后记', 'manual':'手写', 'from-terms':'术语库提炼' }[p.source] || p.source || '—';
    return '<tr>' +
      '<td><b>' + esc(p.name) + '</b><div class="g-src">' + esc(srcLabel) + ' · ' + esc((p.sourceFile||'').slice(0,18)) + '</div></td>' +
      '<td>' + (tags || '<span style="color:var(--tx3)">—</span>') + '</td>' +
      '<td>' + (p.useCount||0) + '</td>' +
      '<td><span class="pm-rating" data-i="' + i + '">' + stars + '</span></td>' +
      '<td style="font-size:12px;color:var(--tx2);max-width:280px">' + esc((p.core||'').slice(0,80) + ((p.core||'').length>80?'…':'')) + '</td>' +
      '<td><button class="btn sm" data-edit="' + i + '">查看/编辑</button> <button class="btn gray sm" data-del="' + i + '" style="color:var(--err)">删</button></td>' +
    '</tr>';
  }).join('');
  // 评分点击
  tb.querySelectorAll('.pm-rating span').forEach(s => {
    s.onclick = () => {
      const idx = +s.dataset.idx, v = +s.dataset.v;
      PROMPTS.prompts[idx].rating = v;
      savePrompts(); renderPrompts(); toast('已评 ' + v + ' 星');
    };
  });
  // 编辑/删除
  tb.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openPromptEditor(+b.dataset.edit));
  tb.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const i = +b.dataset.del; if(confirm('删除 Prompt「' + PROMPTS.prompts[i].name + '」？')){
      PROMPTS.prompts.splice(i, 1); savePrompts(); renderPrompts(); tsRenderPromptOptions();
    }
  });
}
$('#pm-q')?.addEventListener('input', renderPrompts);

function openPromptEditor(idx){
  const isNew = idx < 0;
  const p = isNew ? { name:'', source:'manual', styleTags:[], core:'', fullPrompt:'', rating:0, useCount:0 } : PROMPTS.prompts[idx];
  const tagsStr = (p.styleTags || []).join('、');
  modal(isNew ? '新建 Prompt' : '查看 / 编辑 Prompt', [
    '<div class="frow"><div class="wide"><label class="f">名称 *</label><input id="pe-name" value="' + esc(p.name) + '" placeholder="如「钱钟书式学术翻译」"></div></div>',
    '<div class="frow" style="margin-top:10px"><div class="wide"><label class="f">风格标签（用、号分隔）</label><input id="pe-tags" value="' + esc(tagsStr) + '" placeholder="哲学、学术、直译、典雅"></div></div>',
    '<div style="margin-top:10px"><label class="f">核心规则（一句话概括）</label><textarea id="pe-core" rows="2">' + esc(p.core||'') + '</textarea></div>',
    '<div style="margin-top:10px"><label class="f">完整 System Prompt（翻译时实际发给模型的指令，可点击反推结果自动填入后再编辑）</label><textarea id="pe-full" rows="10" style="font-size:12px">' + esc(p.fullPrompt||'') + '</textarea></div>',
    '<div class="alert i" style="margin-top:10px;font-size:12px"><b>评分学习：</b>' + (p.useCount||0) + ' 次使用 · 当前 ' + (p.rating||0) + ' 星。翻译工作台将按评分加权排序同类风格。</div>',
    '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="pe-save">保存</button>' +
      (isNew ? '' : '<button class="btn" id="pe-test">用此 Prompt 翻译示例</button>') +
      '<button class="btn gray sm" id="pe-cancel" style="margin-left:auto">取消</button></div>'
  ].join(''));
  $('#pe-save').onclick = () => {
    const name = $('#pe-name').value.trim();
    if(!name){ toast('请填名称', 'e'); return; }
    const full = $('#pe-full').value.trim();
    if(!full){ toast('完整 Prompt 不能为空', 'e'); return; }
    const obj = {
      id: p.id || newPromptId(),
      name,
      source: p.source || 'manual',
      sourceFile: p.sourceFile || '',
      styleTags: $('#pe-tags').value.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean),
      core: $('#pe-core').value.trim(),
      fullPrompt: full,
      createdAt: p.createdAt || new Date().toISOString().slice(0,10),
      useCount: p.useCount || 0,
      rating: p.rating || 0
    };
    if(isNew) PROMPTS.prompts.push(obj); else PROMPTS.prompts[idx] = obj;
    savePrompts(); renderPrompts(); tsRenderPromptOptions(); closeModal(); toast('已保存');
  };
  $('#pe-cancel').onclick = closeModal;
  if(!isNew) $('#pe-test').onclick = () => { closeModal(); toast('「翻译工作台」将在第 2 步上线后启用此功能'); };
}

/* ── 4 个入口的统一行为 ── */
document.querySelectorAll('.pm-entry [data-act="open"]').forEach(b => {
  b.onclick = () => openPromptSource(b.closest('.pm-entry').dataset.source);
});

function openPromptSource(source){
  if(source === 'from-original'){
    modal('从原文反推', [
      '<div style="font-size:13px;color:var(--tx2);line-height:1.8;margin-bottom:10px"><b>只给原文即可。</b>AI 会分析文本的文体、语域、学科、句式、术语与文化专名特征，反推出「翻译这类文本的注意事项」。<br>· 有参考译文时填「译文」，反推更精准；留空则仅凭原文特征反推。</div>',
      '<div><label class="f">外文原文 *（可粘贴，或点下方上传文件）</label><textarea id="fo-src" rows="7" placeholder="粘入外文原文……"></textarea></div>',
      '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap"><button class="btn sm" id="fo-upload">📂 上传原文文件</button><span id="fo-fileName" style="font-size:12px;color:var(--ok)"></span></div>',
      '<div style="margin-top:10px"><label class="f">参考译文（可选）</label><textarea id="fo-dst" rows="4" placeholder="有现成译文可粘入，反推更准；没有就留空"></textarea></div>',
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="fo-go">反推并预览</button><button class="btn gray" id="fo-cancel">取消</button></div>',
      '<div id="fo-out" style="margin-top:14px"></div>',
      '<input type="file" id="fo-file" accept=".txt,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff" hidden>'
    ].join(''));
    $('#fo-cancel').onclick = closeModal;
    $('#fo-upload').onclick = () => $('#fo-file').click();
    $('#fo-file').onchange = async e => {
      const file = e.target.files[0]; if(!file) return;
      $('#fo-fileName').textContent = '⏳ 解析中…';
      try{
        const data = await parseFile(file, 'src', (msg) => { $('#fo-fileName').textContent = '⏳ ' + msg; });
        $('#fo-src').value = data.fullText || '';
        $('#fo-fileName').textContent = '✅ ' + file.name + '（' + data.chapters.length + ' 章节，' + (data.fullText||'').length + ' 字）';
      }catch(err){ $('#fo-fileName').textContent = '✗ ' + err.message; }
    };
    $('#fo-go').onclick = async () => {
      const foSrc = $('#fo-src').value.trim();
      if(!foSrc){ toast('请粘贴原文或上传原文文件', 'e'); return; }
      const foDst = $('#fo-dst').value.trim();
      $('#fo-out').innerHTML = '<div class="alert w">⏳ 模型正在分析文本特征…</div>';
      try{
        const full = await reverseFromOriginal(foSrc, foDst);
        $('#fo-out').innerHTML = renderReverseResult(full, foSrc, foDst, 'from-original', '');
      }catch(e){ $('#fo-out').innerHTML = '<div class="alert e">反推失败：' + esc(e.message) + '</div>'; }
    };
  }
  else if(source === 'from-translation'){
    modal('上传真人文章反推', [
      '<div style="font-size:13px;color:var(--tx2);line-height:1.8;margin-bottom:10px"><b>两种方式：</b>① 贴一对原文+译文（最快）；② 上传一份已译好的文档（PDF/Word/图片，自动 OCR + 段落配对）。</div>',
      // ── Tab 切换 ──
      '<div style="display:flex;gap:6px;margin-bottom:10px;border-bottom:1px solid var(--bd)">',
      '  <button class="btn sm on" id="pts-tab-text" style="border-radius:8px 8px 0 0">📝 直接贴</button>',
      '  <button class="btn sm" id="pts-tab-file" style="border-radius:8px 8px 0 0">📂 上传文件</button>',
      '</div>',
      // ── 文本模式 ──
      '<div id="pts-pane-text">',
      '  <div><label class="f">外文原文 *</label><textarea id="pts-src" rows="6" placeholder="Hegel opens the Logic with the proposition: \"Pure being and pure nothing are the same.\""></textarea></div>',
      '  <div style="margin-top:10px"><label class="f">对应中文译文 *</label><textarea id="pts-dst" rows="6" placeholder="黑格尔在《逻辑学》开篇提出：\"纯存在与纯无是同一个东西。\""></textarea></div>',
      '</div>',
      // ── 文件模式 ──
      '<div id="pts-pane-file" style="display:none">',
      '  <div class="alert i" style="font-size:12.5px;margin-bottom:10px">',
      '    支持 Word / PDF / 图片。两种用法：<br>',
      '    · <b>一个文件</b>（如双语对照合订 PDF）→ 自动按"外文段+中文段"交替配对<br>',
      '    · <b>两个文件</b>（第一个原文、第二个译文）→ 按段落顺序对应<br>',
      '    扫描件 PDF/图片会调 OCR 识别（首次下载约 10MB 中文模型，需联网）。',
      '  </div>',
      '  <div id="pts-droplist" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">',
      '    <div class="pm-drop" data-slot="src"><div class="pm-drop-title">📄 原文</div><div class="pm-drop-hint">点击或拖入</div><div class="pm-drop-name"></div></div>',
      '    <div class="pm-drop" data-slot="dst"><div class="pm-drop-title">📄 译文</div><div class="pm-drop-hint">点击或拖入</div><div class="pm-drop-name"></div></div>',
      '  </div>',
      '  <div style="font-size:12px;color:var(--tx3);margin-bottom:6px">采样：<b>前 30 对</b> 段落用于反推（足以代表风格，token 经济）。</div>',
      '  <div id="pts-pairs-preview" style="max-height:200px;overflow:auto;border:1px solid var(--bd);border-radius:8px;padding:8px;font-size:12px;background:var(--bg2)"></div>',
      '</div>',
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="pts-go">反推并预览</button><button class="btn gray" id="pts-cancel">取消</button></div>',
      '<div id="pts-out" style="margin-top:14px"></div>',
      '<input type="file" id="pts-file-src" accept=".txt,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff" hidden>',
      '<input type="file" id="pts-file-dst" accept=".txt,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff" hidden>'
    ].join(''));

    // ── Tab 切换 ──
    $('#pts-tab-text').onclick = () => {
      $('#pts-pane-text').style.display = ''; $('#pts-pane-file').style.display = 'none';
      $('#pts-tab-text').classList.add('on'); $('#pts-tab-file').classList.remove('on');
    };
    $('#pts-tab-file').onclick = () => {
      $('#pts-pane-text').style.display = 'none'; $('#pts-pane-file').style.display = '';
      $('#pts-tab-file').classList.add('on'); $('#pts-tab-text').classList.remove('on');
    };

    // ── 拖拽/点击上传 ──
    const __ptsFiles = { src:null, dst:null };
    document.querySelectorAll('#pts-droplist .pm-drop').forEach(box => {
      const slot = box.dataset.slot;
      const inp = $('#pts-file-' + slot);
      const showName = (f) => { box.querySelector('.pm-drop-name').textContent = f ? '✓ ' + f.name : ''; box.classList.toggle('on', !!f); };
      box.onclick = () => inp.click();
      box.ondragover = e => { e.preventDefault(); box.classList.add('drag'); };
      box.ondragleave = () => box.classList.remove('drag');
      box.ondrop = async e => {
        e.preventDefault(); box.classList.remove('drag');
        const f = e.dataTransfer.files[0]; if(!f) return;
        __ptsFiles[slot] = f; showName(f); await __ptsRefreshPreview();
      };
      inp.onchange = async e => {
        const f = e.target.files[0]; if(!f) return;
        __ptsFiles[slot] = f; showName(f); await __ptsRefreshPreview();
      };
    });
    // 双文件冲突时，第二个文件覆盖任意已选 file 输入（保留钩子，便于以后做联动）
    // 拖拽事件已用 showName 闭包处理，无需额外绑定

    // ── 解析+配对+预览 ──
    let __ptsPairs = null; // [{src,dst}]
    async function __ptsRefreshPreview(){
      const pv = $('#pts-pairs-preview');
      pv.innerHTML = '<div style="color:var(--tx3)">⏳ 解析中…</div>';
      try{
        const srcFile = __ptsFiles.src, dstFile = __ptsFiles.dst;
        if(!srcFile){ pv.innerHTML = '<div style="color:var(--tx3)">请上传原文（或上传一个文件做"交替配对"）</div>'; __ptsPairs = null; return; }
        pv.innerHTML = '⏳ 解析 ' + srcFile.name + (dstFile ? ' + ' + dstFile.name : '') + '…';
        let srcText, dstText;
        if(dstFile){
          // 两文件模式：分别解析
          srcText = await __ptsParseToText(srcFile);
          dstText = await __ptsParseToText(dstFile);
        } else {
          // 单文件模式：解析后做交替配对
          const t = await __ptsParseToText(srcFile);
          __ptsPairs = alignAltPairs(t);
          pv.innerHTML = renderPairsPreview(__ptsPairs);
          return;
        }
        __ptsPairs = alignByOrder(srcText, dstText);
        pv.innerHTML = renderPairsPreview(__ptsPairs);
      }catch(err){
        pv.innerHTML = '<div style="color:var(--err)">解析失败：' + esc(errMsg(err)) + '</div>';
        __ptsPairs = null;
      }
    }
    async function __ptsParseToText(file){
      // 复用 P1 parseFile（支持 docx/pdf/图片，自动 OCR）
      const r = await parseFile(file, 'src', (msg, pct) => { $('#pts-pairs-preview').innerHTML = '⏳ ' + msg; });
      return r.fullText || (r.chapters || []).map(c => c.text).join('\n\n');
    }
    function alignAltPairs(text){
      // 按段落切，中文段 + 外文段 视为一对
      const paras = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
        .filter(s => s.length > 12 && !/^[\s\d\.\-—_=·•・,，。,，]+$/.test(s));
      const detect = p => /[一-鿿]/.test(p) ? 'dst' : (/[A-Za-z]/.test(p) ? 'src' : null);
      const pairs = [];
      let pending = null;
      for(const p of paras){
        const cur = detect(p);
        if(!pending){ pending = { is: cur, text: p }; continue; }
        if(pending.is && cur && pending.is !== cur){
          if(pending.is === 'src') pairs.push({ src: pending.text, dst: p });
          else pairs.push({ src: p, dst: pending.text });
          pending = null;
        } else if(pending.is === cur) {
          // 同语言连续 → 合并
          pending.text += '\n' + p;
        } else {
          // 当前无法识别（含数字/纯标点），跳过
        }
      }
      return pairs.slice(0, 30);
    }
    function alignByOrder(srcText, dstText){
      const srcParas = srcText.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 12);
      const dstParas = dstText.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 12);
      const n = Math.min(srcParas.length, dstParas.length, 30);
      const pairs = [];
      for(let i = 0; i < n; i++) pairs.push({ src: srcParas[i], dst: dstParas[i] });
      return pairs;
    }
    function renderPairsPreview(pairs){
      if(!pairs || !pairs.length) return '<div style="color:var(--tx3)">未识别到可配对的段落，请检查文件内容</div>';
      return '<b>' + pairs.length + ' 对预览（送模型前的前 30 对）</b>' + pairs.slice(0, 6).map((p, i) =>
        '<div style="margin:6px 0;padding:6px;background:var(--bg3);border-radius:6px"><div style="color:var(--ac)">#' + (i+1) + ' 原文</div>' + esc(p.src.slice(0, 80)) + (p.src.length > 80 ? '…' : '') +
        '<div style="color:var(--ok);margin-top:4px">译文</div>' + esc(p.dst.slice(0, 80)) + (p.dst.length > 80 ? '…' : '') + '</div>'
      ).join('') + (pairs.length > 6 ? '<div style="color:var(--tx3);text-align:center;margin-top:6px">…还有 ' + (pairs.length - 6) + ' 对</div>' : '');
    }

    $('#pts-cancel').onclick = closeModal;
    $('#pts-go').onclick = async () => {
      const tab = $('#pts-tab-file').classList.contains('on');
      if(tab){
        if(!__ptsPairs || !__ptsPairs.length){ toast('请先上传文件并确认解析成功', 'e'); return; }
        // 把 30 对合并成"原文 + 译文"两段大文本喂给模型
        const srcText = __ptsPairs.map(p => p.src).join('\n\n');
        const dstText = __ptsPairs.map(p => p.dst).join('\n\n');
        $('#pts-out').innerHTML = '<div class="alert w">⏳ 模型正在分析 ' + __ptsPairs.length + ' 对…</div>';
        try{
          const full = await reverseFromTranslation(srcText, dstText);
          $('#pts-out').innerHTML = renderReverseResult(full, '（上传文件 ' + __ptsPairs.length + ' 对）', '', 'from-translation', '');
        }catch(e){ $('#pts-out').innerHTML = '<div class="alert e">反推失败：' + esc(e.message) + '</div>'; }
      } else {
        const ptsSrc = $('#pts-src').value.trim(), ptsDst = $('#pts-dst').value.trim();
        if(!ptsSrc || !ptsDst){ toast('原文与译文都要填', 'e'); return; }
        $('#pts-out').innerHTML = '<div class="alert w">⏳ 模型正在分析…</div>';
        try{
          const full = await reverseFromTranslation(ptsSrc, ptsDst);
          $('#pts-out').innerHTML = renderReverseResult(full, ptsSrc, ptsDst, 'from-translation', '');
        }catch(e){ $('#pts-out').innerHTML = '<div class="alert e">反推失败：' + esc(e.message) + '</div>'; }
      }
    };
  }
  else if(source === 'from-postscript'){
    modal('粘贴译者后记提炼', [
      '<div style="font-size:13px;color:var(--tx2);line-height:1.8;margin-bottom:10px">贴入已有的「译者后记」「翻译说明」「凡例」等文本，模型提炼其中表达或暗示的翻译方针。</div>',
      '<div><label class="f">译者后记 / 翻译说明 *</label><textarea id="pps-text" rows="10" placeholder="粘入已有内容……"></textarea></div>',
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="pps-go">提炼并预览</button><button class="btn gray" id="pps-cancel">取消</button></div>',
      '<div id="pps-out" style="margin-top:14px"></div>'
    ].join(''));
    $('#pps-cancel').onclick = closeModal;
    $('#pps-go').onclick = async () => {
      const psText = $('#pps-text').value.trim();
      if(!psText){ toast('请粘贴内容', 'e'); return; }
      $('#pps-out').innerHTML = '<div class="alert w">⏳ 模型正在提炼……</div>';
      try{
        const full = await reverseFromPostscript(psText);
        $('#pps-out').innerHTML = renderReverseResult(full, '', psText.slice(0,200), 'from-postscript', '');
      }catch(e){ $('#pps-out').innerHTML = '<div class="alert e">提炼失败：' + esc(e.message) + '</div>'; }
    };
  }
  else if(source === 'manual'){
    openPromptEditor(-1);
  }
  else if(source === 'from-terms'){
    if(!TERMS.length && !GLOSS.terms.length){ toast('术语库/词库都还是空的，先录一些术语再来提炼', 'e'); return; }
    modal('从术语库提炼', [
      '<div style="font-size:13px;color:var(--tx2);line-height:1.8;margin-bottom:10px">基于「术语库 <b>' + TERMS.length + '</b> 条」+「专有译词库 <b>' + GLOSS.terms.length + '</b> 条」提炼一致的翻译方针（译名风格、注释习惯、学科偏好）。</div>',
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="ptm-go">开始提炼</button><button class="btn gray" id="ptm-cancel">取消</button></div>',
      '<div id="ptm-out" style="margin-top:14px"></div>'
    ].join(''));
    $('#ptm-cancel').onclick = closeModal;
    $('#ptm-go').onclick = async () => {
      $('#ptm-out').innerHTML = '<div class="alert w">⏳ 模型正在分析……</div>';
      try{
        const full = await reverseFromTerms();
        $('#ptm-out').innerHTML = renderReverseResult(full, '', '术语库 ' + TERMS.length + ' 条 + 词库 ' + GLOSS.terms.length + ' 条', 'from-terms', '');
      }catch(e){ $('#ptm-out').innerHTML = '<div class="alert e">提炼失败：' + esc(e.message) + '</div>'; }
    };
  }
}

/* ── 反推核心：3 种 AI 反推 + 1 种纯本地（从术语库） ── */
async function reverseFromTranslation(src, dst){
  const sys = '你是一位翻译风格分析师。给我一对【原文+译文】，分析译者实际遵循的翻译方针（人名处理、注释风格、句长偏好、直译意译倾向、术语口径、文化专名处理等）。输出严格按 JSON：{"name":"建议的名称","styleTags":["风格1","风格2"],"core":"一句话核心规则","fullPrompt":"完整的 system prompt（写给未来翻译模型使用，包含具体规则与示例）"}。只输出 JSON，不解释。';
  const user = '【原文】\n' + src.slice(0,3000) + '\n\n【译文】\n' + dst.slice(0,3000);
  const r = await callModelSimple(sys, user, 1500);
  return parseReverseJson(r.text);
}
// 从原文反推（译文可选）：有译文走对照分析；无译文仅凭原文特征反推翻译要求
async function reverseFromOriginal(src, dst){
  if(dst && dst.trim()) return await reverseFromTranslation(src, dst);
  const sys = '你是一位翻译风格分析师。下面是待翻译的原文（尚无译文）。请分析这段文本的特征，并从「翻译成中文」的角度反推出翻译这类文本需要注意的要求。分析维度：① 文体与语域（学术/文学/新闻/公文/口译稿等）；② 学科领域与术语倾向；③ 句式特点（长句/短句、从句、修辞）；④ 文化专名与典故的密度与处理方式；⑤ 作者语气与风格；⑥ 中文表达上容易踩的坑（欧化句式、术语统一、专名加原文等）。输出严格按 JSON：{"name":"建议的名称","styleTags":["风格1","风格2"],"core":"一句话核心规则","fullPrompt":"完整的 system prompt（写给未来翻译模型使用，包含具体规则与示例）"}。只输出 JSON，不解释。';
  const user = '【待翻译原文】\n' + src.slice(0,6000) + '\n\n（未提供参考译文，请仅凭原文特征反推翻译要求）';
  const r = await callModelSimple(sys, user, 1500);
  return parseReverseJson(r.text);
}
async function reverseFromPostscript(text){
  const sys = '你是一位翻译风格分析师。从译者后记/翻译说明里抽取实际表达或暗示的翻译方针。输出严格按 JSON：{"name":"建议的名称","styleTags":[...],"core":"一句话核心规则","fullPrompt":"完整 system prompt"}。只输出 JSON。';
  const user = '【译者后记】\n' + text.slice(0,4000);
  const r = await callModelSimple(sys, user, 1500);
  return parseReverseJson(r.text);
}
async function reverseFromTerms(){
  // 不调模型，本地分析即可，避免无谓花费
  const sample = TERMS.slice(0, 60).map(t => t.src + ' → ' + t.dst + (t.cat ? ' [' + t.cat + ']' : '') + (t.note ? ' ' + t.note : '')).join('\n');
  // M4（T-012）：只注入已批准词条 —— 走 approvedGloss() 唯一闸门（09-gloss.js 定义），本文件加载早于 09，需守卫
  const gApproved = (typeof approvedGloss === 'function') ? approvedGloss() : GLOSS.terms.filter(t => t && t.status === 'confirmed' && t.foreign && t.zh);
  const glossSample = gApproved.slice(0, 60).map(t => t.foreign + ' → ' + t.zh + (t.type ? ' [' + t.type + ']' : '') + ((t.tags||[]).length ? ' ' + t.tags.join('、') : '')).join('\n');
  const cats = {}; TERMS.forEach(t => { if(t.cat) cats[t.cat] = (cats[t.cat]||0) + 1; });
  const catList = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v]) => k + ':' + v).join('、');
  const core = '严格按已固化术语库（' + TERMS.length + ' 条）与专有译词库（' + gApproved.length + ' 条 · 仅已批准）译名输出，类别偏好：' + (catList || '无') + '。同一外文术语全书保持一致译法，类别敏感词不得擅自调整。';
  const full = '你是一位严格遵循既定术语表的翻译家。\n\n【翻译准则】\n1. 凡是术语库中已收录的词条，必须严格采用库中的译法，不得使用任何变体。\n2. 凡是专有译词库中已确认（confirmed）的词条，同样严格执行。\n3. 首次出现的专名建议按库中已有同类型条目（如 ' + (catList || '其他') + '）的命名习惯。\n4. 不擅自增删译注。\n\n【本次翻译的参考术语（节选）】\n' + (sample || '（术语库为空）') + '\n\n【本次翻译的专有译词（节选）】\n' + (glossSample || '（词库为空）');
  return {
    name: '从术语库自动提炼（' + (catList || '多领域') + '）',
    styleTags: catList ? catList.split('、').slice(0,4) : ['术语一致'],
    core,
    fullPrompt: full
  };
}
function parseReverseJson(text){
  // 容忍模型偶尔前后加 echo / 三反引号
  let s = String(text||'').replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
  let m = s.match(/\{[\s\S]*\}/);
  if(m) s = m[0];
  try{
    const j = JSON.parse(s);
    return {
      name: j.name || '未命名 Prompt',
      styleTags: Array.isArray(j.styleTags) ? j.styleTags : [],
      core: j.core || '',
      fullPrompt: j.fullPrompt || s
    };
  }catch(_){
    // 解析失败 → 整段当 fullPrompt，让用户手动命名
    return { name: '未命名 Prompt', styleTags: [], core: '（模型未按 JSON 输出，请手动补 name 与 core）', fullPrompt: text };
  }
}

function renderReverseResult(p, srcLabel, dstLabel, source, sourceFile){
  // 先把 HTML 渲染出来，再用 setTimeout 绑事件（必须在 DOM 出现之后）
  const html = [
    '<div class="alert i"><b>反推完成，先预览再决定是否入库</b></div>',
    '<div class="frow"><div class="wide"><label class="f">Prompt 名称 *</label><input id="rev-name" value="' + esc(p.name) + '"></div></div>',
    '<div class="frow" style="margin-top:8px"><div class="wide"><label class="f">风格标签（用、号分隔）</label><input id="rev-tags" value="' + esc((p.styleTags||[]).join('、')) + '"></div></div>',
    '<div style="margin-top:8px"><label class="f">核心规则（一句话）</label><textarea id="rev-core" rows="2">' + esc(p.core||'') + '</textarea></div>',
    '<div style="margin-top:8px"><label class="f">完整 System Prompt（可编辑后再保存）</label><textarea id="rev-full" rows="10" style="font-size:12px">' + esc(p.fullPrompt||'') + '</textarea></div>',
    '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="rev-save">✓ 入库</button><button class="btn gray" id="rev-discard">放弃</button></div>'
  ].join('');
  setTimeout(() => {
    const sBtn = $('#rev-save'); if(!sBtn) return;
    sBtn.onclick = () => {
      const obj = {
        id: newPromptId(), name: $('#rev-name').value.trim() || '未命名 Prompt',
        source, sourceFile, sourceLabel: srcLabel.slice(0,30),
        styleTags: $('#rev-tags').value.split(/[、,，\s]+/).map(s=>s.trim()).filter(Boolean),
        core: $('#rev-core').value.trim(),
        fullPrompt: $('#rev-full').value.trim(),
        createdAt: new Date().toISOString().slice(0,10), useCount: 0, rating: 0
      };
      PROMPTS.prompts.push(obj); savePrompts(); renderPrompts(); closeModal();
      toast('✓ 已入库：' + obj.name);
    };
    const dBtn = $('#rev-discard'); if(dBtn) dBtn.onclick = closeModal;
  }, 50);
  return html;
}

/* ── 简单非流式模型调用（用于反推，避免中间态闪烁） ── */
async function callModelSimple(sys, user, maxTok, extSignal){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (CFG.timeout || 180) * 1000);
  /* v4.34.0：支持外部中断信号——三段流水线「中断/关闭」立即掐断，不再干等超时 */
  if(extSignal){ if(extSignal.aborted) ctrl.abort(); else extSignal.addEventListener('abort', () => ctrl.abort(), { once:true }); }
  try{
    const r = await fetch(CFG.baseUrl.replace(/\/+$/,'') + '/chat/completions', {
      method:'POST', signal: ctrl.signal,
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + CFG.apiKey },
      body: JSON.stringify({ model: CFG.model, messages:[{role:'system',content:sys},{role:'user',content:user}], temperature:0.4, max_tokens:maxTok||1500, stream:false })
    });
    if(!r.ok){ const t = await r.text(); throw new Error('HTTP ' + r.status + ' — ' + t.slice(0,200)); }
    const j = await r.json();
    return { text: j.choices?.[0]?.message?.content || '' };
  } finally { clearTimeout(timer); }
}

/* ── 导出/导入 JSON ── */
$('#pm-export').onclick = () => {
  if(!PROMPTS.prompts.length){ toast('Prompt 库是空的', 'e'); return; }
  dl('Prompt库_' + today() + '.json', JSON.stringify(PROMPTS, null, 2), 'application/json');
  toast('已导出 ' + PROMPTS.prompts.length + ' 条');
};
$('#pm-import').onclick = () => $('#pm-file').click();
$('#pm-file').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try{
      const j = JSON.parse(rd.result);
      const arr = Array.isArray(j) ? j : (Array.isArray(j.prompts) ? j.prompts : []);
      if(!arr.length){ toast('文件里没有 Prompt 条目', 'e'); return; }
      // 按 name 去重合并
      let added = 0, updated = 0;
      arr.forEach(p => {
        const ex = PROMPTS.prompts.find(x => x.name === p.name);
        if(ex){ Object.assign(ex, p); updated++; }
        else { PROMPTS.prompts.push(Object.assign({ id:newPromptId(), useCount:0, rating:0, createdAt:new Date().toISOString().slice(0,10) }, p)); added++; }
      });
      savePrompts(); renderPrompts(); tsRenderPromptOptions();
      toast('导入完成：新增 ' + added + '、更新 ' + updated);
    }catch(err){ toast('导入失败：' + err.message, 'e'); }
  };
  rd.readAsText(f, 'UTF-8'); e.target.value = '';
};

/* ── 云端同步（独立键） ── */
$('#pmCloudUrl').value = CFG.pmCloudUrl || '';
$('#btn-pm-cloud-pull').onclick = async () => {
  const url = $('#pmCloudUrl').value.trim();
  const msg = $('#pmCloudMsg');
  if(!url){ msg.innerHTML = '<span style="color:var(--err)">请先粘贴共享 Prompt 库网址</span>'; return; }
  if(!/^https?:\/\//i.test(url)){ msg.innerHTML = '<span style="color:var(--err)">网址需要以 http(s):// 开头</span>'; return; }
  CFG.pmCloudUrl = url; save(LS.cfg, CFG);
  msg.innerHTML = '<span style="color:var(--tx3)">⏳ 正在拉取……</span>';
  try{
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    const j = JSON.parse(txt);
    const arr = Array.isArray(j) ? j : (Array.isArray(j.prompts) ? j.prompts : []);
    if(!arr.length) throw new Error('云端 Prompt 库是空的或格式不认识');
    let added = 0, updated = 0;
    arr.forEach(p => {
      const ex = PROMPTS.prompts.find(x => x.name === p.name);
      if(ex){ Object.assign(ex, p); updated++; }
      else { PROMPTS.prompts.push(Object.assign({ id:newPromptId(), useCount:0, rating:0, createdAt:new Date().toISOString().slice(0,10) }, p)); added++; }
    });
    savePrompts(); renderPrompts(); tsRenderPromptOptions();
    msg.innerHTML = '<span style="color:var(--ok)">✓ 同步完成（' + new Date().toLocaleTimeString('zh-CN') + '）：云端 ' + arr.length + ' 条 → 新增 ' + added + '、更新 ' + updated + '</span>';
    toast('Prompt 库云端同步完成');
  }catch(err){
    const net = /Failed to fetch|NetworkError/i.test(err.message);
    msg.innerHTML = '<span style="color:var(--err)">✗ 拉取失败：' + esc(net ? '网络不通或该网址不允许跨域读取。建议改用 GitHub Gist Raw 网址，或 GitHub 仓库 + jsDelivr（cdn.jsdelivr.net/gh/…）' : err.message) + '</span>';
  }
};

// 进入页面时刷一次（如果用户从其他页面跳进来数据已变）
setTimeout(renderPrompts, 100);
