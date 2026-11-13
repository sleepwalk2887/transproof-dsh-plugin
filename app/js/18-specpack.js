// ============ T-029 规范包导入（v4.44.0）============
// 把外部「规范说明」文字（如 skill 的 SKILL.md）作为附加规范层导入。
// 三通道：粘贴文本 / GitHub raw 链接 / 本地文件。预览后启用，buildSystem 注入（最低优先级）。
// 不执行任何第三方脚本，只导入纯文字。
const LS_SPECPACK = 'tp.specpack';
const SPECPACK_DEF = { version: 1, packs: [] };
const SPECPACK_MAX = 10;
const SPECPACK_MAXLEN = 50000;
const SP_NL = String.fromCharCode(10);

let SPECPACK = load(LS_SPECPACK, SPECPACK_DEF);
if (!SPECPACK || typeof SPECPACK !== 'object' || !Array.isArray(SPECPACK.packs)) {
  SPECPACK = { version: 1, packs: [] };
}

function specSave() { save(LS_SPECPACK, SPECPACK); }

function specEnabledPacks() {
  return (SPECPACK.packs || []).filter(function (p) { return p && p.enabled && p.text && String(p.text).trim(); });
}

// 供 buildSystem 注入（07-run-features.js 调用）
function specBlockForSystem() {
  var packs = specEnabledPacks();
  if (!packs.length) return '';
  var out = ['【外部规范包 · 仅供参考】以下为第三方导入的规范说明，若与本工具内置规则冲突，以内置规则为准。'];
  packs.forEach(function (p) {
    out.push('—— 来源：' + p.name + ' ——');
    out.push(String(p.text).trim());
  });
  return out.join(SP_NL);
}

function specUid() { return 'sp' + Date.now().toString(36) + Math.floor(Math.random() * 999).toString(36); }

function specAdd(name, source, url, text) {
  text = String(text || '').trim();
  if (!text) { toast('规范包内容为空，未导入', 'e'); return false; }
  if (text.length > SPECPACK_MAXLEN) { toast('规范包超过 50KB，请精简后导入', 'e'); return false; }
  if (SPECPACK.packs.length >= SPECPACK_MAX) { toast('最多 10 个规范包，请先删除不用的', 'e'); return false; }
  SPECPACK.packs.push({ id: specUid(), name: String(name || '').trim() || '未命名规范包', source: source || 'paste', url: url || '', text: text, enabled: true, createdAt: Date.now() });
  specSave();
  renderSpecPanel();
  toast('已导入规范包：' + (String(name || '').trim() || '未命名规范包'), 's');
  return true;
}

function specToggle(id) {
  var p = SPECPACK.packs.find(function (x) { return x && x.id === id; });
  if (p) { p.enabled = !p.enabled; specSave(); renderSpecPanel(); }
}

function specDelete(id) {
  SPECPACK.packs = SPECPACK.packs.filter(function (x) { return x && x.id !== id; });
  specSave();
  renderSpecPanel();
  toast('已删除规范包', 's');
}// 预览：把文本当纯文本渲染（textContent），杜绝 HTML 注入
function specPreview(name, text) {
  var div = document.createElement('div');
  div.style.cssText = 'max-height:320px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.7 monospace;color:#333;background:#f5f5f5;border:1px solid #ddd;border-radius:8px;padding:12px;';
  div.textContent = String(text || '');
  modal('规范包预览：' + (name || '未命名'), div.outerHTML);
}

function specImportFromText() {
  var html = '<div style="margin:0 0 10px"><label class="f">名称</label><input id="sp-name" placeholder="例如：出版社交稿规范"></div>'
    + '<div><label class="f">规范内容（纯文字，最多 50KB）</label><textarea id="sp-text" rows="8" placeholder="粘贴规范说明文字…"></textarea></div>'
    + '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn gray" data-close>取消</button>'
    + '<button class="btn pri" id="sp-do-add">导入</button></div>';
  modal('导入规范包 · 粘贴文本', html);
  var doAdd = function () {
    var name = ($('#sp-name') ? $('#sp-name').value : '');
    var text = ($('#sp-text') ? $('#sp-text').value : '');
    if (!String(text || '').trim()) { toast('内容为空', 'e'); return; }
    specAdd(name, 'paste', '', text);
    closeModal();
  };
  if ($('#sp-do-add')) $('#sp-do-add').onclick = doAdd;
  var ta = $('#sp-text'); if (ta) setTimeout(function () { ta.focus(); }, 60);
}

