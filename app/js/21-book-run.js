// T-035 整本 EPUB 翻译：逐章翻译 + 两档位 + 进度 + 断点续传 + 疑难标注（v4.49.0）
(function(){
  var LS_BOOK = 'tp.book';
  var NL = String.fromCharCode(10);

  function bookState(){ try { return JSON.parse(localStorage.getItem(LS_BOOK) || 'null'); } catch(e){ return null; } }
  function bookSave(st){ try { localStorage.setItem(LS_BOOK, JSON.stringify(st)); } catch(e){} }

  // 断点：记录已翻章节（以 fileName + 章标题 + 原文前 40 字为指纹）
  function bookFinger(c){ return (c.title || '') + '|' + (c.text || '').slice(0, 40); }

  // 进度：更新翻译区提示 + 状态 + 一个简单进度条
  function bookProgress(i, total, title){
    var hint = $('#ts-outHint'); var stat = $('#ts-runStat');
    if(hint) hint.textContent = '整本翻译中 · 第 ' + i + '/' + total + ' 章 · ' + (title || '');
    if(stat) stat.textContent = '⏳';
    var bar = $('#ts-book-bar');
    if(bar){ bar.style.width = Math.round(i / total * 100) + '%'; bar.textContent = Math.round(i / total * 100) + '%'; }
  }

  // 单章翻译（快速档 = 一次调用；返回译文文本）
  async function bookTranslateOne(text, extra){
    var sys = (typeof buildTransSystem === 'function') ? buildTransSystem() : '';
    if(extra){ sys = sys + NL + NL + extra; }
    var user = '【外文原文】' + NL + text;
    var r = await callModel(sys, user, function(){}, 'trans');
    return r && r.text ? r.text : '';
  }

  // 质量档：三段流水线（翻译 → 批评 → 精修）
  async function bookQualityOne(text){
    var pass1 = await bookTranslateOne(text, '');
    if(!pass1) return '';
    var criticSys = '你是资深翻译审校。请找出下面译文相对于原文的硬伤（漏译/误译/术语不一致/数字日期/语病/机器腔）。只输出 JSON 数组，每项 {i, type, frag, fix, reason}，reason 不超过 30 字；没有问题输出 []。';
    var criticUser = '【原文】' + NL + text + NL + NL + '【译文】' + NL + pass1;
    var cr = await callModelSimple(criticSys, criticUser, 800);
    var list = [];
    try { var parsed = JSON.parse(cr); if(Array.isArray(parsed)) list = parsed; } catch(e){}
    if(!list.length) return pass1;
    var fixItems = list.map(function(x){ return (x.i ? ('第' + x.i + '条') : '') + ' ' + (x.type || '') + '：' + (x.frag || '') + ' → ' + (x.fix || '') + '（' + (x.reason || '') + '）'; }).join(NL);
    var polishSys = '你是资深翻译润色。请根据下面的批评清单逐条修正译文，输出最终精修稿（只输出译文正文，不要解释）。';
    var polishUser = '【原文】' + NL + text + NL + NL + '【初译】' + NL + pass1 + NL + NL + '【批评清单】' + NL + fixItems;
    var pr = await callModelSimple(polishSys, polishUser, 2000);
    return pr || pass1;
  }

  // 快速档：翻译 + 疑难标注（同一次调用，末尾列 ⚠️ 疑难句）
  async function bookFastOne(text){
    var extra = '译完后，如果某句拿不准（专业术语/长难句/歧义/数字），在译文末尾用单独一段列出最多 3 条疑难：' + NL + '⚠️ 疑难句：原文… → 现译… → 存疑原因…' + NL + '没有疑难就不写这一段。';
    return await bookTranslateOne(text, extra);
  }

  // 主循环
  async function bookRun(mode){
    if(typeof TS_FILES === 'undefined' || !TS_FILES.src){ toast('请先上传 EPUB 文件', 'e'); return; }
    var f = TS_FILES.src;
    var chs = f.chapters || [];
    if(!chs.length){ toast('没有解析到章节', 'e'); return; }
    if(typeof TS_RUNNING !== 'undefined' && TS_RUNNING){ toast('翻译正在进行中，请勿重复点击', 'w'); return; }
    var bookBtn = $('#ts-btn-book'); if(bookBtn) bookBtn.disabled = true;
    var runBtn = $('#ts-btn-run'); if(runBtn) runBtn.disabled = true;
    var stopBtn = $('#ts-btn-stop'); if(stopBtn) stopBtn.disabled = false;
    if(typeof TS_RUNNING !== 'undefined') TS_RUNNING = true;
    // 进度条容器
    var out = $('#ts-out');
    if(out){
      out.innerHTML = '<div style="margin-bottom:12px;background:#eef;border:1px solid #ccd;border-radius:6px;overflow:hidden"><div id="ts-book-bar" style="height:22px;width:0%;background:#4a7;color:#fff;text-align:center;font-size:12px;line-height:22px;transition:width .3s">0%</div></div><div id="ts-book-log"></div>';
    }
    var total = chs.length;
    // 断点恢复：已翻的章节跳过
    var st = bookState();
    var done = {};
    if(st && st.fileName === (f.fileName || '')){ (st.done || []).forEach(function(k){ done[k] = 1; }); }
    var log = $('#ts-book-log');
    function appendLog(s){ if(log){ var d = document.createElement('div'); d.textContent = s; d.style.cssText = 'font-size:12px;color:#555;margin:2px 0'; log.appendChild(d); } }
    var any = false;
    for(var i = 0; i < total; i++){
      var c = chs[i];
      var key = i + '|' + bookFinger(c);
      if(done[key]){ appendLog('↷ 跳过已翻：第 ' + (i + 1) + ' 章 · ' + (c.title || '')); continue; }
      bookProgress(i, total, c.title);
      appendLog('▶ 第 ' + (i + 1) + '/' + total + ' 章 · ' + (c.title || '') + '（' + (mode === 'fast' ? '快速' : '质量') + '）');
      try{
        var translated = (mode === 'fast') ? await bookFastOne(c.text) : await bookQualityOne(c.text);
        if(!translated){ appendLog('✗ 第 ' + (i + 1) + ' 章翻译为空，已跳过'); continue; }
        if(!c._srcText) c._srcText = c.text; // 备份原文
        c.text = translated;
        any = true;
        done[key] = 1;
        bookSave({ fileName: f.fileName || '', mode: mode, done: Object.keys(done) });
        appendLog('✓ 第 ' + (i + 1) + ' 章完成');
      }catch(e){
        appendLog('✗ 第 ' + (i + 1) + ' 章失败：' + (e && e.message ? e.message : e));
        break;
      }
    }
    bookProgress(total, total, '完成');
    var hint = $('#ts-outHint');
    if(any){
      if(hint) hint.textContent = '✅ 整本翻译完成 · ' + new Date().toLocaleTimeString('zh-CN');
      var stat = $('#ts-runStat'); if(stat) stat.textContent = '✓';
      appendLog('✅ 全部完成，可点「📥 下载 EPUB」导出译文。');
      toast('整本翻译完成，可导出 EPUB', 'ok');
      // 清断点
      bookSave({ fileName: '', done: [] });
      if(typeof saveTask === 'function') saveTask();
    } else {
      if(hint) hint.textContent = '已全部完成（无新章节）';
      var stat2 = $('#ts-runStat'); if(stat2) stat2.textContent = '✓';
    }
    if(typeof TS_RUNNING !== 'undefined') TS_RUNNING = false;
    if(bookBtn) bookBtn.disabled = false;
    if(runBtn) runBtn.disabled = false;
    if(stopBtn) stopBtn.disabled = true;
  }

  // 档位选择弹窗
  function bookTierModal(){
    var html = '<div style="line-height:1.8">' +
      '<p>请选择整本翻译的档位：</p>' +
      '<div style="margin:10px 0"><button class="btn pri" id="bk-fast" style="width:100%;justify-content:flex-start;margin-bottom:8px">⚡ 快速档 —— 每章翻一遍 + 自动术语/专名 + 末尾标 ⚠️ 疑难句</button></div>' +
      '<div><button class="btn pri" id="bk-quality" style="width:100%;justify-content:flex-start">🎯 质量档 —— 每章三段流水线（翻译 → 批评 → 精修）</button></div>' +
      '<p style="color:#888;font-size:12px;margin-top:10px">都支持断点续传：中断后再次点开会跳过已翻章节。</p>' +
      '</div>';
    modal('整本翻译 · 选择档位', html);
    var bf = document.getElementById('bk-fast');
    var bq = document.getElementById('bk-quality');
    if(bf) bf.onclick = function(){ closeModal(); bookRun('fast'); };
    if(bq) bq.onclick = function(){ closeModal(); bookRun('quality'); };
  }

  window.bookRun = bookRun;
  window.bookTierModal = bookTierModal;
  window.bookProgress = bookProgress;

  // 绑定按钮（若存在）
  var bb = document.getElementById('ts-btn-book');
  if(bb) bb.onclick = bookTierModal;
})();
