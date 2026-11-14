// T-014 定稿快照留痕：每次定稿/导出写一条不可变快照，可列表查看 + 一键回填（v4.49.0）
(function(){
  var LS_SNAP = 'tp.snapshot';
  var SNAP_MAX = 50;
  var NL = String.fromCharCode(10);

  function snapAll(){ try { var a = JSON.parse(localStorage.getItem(LS_SNAP) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function snapSave(list){ try { localStorage.setItem(LS_SNAP, JSON.stringify(list)); } catch(e){} }

  function snapAdd(type, payload){
    var list = snapAll();
    var rev = list.length ? (list[list.length - 1].rev + 1) : 1;
    var parent = list.length ? list[list.length - 1].rev : 0;
    var item = {
      rev: rev,
      parent: parent,
      ts: new Date().toISOString(),
      actor: 'user',
      type: type || 'other',
      payload: String(payload || '').slice(0, 50000)
    };
    list.push(item);
    if(list.length > SNAP_MAX) list = list.slice(list.length - SNAP_MAX);
    snapSave(list);
    return item;
  }

  // 回填：把快照 payload 恢复到结果区（等价 setResult）
  function snapRestore(rev){
    var list = snapAll();
    var item = null;
    for(var i = 0; i < list.length; i++){ if(list[i].rev === rev) item = list[i]; }
    if(!item){ toast('快照 #' + rev + ' 不存在', 'e'); return false; }
    if(typeof LAST_OUT !== 'undefined'){
      LAST_OUT = item.payload;
      var out = $('#out');
      if(out){ out.innerHTML = (typeof md === 'function') ? md(LAST_OUT) : LAST_OUT; }
      if(typeof collapseSections === 'function') collapseSections();
      if(typeof markErrorLines === 'function') markErrorLines();
      if(typeof renderAuditControls === 'function') renderAuditControls();
      if(typeof paintErrFixSpans === 'function') paintErrFixSpans();
    }
    if(typeof saveTask === 'function') saveTask();
    toast('已回填快照 #' + rev, 'ok');
    return true;
  }

  var TYPE_LABEL = { 'export-md': '导出 Markdown', 'export-docx': '导出 Word', 'copy': '复制结果', 'finalize': '定稿', 'other': '其他' };

  function snapOpen(){
    var list = snapAll();
    var html = '';
    if(!list.length){
      html = '<div class="empty">还没有快照。点「复制结果 / 导出 Markdown / 下载文档」时会自动留一条痕。</div>';
    } else {
      html = '<div style="max-height:58vh;overflow:auto">';
      for(var i = list.length - 1; i >= 0; i--){
        var s = list[i];
        var dt = String(s.ts || '').replace('T', ' ').slice(0, 19);
        var label = TYPE_LABEL[s.type] || s.type;
        var preview = String(s.payload || '').slice(0, 60);
        html += '<div style="border-bottom:1px solid #eee;padding:8px 0;display:flex;justify-content:space-between;align-items:center;gap:8px">' +
          '<div style="flex:1;min-width:0">' +
          '<b>#' + s.rev + '</b> <span style="color:#888;font-size:12px">' + esc(label) + ' · ' + esc(dt) + '</span>' +
          '<div style="font-size:12px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(preview) + '</div></div>' +
          '<button class="btn sm" data-snap-restore="' + s.rev + '">回填</button></div>';
      }
      html += '</div>';
    }
    modal('📸 定稿快照', html);
    var btns = document.querySelectorAll('[data-snap-restore]');
    for(var j = 0; j < btns.length; j++){
      btns[j].onclick = function(){
        var r = +this.getAttribute('data-snap-restore');
        closeModal();
        snapRestore(r);
      };
    }
  }

  // 挂点：追加监听（不动原 onclick）
  function snapWatch(sel, type, payloadFn){
    var el = document.getElementById(sel);
    if(!el) return;
    el.addEventListener('click', function(){
      setTimeout(function(){
        try { var p = payloadFn(); if(p) snapAdd(type, p); } catch(e){}
      }, 150);
    });
  }
  snapWatch('btn-copy', 'copy', function(){ return LAST_OUT; });
  snapWatch('btn-md', 'export-md', function(){ return LAST_OUT; });
  snapWatch('btn-docout', 'export-docx', function(){ return LAST_OUT; });
  snapWatch('ts-btn-export-md', 'export-md', function(){ return (typeof TS_LAST_OUT !== 'undefined') ? TS_LAST_OUT : ''; });
  snapWatch('ts-btn-docout', 'export-docx', function(){ return (typeof TS_LAST_OUT !== 'undefined') ? TS_LAST_OUT : ''; });

  window.snapAdd = snapAdd;
  window.snapRestore = snapRestore;
  window.snapOpen = snapOpen;
  window.snapAll = snapAll;

  var snapBtn = document.getElementById('btn-snap');
  if(snapBtn) snapBtn.onclick = snapOpen;
})();
