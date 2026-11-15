/* ── T-027 逐句评分 → 重写指令（手动触发，绝不自动烧 token）── */
(function(){
  'use strict';
  var NL = String.fromCharCode(10);
  var SCORE_LS = 'tp.sentence';
  var SCORE_ITEMS = [];
  var SCORE_REV = '';

  var SCORE_SYS = '你是资深译校评审。给【译文】逐句打分（1-5 分：5=精当 4=合格 3=可改进 2=有明显问题 1=错译），每句给不超过 30 字短评。只输出 JSON 数组：[{"idx":1,"score":3,"comment":"短评"}]，不要围栏、不要解释。';
  var REWRITE_SYS = '你是资深译校。按【评语】把【原译】这一句重写得更精当，输出改写后的译文（只输出译文本身，不要引号、不要序号、不要解释）。';

  function revSeg(){
    var re = /(?:^|\n)(#{1,4}\s*[^\n]*(?:修订后译文|修订稿|终稿|定稿)[^\n]*\n)([\s\S]*?)(?=\n#{1,4}\s|$)/;
    var m = LAST_OUT.match(re);
    if(!m) return null;
    return { body: m[2], abs: m.index + m[1].length };
  }

  function scoreSplit(){
    var r = revSeg();
    var body = r ? r.body : LAST_OUT;
    var sents = splitSentences(body);
    var items = [];
    var pos = 0;
    sents.forEach(function(s){
      var i = body.indexOf(s, pos);
      if(i < 0) return;
      items.push({ seg: s, start: i, len: s.length, idx: items.length + 1, score: 0, comment: '' });
      pos = i + s.length;
    });
    return { body: body, items: items, rev: r };
  }

  function parseScoreArr(s){
    var t = String(s || '').trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var a = t.indexOf('['), b = t.lastIndexOf(']');
    if(a >= 0 && b > a) t = t.slice(a, b + 1);
    try{
      var j = JSON.parse(t);
      if(!Array.isArray(j)) return [];
      return j.filter(function(x){ return x && typeof x.idx === 'number' && typeof x.score === 'number'; });
    }catch(e){ return []; }
  }

  function scoreBadge(s){
    var color = s <= 2 ? '#d64550' : (s === 3 ? '#d99a1f' : '#2e9e5b');
    return '<span class="sc-badge" style="display:inline-block;min-width:20px;text-align:center;padding:1px 5px;border-radius:4px;color:#fff;background:' + color + ';font-weight:600;font-size:12px">' + s + '</span>';
  }

  function scoreRender(){
    var rows = SCORE_ITEMS.map(function(it, i){
      var badge = it.score ? scoreBadge(it.score) : '<span style="display:inline-block;min-width:20px;text-align:center;padding:1px 5px;border-radius:4px;background:#999;color:#fff;font-weight:600;font-size:12px">?</span>';
      var comment = it.comment ? '<div style="font-size:12px;color:#666;margin:4px 0 0 26px">' + esc(it.comment) + '</div>' : '';
      return '<div class="sc-row" data-i="' + i + '" style="padding:6px 0;border-bottom:1px solid #eee">' +
        badge + '<span style="margin-left:6px;font-size:13px">' + esc(it.seg) + '</span>' +
        comment +
        '<button class="btn gray sm sc-apply" style="margin-left:26px;margin-top:2px">✏️ 应用重写</button>' +
      '</div>';
    }).join('');
    var html = '<div class="alert i" style="margin-bottom:10px">逐句评分：红=1-2 分 · 黄=3 分 · 绿=4-5 分。点「应用重写」= 单句重写并写回译文（一次调用重写一句，不自动续跑）。</div>' +
      '<div id="sc-list" style="max-height:55vh;overflow:auto">' + (rows || '<div class="alert w">没有可评分的句子</div>') + '</div>' +
      '<div style="margin-top:12px"><button class="btn gray sm" id="sc-close">关闭</button></div>';
    modal('🎯 逐句评分', html);
    var list = document.getElementById('sc-list');
    if(list){
      list.querySelectorAll('.sc-apply').forEach(function(b){
        b.onclick = function(){
          var row = b.closest('.sc-row'); if(!row) return;
          scoreApplyOne(+row.getAttribute('data-i'), b);
        };
      });
    }
    var cl = document.getElementById('sc-close');
    if(cl) cl.onclick = function(){ if(typeof closeModal === 'function') closeModal(); };
  }

  function scorePersist(){
    try{ save(SCORE_LS, JSON.stringify({ rev: SCORE_REV, items: SCORE_ITEMS })); }catch(e){}
  }

  async function scoreRun(btn){
    if(!CFG.apiKey){ toast('请先在设置里填模型 Key', 'w'); return; }
    var sp = scoreSplit();
    if(!sp.items.length){ toast('译文为空或没有可分句', 'w'); return; }
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = '评分中…';
    try{
      var r = await callModelSimple(SCORE_SYS, '【译文】' + NL + sp.body, 2000);
      var arr = parseScoreArr(r.text);
      arr.forEach(function(a){
        var it = sp.items[a.idx - 1];
        if(it){ it.score = a.score; it.comment = a.comment; }
      });
      SCORE_ITEMS = sp.items; SCORE_REV = sp.body;
      scorePersist(); scoreRender();
    }catch(e){
      toast('评分失败：' + errMsg(e), 'e');
    }finally{
      btn.disabled = false; btn.textContent = old;
    }
  }

  async function scoreApplyOne(i, btn){
    var it = SCORE_ITEMS[i]; if(!it) return;
    var ag = (typeof approvedGloss === 'function') ? approvedGloss() : [];
    var terms = ag.slice(0, 20).map(function(t){ return t.foreign + ' → ' + t.zh; }).join('、');
    var user = '【原译】' + it.seg + NL + '【评语】' + (it.comment || '表达可再精炼些');
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = '重写中…';
    try{
      var r = await callModelSimple(REWRITE_SYS + (terms ? NL + '【术语】' + terms : ''), user, 800);
      var nv = String(r.text || '').trim();
      nv = nv.replace(/^["'\u201c]/,'').replace(/["'\u201d]$/,'').trim();
      if(!nv){ toast('重写结果为空，已保留原句', 'w'); return; }
      var r2 = revSeg();
      var abs = r2 ? r2.abs : 0;
      LAST_OUT = LAST_OUT.slice(0, abs + it.start) + nv + LAST_OUT.slice(abs + it.start + it.len);
      it.seg = nv; it.len = nv.length; it.score = 0; it.comment = '';
      saveTask();
      var out = document.getElementById('out');
      if(out) out.innerHTML = md(LAST_OUT);
      collapseSections(); markErrorLines(); renderAuditControls(); paintErrFixSpans();
      scorePersist();
      toast('已写回第 ' + (i + 1) + ' 句');
      scoreRender();
    }catch(e){
      toast('重写失败：' + errMsg(e), 'e');
    }finally{
      btn.disabled = false; btn.textContent = old;
    }
  }

  window.scoreRun = scoreRun;
  window.scoreSplit = scoreSplit;
  window.parseScoreArr = parseScoreArr;
  window.scoreApplyOne = scoreApplyOne;

  function bindScore(){
    var b = document.getElementById('btn-score');
    if(b) b.onclick = function(){ scoreRun(b); };
  }
  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', bindScore); }
  else { bindScore(); }
})();
