/* ── S2 分层审校视图（复用 v4.50 逐句评分数据，零 LLM 调用）── */
(function(){
  'use strict';
  var LS = 'tp.sentence';
  function layeredData(){
    var raw = load(LS, null);
    if(!raw) return null;
    var j = raw;
    if(typeof raw === 'string'){ try{ j = JSON.parse(raw); }catch(e){ return null; } }
    if(!j || !Array.isArray(j.items) || !j.items.length) return null;
    var items = j.items.filter(function(it){ return it && typeof it.score === 'number' && it.score > 0 && typeof it.seg === 'string' && it.seg.trim(); });
    return items.length ? items : null;
  }
  function badge(s){
    var c = s <= 2 ? '#d64550' : (s === 3 ? '#d99a1f' : '#2e9e5b');
    return '<span style="display:inline-block;min-width:18px;text-align:center;padding:0 5px;border-radius:3px;color:#fff;background:' + c + ';font-weight:600;font-size:11px">' + s + '</span>';
  }
  function addToHard(it){
    if(typeof HARD_ITEMS === 'undefined' || !Array.isArray(HARD_ITEMS)) HARD_ITEMS = [];
    if(!HARD_ITEMS.some(function(h){ return h && h.seg === it.seg; })){
      HARD_ITEMS.push({ seg: it.seg, reason: it.comment || '' });
    }
  }
  function rowHtml(it, gi, allowAdd){
    var comment = it.comment ? '<div style="font-size:12px;color:var(--tx2);margin:3px 0 0 24px">' + esc(it.comment) + '</div>' : '';
    var btn = allowAdd ? '<button class="btn gray sm lr-add" data-gi="' + gi + '" style="margin-left:24px;margin-top:3px">📌 加入疑问清单</button>' : '';
    return '<div style="padding:5px 0;border-bottom:1px solid var(--bd)">' + badge(it.score) + '<span style="margin-left:6px;font-size:13px;color:var(--tx1)">' + esc(it.seg) + '</span>' + comment + btn + '</div>';
  }
  function layeredRun(){
    var items = layeredData();
    if(!items){ toast('先点「🎯 逐句评分」跑一遍，再来看分层审校', 'w'); return; }
    var red = [], yellow = [], green = [];
    items.forEach(function(it, gi){
      if(it.score <= 2) red.push({ it: it, gi: gi });
      else if(it.score === 3) yellow.push({ it: it, gi: gi });
      else green.push({ it: it, gi: gi });
    });
    var greenN = green.length ? Math.max(1, Math.round(green.length * 0.2)) : 0;
    var arr = green.slice();
    for(var i = arr.length - 1; i > 0; i--){ var k = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[k]; arr[k] = t; }
    var greenSample = arr.slice(0, greenN);
    var advice = red.length ? '优先人工过红档（必看）' : (yellow.length ? '重点留意黄档' : '整体把握度高，可抽样复核');
    var head = '<div class="alert ' + (red.length ? 'w' : 'ok') + '" style="margin-bottom:10px">🔴 红 ' + red.length + ' · 🟡 黄 ' + yellow.length + ' · 🟢 绿 ' + green.length + ' —— ' + advice + '</div>';
    var sec = function(title, sub, list, allowAdd, sampled){
      var rows = list.length ? list.map(function(x){ return rowHtml(x.it, x.gi, allowAdd); }).join('') : '<div style="font-size:12.5px;color:var(--tx3)">（无）</div>';
      var note = sampled ? '<span style="font-size:11.5px;color:var(--tx3)">（抽样展示 ' + list.length + ' / 共 ' + green.length + ' 句）</span>' : '';
      return '<div style="margin-top:10px"><b style="font-size:13px">' + title + '</b> <span style="font-size:12px;color:var(--tx2)">' + sub + '</span> ' + note + '<div style="margin-top:4px">' + rows + '</div></div>';
    };
    var batch = red.length ? '<button class="btn gray sm" id="lr-add-all" style="margin-bottom:6px">📌 全部红档加入疑问清单（' + red.length + ' 条）</button>' : '';
    var body = batch + sec('🔴 红档（1–2 分 · 必看）', '', red, true, false) + sec('🟡 黄档（3 分 · 留意）', '', yellow, true, false) + sec('🟢 绿档（4–5 分 · 抽样）', '', greenSample, false, true);
    modal('📊 分层审校（零调用 · 复用评分数据）', head + body + '<div class="hint" style="margin-top:10px">按逐句评分结果分层，绿档随机抽 20% 展示。「加入疑问清单」进 T-018 疑问清单，可导出问作者。</div>');
    var allBtn = $('#lr-add-all');
    if(allBtn) allBtn.onclick = function(){ red.forEach(function(x){ addToHard(x.it); }); toast('已加入 ' + red.length + ' 条红档到疑问清单', 'ok'); };
    $$('#mBody .lr-add').forEach(function(b){
      b.onclick = function(){ var gi = parseInt(b.getAttribute('data-gi'), 10); var it = items[gi]; if(it){ addToHard(it); b.disabled = true; b.textContent = '✓ 已加入'; } };
    });
  }
  var _bl = document.getElementById('btn-layered');
  if(_bl) _bl.onclick = layeredRun;
  window.layeredRun = layeredRun;
})();
