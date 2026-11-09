/* ============================================================
   交付质检报告（T-016 · P0 · v4.40.0）
   把已有数据汇总成一张可复制 / 导出的交付报告：
   错误分类（v4.9.0）+ 已修进度（v4.26.0）+ 质量评分（v4.36.0）
   + 三栏段落统计（v4.30.0）+ 校对前 AI 预估（v4.18.0，若跑过）
   纯本地组装，不调 AI、不花 token。
   ============================================================ */
const NL = String.fromCharCode(10);

/* 从校对结果里抽出「一、修订后译文」正文（无正则反斜杠，纯 indexOf 切分） */
function reportRevisedText(outText){
  const t = String(outText || '');
  const lines = t.split(NL);
  let start = -1;
  for(let i = 0; i < lines.length; i++){
    if(lines[i].indexOf('修订后译文') >= 0){ start = i; break; }
  }
  if(start < 0) return t.trim();
  const out = [];
  for(let i = start + 1; i < lines.length; i++){
    if(lines[i].indexOf('## 二') === 0 && lines[i].indexOf('批注') >= 0) break;
    out.push(lines[i]);
  }
  const r = out.join(NL).trim();
  return r || t.trim();
}

/* 汇总数据（纯函数，测试可直接调用） */
function reportBuildData(outText, srcText, fixedDone, fixedTotal){
  const rev = reportRevisedText(outText);
  const src = String(srcText || '');
  const cats = (typeof parseErrorCategories === 'function') ? parseErrorCategories(outText) : {};
  const catRows = Object.keys(cats).sort(function(a, b){ return cats[b] - cats[a]; });
  const totalAnn = catRows.reduce(function(a, k){ return a + cats[k]; }, 0);
  let q = null;
  if(typeof qualityScore === 'function' && src.trim() && rev.trim()){
    q = qualityScore(src, rev);
  }
  const srcParas = (typeof triSplitParas === 'function') ? triSplitParas(src).length : 0;
  const dstParas = (typeof triSplitParas === 'function') ? triSplitParas(rev).length : 0;
  const taskName = (typeof currentTask === 'function' && currentTask()) ? currentTask().name : '未挂接任务';
  const aiEst = (window.TP_EST && Number(window.TP_EST.score)) ? window.TP_EST : null;
  return {
    rev: rev, src: src, cats: cats, catRows: catRows, totalAnn: totalAnn, q: q,
    srcParas: srcParas, dstParas: dstParas, taskName: taskName, aiEst: aiEst,
    fixedDone: Number(fixedDone) || 0, fixedTotal: Number(fixedTotal) || 0,
    ts: new Date()
  };
}

