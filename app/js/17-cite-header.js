/* ═══════════ T-033 导出引用头（APA 署名 + 版权声明）· v4.43.0 ═══════════
   校对完成 → 点「复制结果」时，在最前面可选地加四样：
   ①中译标题 ②作者（中译名）+ 研究机构 ③APA 格式出处 ④版权声明（CC BY-NC-SA 4.0，仅供个人学习）。
   元数据由 AI 从原文自动抽取，查不到的字段留给翻译者手填。 */
const CITE_LS = 'tp.citemeta';
const CITE_SYS = '你是学术文献元数据抽取助手。输入是论文/文章的开头或全文。从中提取引用所需信息，输出 JSON 对象（不要代码围栏、不要解释）：{"title_zh":"文章中文标题（原文是中文则原样，否则给出译名）","author_zh":"第一作者中译名（姓在前，如 麦考利）","institution":"第一作者研究机构中文名","author_en":"APA 格式作者列表（保留原文字符串，如 McCauley, S. M., & Christiansen, M. H.）","year":"出版年份","article_title":"文章原文标题","journal":"期刊名","volume":"卷","issue":"期","pages":"页码","doi":"DOI 纯数字串（不带 https://doi.org/ 前缀）"}。查不到的字段填空字符串。只输出 JSON 对象本身。';

function citeMetaDefaults(){
  return { title_zh:'', author_zh:'', institution:'', author_en:'', year:'', article_title:'', journal:'', volume:'', issue:'', pages:'', doi:'' };
}
function citeLoadMeta(){
  try{
    const o = JSON.parse(localStorage.getItem(CITE_LS) || 'null');
    if(o && typeof o === 'object') return Object.assign(citeMetaDefaults(), o);
  }catch(e){}
  return citeMetaDefaults();
}
function citeSaveMeta(m){
  try{ localStorage.setItem(CITE_LS, JSON.stringify(m || citeMetaDefaults())); }catch(e){}
}
function citeSourceText(){
  const cands = [];
  const src = $('#src'), tss = $('#ts-src');
  if(src && src.value) cands.push(src.value);
  if(tss && tss.value) cands.push(tss.value);
  if(window.__TP_FILES && __TP_FILES.src && __TP_FILES.src.text) cands.push(__TP_FILES.src.text);
  for(const c of cands){ if(c && c.trim().length > 40) return c; }
  return (cands.find(c => c && c.trim()) || '');
}
function citeDoiUrl(d){
  d = (d || '').trim();
  if(!d) return '';
  if(d.indexOf('http://') === 0 || d.indexOf('https://') === 0) return d;
  return 'https://doi.org/' + d;
}

function citeBuildApa(m){
  m = m || {};
  const a=(m.author_en||'').trim(), y=(m.year||'').trim(), t=(m.article_title||'').trim(),
        j=(m.journal||'').trim(), v=(m.volume||'').trim(), i=(m.issue||'').trim(),
        p=(m.pages||'').trim(), d=citeDoiUrl(m.doi);
  let out = '';
  if(a) out += a;
  if(y) out += (out ? ' (' : '(') + y + ')';
  if(t) out += (out ? '. ' : '') + t + '.';
  if(j) out += (out ? ' ' : '') + j;
  if(v) out += ', ' + v;
  if(i) out += '(' + i + ')';
  if(p) out += ', ' + p + '.';
  else if(j || v || i) out += '.';
  if(d) out += ' ' + d;
  return out.trim() ? out : '';
}
function citeBuildHeader(m, opts){
  m = m || {};
  opts = opts || { title:true, author:true, apa:true, license:true };
  const parts = [];
  if(opts.title && (m.title_zh||'').trim()) parts.push('【标题】' + m.title_zh.trim());
  if(opts.author){
    const a=(m.author_zh||'').trim(), ins=(m.institution||'').trim();
    if(a || ins) parts.push('【作者】' + (a ? a + (ins ? '，' + ins : '') : ins));
  }
  if(opts.apa){ const apa = citeBuildApa(m); if(apa) parts.push('【APA 出处】\n' + apa); }
  if(opts.license) parts.push('【版权声明】\n本文遵循 CC BY-NC-SA 4.0 协议发布，仅供个人学习使用。');
  return parts.join('\n\n');
}