function specImportFromUrl() {
  var html = '<div><label class="f">GitHub raw 链接</label><input id="sp-url" placeholder="https://raw.githubusercontent.com/…/SKILL.md"></div>'
    + '<div style="margin-top:10px;font-size:12px;color:#888">直连 GitHub 可能不稳，失败就改用「粘贴文本」兜底。</div>'
    + '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn gray" data-close>取消</button>'
    + '<button class="btn pri" id="sp-do-fetch">抓取并导入</button></div>';
  modal('导入规范包 · 链接', html);
  if ($('#sp-do-fetch')) $('#sp-do-fetch').onclick = function () {
    var url = ($('#sp-url') ? $('#sp-url').value : '').trim();
    if (!url) { toast('请输入链接', 'e'); return; }
    if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) { toast('链接须以 http(s):// 开头', 'e'); return; }
    var btn = $('#sp-do-fetch'); if (btn) { btn.disabled = true; btn.textContent = '抓取中…'; }
    fetch(url, { method: 'GET' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) {
      if (!String(t || '').trim()) throw new Error('内容为空');
      if (btn) { btn.disabled = false; btn.textContent = '抓取并导入'; }
      closeModal();
      specAdd(url.split('/').pop() || '规范包', 'url', url, t);
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = '抓取并导入'; }
      toast('抓取失败：' + (e && e.message ? e.message : '网络或浏览器拦截，请改用粘贴文本导入'), 'e');
    });
  };
}

function specImportFromFile() {
  var fi = document.createElement('input');
  fi.type = 'file';
  fi.accept = '.md,.txt,.markdown,text/markdown,text/plain';
  fi.onchange = function () {
    var f = fi.files && fi.files[0];
    if (!f) return;
    if (f.size > SPECPACK_MAXLEN) { toast('文件超过 50KB', 'e'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var t = String(rd.result || '');
      if (!t.trim()) { toast('文件为空', 'e'); return; }
      specAdd(f.name, 'file', '', t);
    };
    rd.readAsText(f, 'utf-8');
  };
  fi.click();
}
function renderSpecPanel() {
  var box = $('#sp-list');
  if (!box) return;
  var packs = SPECPACK.packs || [];
  if (!packs.length) {
    box.innerHTML = '<div style="font-size:12px;color:#888;padding:8px 0">还没有规范包。点上方按钮导入一份「规范说明」。</div>';
    return;
  }
  var rows = packs.map(function (p) {
    var srcLabel = p.source === 'url' ? '链接' : (p.source === 'file' ? '文件' : '粘贴');
    return '<div class="sp-row" data-id="' + p.id + '" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid #eee">'
      + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">' + esc(p.name) + '</span>'
      + '<span style="font-size:11px;color:#888">' + srcLabel + '</span>'
      + '<button class="btn gray sm" data-sp-prev title="预览">预览</button>'
      + '<button class="btn gray sm" data-sp-toggle>' + (p.enabled ? '停用' : '启用') + '</button>'
      + '<button class="btn gray sm" data-sp-del title="删除">删除</button>'
      + '</div>';
  });
  box.innerHTML = rows.join('');
  box.querySelectorAll('[data-sp-toggle]').forEach(function (b) {
    var id = b.closest('.sp-row').getAttribute('data-id');
    b.onclick = function () { specToggle(id); };
  });
  box.querySelectorAll('[data-sp-del]').forEach(function (b) {
    var id = b.closest('.sp-row').getAttribute('data-id');
    b.onclick = function () { specDelete(id); };
  });
  box.querySelectorAll('[data-sp-prev]').forEach(function (b) {
    var id = b.closest('.sp-row').getAttribute('data-id');
    b.onclick = function () {
      var p = SPECPACK.packs.find(function (x) { return x && x.id === id; });
      if (p) specPreview(p.name, p.text);
    };
  });
}

if ($('#sp-import-text')) $('#sp-import-text').onclick = specImportFromText;
if ($('#sp-import-url')) $('#sp-import-url').onclick = specImportFromUrl;
if ($('#sp-import-file')) $('#sp-import-file').onclick = specImportFromFile;
if ($('#sp-list')) renderSpecPanel();

window.specBlockForSystem = specBlockForSystem;
window.specAdd = specAdd;
window.renderSpecPanel = renderSpecPanel;
