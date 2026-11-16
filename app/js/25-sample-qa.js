/* ── T-021 抽样质检（手动触发，一次调用，省 token）── */
(function(){
  'use strict';
  var NL = String.fromCharCode(10);
  var SQA_LS = 'tp.sampleqa';

  var SQA_SYS = '你是资深翻译质检员。下面是抽样出来的句子对（原文 + 译文）。逐句核查是否存在漏译、误译、术语不一致三类硬伤。只输出 JSON 数组：[{"idx":1,"verdict":"ok","reason":""}]，verdict 为 ok 或 bad；bad 时 reason 不超过 30 字，ok 时 reason 留空。不要围栏、不要解释。';

  function sqaSave(d){ try{ localStorage.setItem(SQA_LS, JSON.stringify(d)); }catch(e){} }
  function sqaLoad(){ try{ return JSON.parse(localStorage.getItem(SQA_LS) || 'null'); }catch(e){ return null; } }

  // 抽样索引：<50 全查；否则 10%（5~30 夹取），按步长取、去重
  function sqaSampleIndices(total){
    total = Math.max(0, total | 0);
    var idx = [];
    if(total < 50){ for(var i = 0; i < total; i++) idx.push(i); return idx; }
    var n = Math.round(total * 0.1);
    if(n < 5) n = 5; if(n > 30) n = 30;
    var step = total / n;
    for(var k = 0; k < n; k++){ var i = Math.floor(k * step); if(idx.indexOf(i) < 0) idx.push(i); }
    return idx;
  }

  // 解析：剥围栏（无正则反斜杠）+ 坏行跳过
  function sqaParse(raw){
    var t = String(raw || '').trim();
    var lines = t.split(NL);
    if(lines.length && lines[0].indexOf('```') === 0) lines.shift();
    if(lines.length && lines[lines.length - 1].trim() === '```') lines.pop();
    t = lines.join(NL).trim();
    var a = t.indexOf('['), b = t.lastIndexOf(']');
    if(a >= 0 && b > a) t = t.slice(a, b + 1);
    try{ var j = JSON.parse(t); return Array.isArray(j) ? j : []; }catch(e){}
    // 逐行兜底：坏行跳过，好行尽量救回
    var out = [];
    var inner = t.slice(1, -1);
    var parts = inner.split('}');
    for(var k = 0; k < parts.length; k++){
      var frag = parts[k].trim().replace(/^,/,'').trim();
      if(!frag) continue;
      var s0 = frag.indexOf('{');
      if(s0 < 0) continue;
      var objStr = frag.slice(s0) + '}';
      try{ out.push(JSON.parse(objStr)); }catch(e2){}
    }
    return out;
  }

  function sqaRevText(){ return (typeof reportRevisedText === 'function') ? reportRevisedText(LAST_OUT) : LAST_OUT; }

  function sqaBuildUser(srcSents, dstSents, idxs){
    var lines = [];
    for(var k = 0; k < idxs.length; k++){
      var i = idxs[k];
      lines.push('第' + (i + 1) + '对 原文：' + (srcSents[i] || '（无）'));
      lines.push('第' + (i + 1) + '对 译文：' + (dstSents[i] || '（无）'));
    }
    return lines.join(NL);
  }

  function sqaMarkdown(d){
    var L = [];
    L.push('# 抽样质检报告');
    L.push('');
    L.push('| 项目 | 内容 |');
    L.push('|---|---|');
    L.push('| 抽样句数 | ' + d.sampled + ' / ' + d.total + ' 句 |');
    L.push('| 错误率 | ' + d.rate + '%（' + d.bad + ' 处问题） |');
    L.push('| 结论 | ' + d.advice + ' |');
    L.push('');
    L.push('## 问题句');
    L.push('');
    if(d.badList.length){
      for(var i = 0; i < d.badList.length; i++){
        var it = d.badList[i];
        L.push('- 第 ' + it.idx + ' 句：' + it.reason);
        L.push('  - 原文：' + it.src);
        L.push('  - 译文：' + it.dst);
      }
    } else {
      L.push('（无）');
    }
    L.push('');
    L.push('*本报告由 TransProof 抽样质检生成 · https://transproof.pages.dev · v' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '') + '*');
    return L.join(NL);
  }

  async function sqaRun(btn){
    if(!LAST_OUT){ toast('还没有校对结果。先跑一次校对，再抽样质检', 'w'); return; }
    var rev = sqaRevText();
    var src = ($('#src') && $('#src').value) ? $('#src').value.trim() : '';
    var dstSents = splitSentences(rev);
    var srcSents = splitSentences(src);
    if(!dstSents.length){ toast('译文为空或没有可分句', 'w'); return; }
    var idxs = sqaSampleIndices(dstSents.length);
    if(!idxs.length){ toast('没有可抽样的句子', 'w'); return; }
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = '抽样中…';
    try{
      var user = '下面是从一篇译文里抽样出来的 ' + idxs.length + ' 个句子对（全文共 ' + dstSents.length + ' 句），请逐对核查：' + NL + NL + sqaBuildUser(srcSents, dstSents, idxs);
      var r = await callModelSimple(SQA_SYS, user, 2000, undefined, auditOv());
      var arr = sqaParse(r.text);
      var badList = [];
      for(var k = 0; k < arr.length; k++){
        var v = arr[k];
        var idxNum = Number(v && v.idx);
        var i = (idxNum >= 1) ? idxNum - 1 : k;
        if(v && v.verdict === 'bad' && i >= 0 && i < dstSents.length){
          badList.push({ idx: i + 1, reason: String(v.reason || '有问题'), src: srcSents[i] || '', dst: dstSents[i] || '' });
        }
      }
      var bad = badList.length;
      var rate = idxs.length ? Math.round(bad / idxs.length * 1000) / 10 : 0;
      var advice = rate < 2 ? '✅ 可交付（错误率低于 2%）' : '⚠️ 建议全文校对（错误率 ≥ 2%）';
      var d = { total: dstSents.length, sampled: idxs.length, bad: bad, rate: rate, advice: advice, badList: badList, ts: Date.now() };
      sqaSave(d);
      sqaRender(d);
    }catch(e){
      toast('抽样质检失败：' + errMsg(e), 'e');
    }finally{
      btn.disabled = false; btn.textContent = old;
    }
  }

  function sqaRender(d){
    var rows = '';
    if(d.badList.length){
      for(var i = 0; i < d.badList.length; i++){
        var it = d.badList[i];
        rows += '<div style="border-left:3px solid #e55;padding:6px 10px;margin:6px 0;background:var(--bg2);border-radius:0 6px 6px 0;font-size:13px">' +
          '<b style="color:#c33">第 ' + it.idx + ' 句</b> · ' + esc(it.reason) +
          '<div style="color:var(--tx3);font-size:12px;margin-top:3px">原文：' + esc(it.src) + '</div>' +
          '<div style="color:var(--tx3);font-size:12px">译文：' + esc(it.dst) + '</div>' +
          '</div>';
      }
    } else {
      rows = '<div style="color:var(--tx3);font-size:13px;padding:6px 0">（抽样的句子都没发现问题）</div>';
    }
    var md = sqaMarkdown(d);
    modal('🎲 抽样质检报告', [
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;text-align:center">',
      '<div style="flex:1;min-width:110px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:10px"><div style="font-size:11px;color:var(--tx3)">抽样</div><div style="font-size:18px;font-weight:700">' + d.sampled + ' / ' + d.total + ' 句</div></div>',
      '<div style="flex:1;min-width:110px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:10px"><div style="font-size:11px;color:var(--tx3)">错误率</div><div style="font-size:18px;font-weight:700;color:' + (d.rate < 2 ? '#2a7' : '#c33') + '">' + d.rate + '%</div></div>',
      '<div style="flex:2;min-width:150px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:10px"><div style="font-size:11px;color:var(--tx3)">结论</div><div style="font-size:14px;font-weight:700">' + esc(d.advice) + '</div></div>',
      '</div>',
      '<div style="max-height:45vh;overflow:auto;padding-right:4px">' + rows + '</div>',
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">',
      '<button class="btn pri" id="sqa-copy">📋 复制 Markdown</button>',
      '<button class="btn gray" id="sqa-retry">↻ 重试</button>',
      '<button class="btn gray" id="sqa-close">关闭</button>',
      '</div>'
    ].join(''));
    $('#sqa-copy').onclick = function(){ navigator.clipboard.writeText(md).then(function(){ toast('已复制抽样质检报告'); }).catch(function(){ toast('复制失败，请手动选中', 'e'); }); };
    $('#sqa-close').onclick = closeModal;
    $('#sqa-retry').onclick = function(){ closeModal(); sqaRun($('#btn-sample')); };
  }

  window.sqaRun = sqaRun;
  window.sqaSampleIndices = sqaSampleIndices;
  window.sqaParse = sqaParse;

  var b = document.getElementById('btn-sample');
  if(b) b.onclick = sqaRun;
})();
