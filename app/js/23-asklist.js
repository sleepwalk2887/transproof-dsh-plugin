/* ── T-018 疑问清单 · 存疑导出（纯本地聚合，零 token，不调 AI）── */
/* 聚合四类：①疑难句标注（未采纳候选）②决策面板待定夺译法 ③术语库待审 ④专名核验待核验 */
(function(){
  'use strict';
  var NL = String.fromCharCode(10);

  function askHard(){
    if(typeof HARD_ITEMS === 'undefined' || !Array.isArray(HARD_ITEMS)) return [];
    return HARD_ITEMS.filter(function(it){ return it && typeof it.seg === 'string' && it.seg.trim(); });
  }
  function askDecision(){
    if(typeof parseDecisionPoints !== 'function') return [];
    try { return parseDecisionPoints(LAST_OUT); } catch(e){ return []; }
  }
  function askTerms(){
    if(typeof GLOSS === 'undefined' || !GLOSS.terms) return [];
    return GLOSS.terms.filter(function(t){ return t && t.status === 'pending' && t.foreign && !((t.tags||[]).indexOf('专名收集') >= 0); });
  }
  function askNouns(){
    if(typeof GLOSS === 'undefined' || !GLOSS.terms) return [];
    return GLOSS.terms.filter(function(t){ return t && t.status === 'pending' && t.foreign && ((t.tags||[]).indexOf('专名收集') >= 0); });
  }

  function askData(){
    return { hard: askHard(), decision: askDecision(), terms: askTerms(), nouns: askNouns() };
  }

  function askMarkdown(d){
    if(!d) d = askData();
    var appv = (typeof APP_VERSION === 'string') ? APP_VERSION : '';
    var L = [];
    L.push('# 疑问清单 · 存疑导出');
    L.push('');
    L.push('> 生成日期：' + new Date().toISOString().slice(0,10) + ' · TransProof v' + appv + ' · 纯本地聚合，请发作者/审校定夺');
    L.push('');
    L.push('## 一、疑难句（' + d.hard.length + ' 条）');
    if(!d.hard.length){ L.push('（无）'); }
    d.hard.forEach(function(it, i){
      L.push((i+1) + '. 【片段】' + it.seg);
      if(it.type) L.push('   - 类型：' + it.type);
      if(it.why) L.push('   - 存疑：' + it.why);
      if(it.opts && it.opts.length) L.push('   - 候选译法：' + it.opts.map(function(o,k){ return (k === it.rec ? '★' : '') + o; }).join(' ／ '));
    });
    L.push('');
    L.push('## 二、待定夺译法（' + d.decision.length + ' 组）');
    if(!d.decision.length){ L.push('（无）'); }
    d.decision.forEach(function(it, i){
      L.push((i+1) + '. 词条：' + it.term);
      if(it.cands && it.cands.length) L.push('   - 候选：' + it.cands.join(' ／ '));
      if(it.rec) L.push('   - 推荐：' + it.rec);
    });
    L.push('');
    L.push('## 三、术语待审（' + d.terms.length + ' 条）');
    if(!d.terms.length){ L.push('（无）'); }
    d.terms.forEach(function(t, i){
      L.push((i+1) + '. ' + t.foreign + ' → ' + (t.zh || '（未定）') + (t.type ? '（' + t.type + '）' : '') + (t.note ? ' · ' + t.note : ''));
    });
    L.push('');
    L.push('## 四、专名待核验（' + d.nouns.length + ' 条）');
    if(!d.nouns.length){ L.push('（无）'); }
    d.nouns.forEach(function(t, i){
      L.push((i+1) + '. ' + t.foreign + ' → ' + (t.zh || '（未定）') + (t.type ? '（' + t.type + '）' : '') + (t.note ? ' · ' + t.note : ''));
    });
    L.push('');
    var wv = (typeof waiverAll === 'function') ? waiverAll() : [];
    L.push('## 五、豁免登记（' + wv.length + ' 条）');
    if(!wv.length){ L.push('（无）'); }
    wv.forEach(function(w, i){ L.push((i+1) + '. [' + w.type + '] ' + w.key + ' — ' + w.reason + '（' + new Date(w.ts).toISOString().slice(0,10) + '）'); });
    L.push('');
    return L.join(NL);
  }

  function askOpen(){
    var d = askData();
    var total = d.hard.length + d.decision.length + d.terms.length + d.nouns.length;
    var md = askMarkdown(d);
    var html =
      '<div class="alert i" style="margin-bottom:10px">共 <b>' + total + '</b> 条存疑项，分四节。点「复制 Markdown」或「下载 .md」发给作者/审校定夺。</div>' +
      '<pre style="max-height:55vh;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#f7f7f8;border:1px solid #e3e3e6;border-radius:6px;padding:12px;font-size:12px;line-height:1.6">' + esc(md) + '</pre>' +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn pri sm" id="ask-copy">📋 复制 Markdown</button>' +
        '<button class="btn gray sm" id="ask-dl">⬇ 下载 .md</button>' +
        '<button class="btn gray sm" id="ask-close">关闭</button>' +
      '</div>';
    modal('📋 疑问清单 · 存疑导出', html);
    var cp = document.getElementById('ask-copy');
    var dl = document.getElementById('ask-dl');
    var cl = document.getElementById('ask-close');
    if(cp) cp.onclick = function(){
      if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(md).then(function(){ toast('已复制 Markdown'); }, function(){ askFallbackCopy(md); }); }
      else { askFallbackCopy(md); }
    };
    if(dl) dl.onclick = function(){
      var name = '疑问清单-' + new Date().toISOString().slice(0,10) + '.md';
      if(typeof dlBlob === 'function') dlBlob(name, md, 'text/markdown;charset=utf-8');
      else toast('下载函数不可用', 'e');
    };
    if(cl) cl.onclick = function(){ if(typeof closeModal === 'function') closeModal(); };
  }

  function askFallbackCopy(txt){
    try {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('已复制 Markdown');
    } catch(e){ toast('复制失败，请手动选中复制', 'e'); }
  }

  window.askData = askData;
  window.askMarkdown = askMarkdown;
  window.askOpen = askOpen;

  function bindAsk(){
    var b = document.getElementById('btn-ask');
    if(b) b.onclick = askOpen;
  }
  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', bindAsk); }
  else { bindAsk(); }
})();
