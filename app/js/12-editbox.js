/* ═══════════ 编辑/查找替换（v4.28.0）——校对结果与译文输出可编辑，Word 式查找替换 ═══════════ */
let EB = null;
function ebOpen(which){
  if(EB) ebClose();
  const target = which === 'ts' ? $('#ts-out') : $('#out');
  if(!target) return;
  if((which === 'ts' ? TS_LAST_OUT : LAST_OUT) === ''){ toast('还没有结果可编辑', 'w'); return; }
  const wrap = document.createElement('div');
  wrap.className = 'eb-wrap';
  wrap.innerHTML = '<div class="eb-bar">' +
    '<input class="eb-find" placeholder="查找">' +
    '<input class="eb-repl" placeholder="替换为">' +
    '<button class="btn gray sm eb-rep1">替换</button>' +
    '<button class="btn gray sm eb-repall">全部替换</button>' +
    '<span class="eb-count hint"></span>' +
    '<span style="flex:1"></span>' +
    '<button class="btn pri sm eb-save">💾 保存并重渲</button>' +
    '<button class="btn gray sm eb-cancel">✕ 放弃修改</button>' +
    '</div><textarea class="eb-ta" spellcheck="false"></textarea>';
  target.parentNode.insertBefore(wrap, target);
  const ta = wrap.querySelector('.eb-ta');
  ta.value = which === 'ts' ? TS_LAST_OUT : LAST_OUT;
  target.style.display = 'none';
  EB = { which, target, wrap, ta, dirty: false };
  const count = () => {
    const q = wrap.querySelector('.eb-find').value;
    const c = q ? ta.value.split(q).length - 1 : 0;
    wrap.querySelector('.eb-count').textContent = q ? (c ? '找到 ' + c + ' 处' : '未找到') : '';
    return c;
  };
  wrap.querySelector('.eb-find').oninput = count;
  wrap.querySelector('.eb-rep1').onclick = () => {
    const q = wrap.querySelector('.eb-find').value, r = wrap.querySelector('.eb-repl').value;
    if(!q){ toast('先填「查找」', 'w'); return; }
    const i = ta.value.indexOf(q);
    if(i < 0){ toast('没找到', 'w'); return; }
    ta.value = ta.value.slice(0, i) + r + ta.value.slice(i + q.length);
    EB.dirty = true; count();
  };
  wrap.querySelector('.eb-repall').onclick = () => {
    const q = wrap.querySelector('.eb-find').value, r = wrap.querySelector('.eb-repl').value;
    if(!q){ toast('先填「查找」', 'w'); return; }
    const c = count();
    if(!c){ toast('没找到', 'w'); return; }
    ta.value = ta.value.split(q).join(r);
    EB.dirty = true; count();
    toast('已替换 ' + c + ' 处');
  };
  wrap.querySelector('.eb-save').onclick = ebSave;
  wrap.querySelector('.eb-cancel').onclick = () => ebClose();
  ta.focus();
}
function ebSave(){
  if(!EB) return;
  const v = EB.ta.value;
  if(EB.which === 'ts'){ TS_LAST_OUT = v; $('#ts-out').innerHTML = md(v); }
  else {
    LAST_OUT = v;
    $('#out').innerHTML = md(v);
    collapseSections(); markErrorLines(); renderAuditControls(); paintErrFixSpans();
  }
  saveTask();
  ebClose();
  toast('已保存');
}
function ebClose(){
  if(!EB) return;
  EB.target.style.display = '';
  EB.wrap.remove();
  EB = null;
}
$('#btn-out-edit') && ($('#btn-out-edit').onclick = () => ebOpen('out'));
$('#btn-ts-edit') && ($('#btn-ts-edit').onclick = () => ebOpen('ts'));
// 测试 seam
window.__EB = { setTs: (t) => { TS_LAST_OUT = String(t || ''); $('#ts-out').innerHTML = md(TS_LAST_OUT); } };