let CITE_CUR = null;
function citeBlockForDialog(){
  CITE_CUR = citeLoadMeta();
  return citeHeaderBlockHtml(CITE_CUR);
}
function citeHeaderBlockHtml(meta){
  meta = meta || citeMetaDefaults();
  const f = (k, label, ph) =>
    '<div style="display:flex;gap:6px;align-items:center">' +
    '<label style="width:76px;flex-shrink:0;font-size:12px;color:var(--tx2)">' + label + '</label>' +
    '<input id="cite-' + k + '" value="' + esc(meta[k] || '') + '" placeholder="' + (ph||'') + '" style="flex:1;font-size:13px;padding:4px 6px">' +
    '</div>';
  return '<div style="border:1px solid var(--bd);border-radius:8px;padding:10px;margin-bottom:10px">' +
    '<div style="font-size:13px;font-weight:600;margin-bottom:8px">📎 引用头（勾选后置于译文最前面，查不到的手填）</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px;font-size:13px">' +
      '<label><input type="checkbox" id="cite-op-title" checked style="width:auto"> ① 中译标题</label>' +
      '<label><input type="checkbox" id="cite-op-author" checked style="width:auto"> ② 作者+机构</label>' +
      '<label><input type="checkbox" id="cite-op-apa" checked style="width:auto"> ③ APA 出处</label>' +
      '<label><input type="checkbox" id="cite-op-license" checked style="width:auto"> ④ 版权声明</label>' +
      '<button class="btn sm gray" id="cite-extract" type="button">🤖 自动提取</button>' +
    '</div>' +
    '<details><summary style="font-size:12px;color:var(--ac);cursor:pointer">✏️ 编辑引用信息</summary>' +
    '<div style="margin-top:8px;display:grid;gap:4px">' +
      f('title_zh','中译标题','文章中文标题') +
      f('author_zh','作者中译名','如：麦考利') +
      f('institution','研究机构','如：康奈尔大学') +
      f('author_en','APA 作者','McCauley, S. M., & Christiansen, M. H.') +
      f('year','年份','2019') +
      f('article_title','文章标题','原文标题') +
      f('journal','期刊','Psychological Review') +
      f('volume','卷','126') + f('issue','期','1') + f('pages','页码','1–51') +
      f('doi','DOI','10.1037/rev0000126') +
    '</div></details></div>';
}

function citeCollectMetaFromForm(){
  const m = citeMetaDefaults();
  const keys = ['title_zh','author_zh','institution','author_en','year','article_title','journal','volume','issue','pages','doi'];
  for(const k of keys){ const el = $('#cite-' + k); if(el) m[k] = el.value.trim(); }
  return m;
}
function citeBuildFromDialog(){
  const m = citeCollectMetaFromForm();
  citeSaveMeta(m);
  const opts = {
    title: $('#cite-op-title') ? $('#cite-op-title').checked : true,
    author: $('#cite-op-author') ? $('#cite-op-author').checked : true,
    apa: $('#cite-op-apa') ? $('#cite-op-apa').checked : true,
    license: $('#cite-op-license') ? $('#cite-op-license').checked : true
  };
  return citeBuildHeader(m, opts);
}
async function citeExtract(){
  const src = citeSourceText();
  if(!src){ toast('没找到原文，无法自动提取', 'w'); return; }
  const btn = $('#cite-extract');
  if(btn){ btn.disabled = true; btn.textContent = '提取中…'; }
  try{
    const user = '原文（前 6000 字）：\n' + src.slice(0, 6000);
    const raw = await callModelSimple(CITE_SYS, user, 1000);
    const obj = extractJsonObject(raw);
    if(obj && typeof obj === 'object'){
      const m = citeCollectMetaFromForm();
      const keys = ['title_zh','author_zh','institution','author_en','year','article_title','journal','volume','issue','pages','doi'];
      for(const k of keys){ if(obj[k] != null && String(obj[k]).trim()) m[k] = String(obj[k]).trim(); }
      citeSaveMeta(m);
      for(const k of keys){ const el = $('#cite-' + k); if(el) el.value = m[k] || ''; }
      toast('已自动提取，请核对（查不到的空着即可）');
    } else {
      toast('提取失败，请手动填写', 'w');
    }
  }catch(e){ toast('提取失败：' + (e && e.message ? e.message : '网络或模型错误'), 'e'); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = '🤖 自动提取'; } }
}
function citeBindDialog(){
  const b = $('#cite-extract');
  if(b) b.onclick = citeExtract;
}
window.citeBuildHeader = citeBuildHeader;
window.citeBuildApa = citeBuildApa;
window.citeBuildFromDialog = citeBuildFromDialog;
window.citeHeaderBlockHtml = citeHeaderBlockHtml;
window.citeBindDialog = citeBindDialog;
window.citeBlockForDialog = citeBlockForDialog;