/* 组装 Markdown 报告 */
function reportMarkdown(d){
  const L = [];
  L.push('# 交付质检报告');
  L.push('');
  L.push('| 项目 | 内容 |');
  L.push('|---|---|');
  L.push('| 任务 | ' + d.taskName + ' |');
  L.push('| 生成时间 | ' + d.ts.getFullYear() + '-' + String(d.ts.getMonth()+1).padStart(2,'0') + '-' + String(d.ts.getDate()).padStart(2,'0') + ' ' + String(d.ts.getHours()).padStart(2,'0') + ':' + String(d.ts.getMinutes()).padStart(2,'0') + ' |');
  L.push('| 原文规模 | ' + d.srcParas + ' 段 / ' + d.src.length + ' 字 |');
  L.push('| 译文规模 | ' + d.dstParas + ' 段 / ' + d.rev.length + ' 字 |');
  L.push('');
  if(d.q && d.q.ok){
    L.push('## 质量评分');
    L.push('');
    L.push('**' + d.q.score + ' 分（' + d.q.level + '）** · 忠实度 ' + d.q.fidelity + '/60 · 流畅度 ' + d.q.fluency + '/40');
    if(d.aiEst){
      L.push('');
      L.push('校对前 AI 预估：' + d.aiEst.score + ' 分（' + d.aiEst.level + '）· 建议阶段 ' + (d.aiEst.suggestStage || '—') + ' · 预计工作量 ' + (d.aiEst.effort || '—'));
    }
    if(d.q.items && d.q.items.length){
      L.push('');
      L.push('### 主要扣分项');
      L.push('');
      d.q.items.slice(0, 5).forEach(function(it){
        L.push('- ' + it.cat + '：' + it.detail + '（-' + it.pen + '）');
      });
    }
    L.push('');
  }
  L.push('## 错误分类');
  L.push('');
  if(d.catRows.length){
    L.push('| 类型 | 条数 |');
    L.push('|---|---|');
    d.catRows.forEach(function(k){ L.push('| ' + k + ' | ' + d.cats[k] + ' |'); });
  }else{
    L.push('未解析到带类型标签的批注。');
  }
  L.push('');
  L.push('## 已修进度');
  L.push('');
  const pct = d.fixedTotal ? Math.round(d.fixedDone * 100 / d.fixedTotal) : 0;
  L.push('批注 ' + d.fixedTotal + ' 条 · 已修 ' + d.fixedDone + ' 条 · 未修 ' + (d.fixedTotal - d.fixedDone) + ' 条（完成 ' + pct + '%）');
  L.push('');
  L.push('## 剩余风险');
  L.push('');
  const risks = [];
  if(d.fixedTotal - d.fixedDone > 0) risks.push('还有 ' + (d.fixedTotal - d.fixedDone) + ' 条批注未标记已修');
  if(d.q && d.q.ok && d.q.items && d.q.items.length){
    d.q.items.slice(0, 5).forEach(function(it){ risks.push(it.cat + '：' + it.detail); });
  }
  if(risks.length){
    risks.forEach(function(r){ L.push('- ' + r); });
  }else{
    L.push('- 本次未发现明显遗留项。');
  }
  L.push('');
  L.push('## 检查覆盖');
  L.push('');
  L.push('- 术语一致（专名体检）· 段落对齐 · 数字格式 · 标点对账 · 翻译腔 · 风格简报 · 错误分类 · 已修/未修流转');
  L.push('- 质量评分 = 忠实度 60 + 流畅度 40，本地计算，不花 token');
  L.push('');
  L.push('---');
  L.push('');
  L.push('本报告由 TransProof 生成 · https://transproof.pages.dev · v' + APP_VERSION);
  return L.join(NL);
}

/* 打开交付报告弹窗 */
function deliveryReport(){
  if(!LAST_OUT){ toast('还没有校对结果。先跑一次校对，再生成交付报告', 'w'); return; }
  const src = $('#src') ? $('#src').value.trim() : '';
  const fpLis = Array.from(document.querySelectorAll('#out li[data-fp]')).filter(function(li){ return li.dataset.err; });
  const done = fpLis.filter(function(li){ return AUDIT_FIX[li.dataset.fp]; }).length;
  const d = reportBuildData(LAST_OUT, src, done, fpLis.length);
  const md = reportMarkdown(d);
  modal('📋 交付质检报告', [
    '<div style="max-height:60vh;overflow:auto;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:14px;font-size:13px;line-height:1.7">',
    '<pre style="white-space:pre-wrap;font-family:inherit;margin:0;color:var(--tx1)">' + esc(md) + '</pre>',
    '</div>',
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">',
    '<button class="btn pri" id="rp-copy-md">📋 复制 Markdown</button>',
    '<button class="btn gray" id="rp-copy-txt">复制纯文本</button>',
    '<button class="btn gray" id="rp-close">关闭</button>',
    '</div>'
  ].join(''));
  $('#rp-copy-md').onclick = function(){
    navigator.clipboard.writeText(md).then(function(){ toast('已复制 Markdown 报告'); }).catch(function(){ toast('复制失败，请手动选中', 'e'); });
  };
  $('#rp-copy-txt').onclick = function(){
    navigator.clipboard.writeText(md).then(function(){ toast('已复制报告'); }).catch(function(){ toast('复制失败，请手动选中', 'e'); });
  };
  $('#rp-close').onclick = closeModal;
}

$('#btn-report') && ($('#btn-report').onclick = deliveryReport);
window.deliveryReport = deliveryReport;
window.reportBuildData = reportBuildData;
window.reportMarkdown = reportMarkdown;
window.reportRevisedText = reportRevisedText;
