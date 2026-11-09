/* ═══════════ 设置页 ═══════════ */
function fillCfg(){
  // 比对时双向去掉尾部 /（Gemini 等以 / 结尾的端点保存时会被 btn-save 剥掉，不归一化会误判成自定义）
  const nb = String(CFG.baseUrl || '').replace(/\/+$/, '');
  const p = PROVIDERS.find(x => x.url.replace(/\/+$/, '') === nb && x.model === CFG.model);
  if(p) $('#provider').value = p.url + '|' + p.model + '|' + p.label; else $('#provider').value = 'custom';
  $('#baseUrl').value = CFG.baseUrl || '';
  $('#model').value = CFG.model || '';
  $('#apiKey').value = CFG.apiKey || '';
  $('#maxTok').value = CFG.maxTok;
  $('#maxInChars').value = CFG.maxInChars || 80000;
  $('#temp').value = CFG.temp;
  $('#timeout').value = CFG.timeout;
  $('#webhook').value = CFG.webhook || '';
  $('#keyWarn').style.display = CFG.apiKey ? 'none' : 'block';
  updateDot();
}
const PROVIDERS = [
  /* 国内主流（可直连）——base URL 均为官方 OpenAI 兼容端点，模型名可手改 */
  {g:'国内主流', url:'https://api.deepseek.com', model:'deepseek-chat', label:'DeepSeek 官方 · deepseek-chat（推荐）'},
  {g:'国内主流', url:'https://api.deepseek.com', model:'deepseek-reasoner', label:'DeepSeek-R1 推理（慢但更细）'},
  {g:'国内主流', url:'https://api.xiaomimimo.com/v1', model:'mimo-v2.6-flash', label:'小米 MiMo · mimo-v2.6-flash'},
  {g:'国内主流', url:'https://api.xiaomimimo.com/v1', model:'mimo-v2.6-pro', label:'小米 MiMo Pro · mimo-v2.6-pro'},
  {g:'国内主流', url:'https://dashscope.aliyuncs.com/compatible-mode/v1', model:'qwen-plus', label:'通义千问 Qwen-Plus（阿里云）'},
  {g:'国内主流', url:'https://dashscope.aliyuncs.com/compatible-mode/v1', model:'qwen-max', label:'通义千问 Qwen-Max（阿里云）'},
  {g:'国内主流', url:'https://open.bigmodel.cn/api/paas/v4', model:'glm-4-plus', label:'智谱 GLM-4-Plus'},
  {g:'国内主流', url:'https://api.moonshot.cn/v1', model:'moonshot-v1-32k', label:'Kimi 月之暗面 32K'},
  {g:'国内主流', url:'https://ark.cn-beijing.volces.com/api/v3', model:'doubao-pro-32k', label:'火山方舟 豆包'},
  {g:'国内主流', url:'https://qianfan.baidubce.com/v2', model:'ernie-4.0-turbo-8k', label:'百度千帆 ERNIE 4.0'},
  {g:'国内主流', url:'https://api.hunyuan.cloud.tencent.com/v1', model:'hunyuan-turbos-latest', label:'腾讯混元 Turbos'},
  {g:'国内主流', url:'https://api.siliconflow.cn/v1', model:'deepseek-ai/DeepSeek-V3', label:'硅基流动 · DeepSeek-V3'},
  {g:'国内主流', url:'https://api.minimax.chat/v1', model:'MiniMax-Text-01', label:'MiniMax · Text-01'},
  {g:'国内主流', url:'https://api.stepfun.com/v1', model:'step-2-16k', label:'阶跃星辰 Step-2'},
  /* 海外主流（需可访问外网） */
  {g:'海外主流（需外网）', url:'https://api.openai.com/v1', model:'gpt-4o', label:'OpenAI · gpt-4o'},
  {g:'海外主流（需外网）', url:'https://api.openai.com/v1', model:'gpt-4.1', label:'OpenAI · gpt-4.1'},
  {g:'海外主流（需外网）', url:'https://api.anthropic.com/v1', model:'claude-sonnet-4-5', label:'Anthropic · Claude Sonnet 4.5'},
  {g:'海外主流（需外网）', url:'https://generativelanguage.googleapis.com/v1beta/openai/', model:'gemini-2.5-flash', label:'Google · Gemini 2.5 Flash'},
  {g:'海外主流（需外网）', url:'https://generativelanguage.googleapis.com/v1beta/openai/', model:'gemini-2.5-pro', label:'Google · Gemini 2.5 Pro'},
  {g:'海外主流（需外网）', url:'https://api.x.ai/v1', model:'grok-4', label:'xAI · Grok-4'},
  {g:'海外主流（需外网）', url:'https://api.mistral.ai/v1', model:'mistral-large-latest', label:'Mistral Large'},
  {g:'海外主流（需外网）', url:'https://api.groq.com/openai/v1', model:'llama-3.3-70b-versatile', label:'Groq · Llama-3.3-70B（快）'},
  /* 聚合与本地 */
  {g:'聚合 / 本地', url:'https://openrouter.ai/api/v1', model:'deepseek/deepseek-chat', label:'OpenRouter（一个 Key 用各家）'},
  {g:'聚合 / 本地', url:'http://localhost:11434/v1', model:'qwen3:8b', label:'Ollama 本地（Key 随意填）'}
];
/* v4.23.0：下拉按 PROVIDERS 分组动态生成，末尾固定「自定义」项。
   custom 的 value 必须是字面 'custom'——4.22.0 前是 'custom|custom|…'，导致
   onchange 的 v==='custom' 永假（选自定义会把接口地址/模型名覆盖成字面 custom）、
   fillCfg 的回显匹配也落空，本次一并修掉。 */
function renderProviderOptions(){
  const sel = $('#provider'); if(!sel) return;
  sel.innerHTML = '';
  let og = null, lastG = '';
  for(const p of PROVIDERS){
    if(p.g !== lastG){ og = document.createElement('optgroup'); og.label = p.g; sel.appendChild(og); lastG = p.g; }
    const o = document.createElement('option');
    o.value = p.url + '|' + p.model + '|' + p.label;
    o.textContent = p.label;
    og.appendChild(o);
  }
  const oc = document.createElement('option');
  oc.value = 'custom'; oc.textContent = '自定义 · OpenAI 兼容接口';
  sel.appendChild(oc);
}
renderProviderOptions();
function updateDot(){
  const ok = CFG.apiKey && CFG.baseUrl && CFG.model;
  const dot = $('#apiDot'), txt = $('#apiTxt');
  dot.className = 'dot' + (ok ? ' on' : '');
  txt.textContent = ok ? (CFG.model || '已配置') : '未配置';
}
$('#provider').onchange = e => {
  const v = e.target.value;
  if(v === 'custom') return;
  const [url, model] = v.split('|');
  $('#baseUrl').value = url; $('#model').value = model;
};
$('#btn-save').onclick = () => {
  CFG = {
    baseUrl: $('#baseUrl').value.trim().replace(/\/+$/, ''),
    model: $('#model').value.trim(),
    apiKey: $('#apiKey').value.trim(),
    maxTok: +$('#maxTok').value || 16000,
    maxInChars: +$('#maxInChars').value || 80000,
    temp: +$('#temp').value || 0.3,
    timeout: +$('#timeout').value || 180,
    webhook: $('#webhook').value.trim()
  };
  save(LS.cfg, CFG);
  toast('已保存', 'ok');
};
// tokens 快速预设
document.querySelectorAll('[data-preset-tok]').forEach(b => b.onclick = () => { $('#maxTok').value = b.dataset.presetTok; CFG.maxTok = +b.dataset.presetTok; save(LS.cfg, CFG); toast('已设 ' + b.dataset.presetTok + ' tokens（已自动保存）', 'ok'); });
// 原文最大字数预设
document.querySelectorAll('[data-preset-chars]').forEach(b => b.onclick = () => { $('#maxInChars').value = b.dataset.presetChars; CFG.maxInChars = +b.dataset.presetChars; save(LS.cfg, CFG); toast('原文上限已设 ' + b.dataset.presetChars + ' 字（已自动保存）', 'ok'); });
$('#btn-test').onclick = async () => {
  const url = $('#baseUrl').value.trim(), key = $('#apiKey').value.trim(), model = $('#model').value.trim();
  const m = $('#testMsg');
  if(!url || !key || !model){ m.textContent = '请先填写完整'; m.style.color = 'var(--warn)'; return; }
  m.innerHTML = '<span class="spin"></span> 测试中……'; m.style.color = 'var(--tx2)';
  try{
    const r = await fetch(url.replace(/\/+$/,'') + '/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer ' + key},
      body: JSON.stringify({ model, messages:[{role:'user',content:'回复两个字：正常'}], max_tokens:16, stream:false })
    });
    if(!r.ok){ const t = await r.text(); throw new Error('HTTP ' + r.status + ' — ' + t.slice(0,180)); }
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content || '(空)';
    m.textContent = '✓ 连接成功 · 模型回复：' + txt.trim().slice(0,30);
    m.style.color = 'var(--ok)';
    CFG = { baseUrl:url.replace(/\/+$/,''), model, apiKey:key, maxTok:+$('#maxTok').value||8000, maxInChars:+$('#maxInChars').value||80000, temp:+$('#temp').value||0.3, timeout:+$('#timeout').value||180, webhook:$('#webhook').value.trim() };
    save(LS.cfg, CFG); updateDot(); $('#keyWarn').style.display='none';
  }catch(err){
    m.textContent = '✗ 失败：' + err.message;
    m.style.color = 'var(--err)';
  }
};

/* ═══════════ 术语库 ═══════════ */
const CATS = ['哲学','社会学','人类学','文化研究','电影学','历史学','政治经济学','文学理论','心理学','法学','传播学','自然科学','人名','地名','机构','其他'];
function renderTerms(){
  const q = ($('#termSearch')?.value || '').toLowerCase().trim();
  const cat = $('#termCat')?.value || '';
  const tb = $('#termTable tbody');
  const list = TERMS.filter(t =>
    (!q || (t.src+' '+t.dst+' '+(t.note||'')).toLowerCase().includes(q)) &&
    (!cat || t.cat === cat)
  );
  $('#termCount').textContent = TERMS.length + ' 条' + (list.length !== TERMS.length ? '（筛选出 ' + list.length + '）' : '');
  const w = $('#termWarn'); if(w) w.style.display = TERMS.length ? 'none' : 'inline';
  if(!list.length){
    tb.innerHTML = '<tr><td colspan="5"><div class="empty">' + (TERMS.length ? '没有匹配的术语' : '术语库还是空的 — 在上方批量粘贴，或点「＋ 新增一行」') + '</div></td></tr>';
    return;
  }
  tb.innerHTML = list.map(t => {
    const i = TERMS.indexOf(t);
    return '<tr data-i="' + i + '">' +
      '<td><input value="' + esc(t.src) + '" data-k="src"></td>' +
      '<td><input value="' + esc(t.dst) + '" data-k="dst"></td>' +
      '<td><select data-k="cat">' + CATS.map(c => '<option' + (c===t.cat?' selected':'') + '>' + c + '</option>').join('') + '</select></td>' +
      '<td><input value="' + esc(t.note||'') + '" data-k="note"></td>' +
      '<td style="white-space:nowrap"><button class="btn gray sm" data-verify title="AI 核查这条收录是否正确（v4.26.0）">🤖 核查</button> <button class="btn gray sm" data-del>删除</button></td></tr>';
  }).join('');
  tb.querySelectorAll('tr').forEach(tr => {
    const i = +tr.dataset.i;
    tr.querySelectorAll('[data-k]').forEach(el => {
      el.onchange = () => { TERMS[i][el.dataset.k] = el.value.trim(); save(LS.terms, TERMS); };
    });
    tr.querySelector('[data-del]').onclick = () => {
      TERMS.splice(i, 1); save(LS.terms, TERMS); renderTerms();
    };
    tr.querySelector('[data-verify]').onclick = async () => {
      const t = TERMS[+tr.dataset.i]; if(!t) return;
      const items = [{ src: t.src, dst: t.dst, extra: t.cat || '' }];
      const vs = await verifyEntries(items, tr.querySelector('[data-verify]'));
      if(!vs) return;
      showVerifyResults(items, vs, { onAdopt: (k, v) => {
        if(!v.suggest) return false;
        t.dst = v.suggest; save(LS.terms, TERMS); renderTerms();
        toast('已把「' + t.src + '」的译法改为建议值');
        return true;
      }});
    };
  });
}
function initTermCat(){
  $('#termCat').innerHTML = '<option value="">全部类别</option>' + CATS.map(c => '<option>' + c + '</option>').join('');
}
$('#termSearch').oninput = renderTerms;
$('#termCat').onchange = renderTerms;
$('#btn-term-new').onclick = () => {
  TERMS.unshift({ src:'', dst:'', cat:'其他', note:'' });
  save(LS.terms, TERMS);
  $('#termSearch').value = ''; $('#termCat').value = '';
  renderTerms();
  const f = $('#termTable tbody tr:first-child input'); if(f) f.focus();
};
$('#btn-term-add').onclick = () => {
  const lines = $('#termPaste').value.split('\n').map(s => s.trim()).filter(Boolean);
  if(!lines.length){ toast('请先粘贴内容'); return; }
  let n = 0;
  lines.forEach(line => {
    const p = line.split(/[|\t]/).map(s => s.trim());
    if(!p[0] || !p[1]) return;
    const ex = TERMS.find(t => t.src.toLowerCase() === p[0].toLowerCase());
    if(ex){ ex.dst = p[1]; if(p[2]) ex.note = p[2]; }
    else TERMS.push({ src:p[0], dst:p[1], cat:p[3] || guessCat(p[0], p[2] || ''), note:p[2] || '' });
    n++;
  });
  save(LS.terms, TERMS); $('#termPaste').value = ''; renderTerms();
  toast('已导入 ' + n + ' 条术语');
};
function guessCat(src, note){
  const s = (src + ' ' + note).toLowerCase();
  if(/hegemony|capital|class|marx|labour|labor|state|ideolog|neoliber/.test(s)) return '政治经济学';
  if(/ritual|kinship|ethnograph|tribe|totem/.test(s)) return '人类学';
  if(/cinema|film|mise|montage|shot|auteur/.test(s)) return '电影学';
  if(/discourse|narrative|semiot|deconstruct|textual/.test(s)) return '文化研究';
  if(/unconscious|cognit|psycho|freud|lacan/.test(s)) return '心理学';
  if(/dynasty|empire|colonial|histori|archiv/.test(s)) return '历史学';
  return '其他';
}
$('#btn-term-exp').onclick = () => dl('术语库_' + today() + '.json', JSON.stringify(TERMS, null, 2), 'application/json');
$('#btn-term-csv').onclick = () => {
  const rows = [['原文','中文译名','类别','备注']].concat(TERMS.map(t => [t.src, t.dst, t.cat||'', t.note||'']));
  const csv = '\ufeff' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  dl('术语库_' + today() + '.csv', csv, 'text/csv');
};
$('#btn-term-imp').onclick = () => $('#termFile').click();
$('#termFile').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try{
      const txt = rd.result;
      let add = [];
      if(f.name.endsWith('.json')){
        const j = JSON.parse(txt);
        add = (Array.isArray(j) ? j : j.terms || []).map(t => ({ src:t.src||t.source||'', dst:t.dst||t.target||'', cat:t.cat||'其他', note:t.note||'' }));
      }else{
        add = csvParse(txt).slice(txt.trim().split('\n')[0].includes('原文') ? 1 : 0).map(c => ({ src:c[0]||'', dst:c[1]||'', cat:c[2]||'其他', note:c[3]||'' }));
      }
      add = add.filter(t => t.src && t.dst);
      add.forEach(t => {
        const ex = TERMS.find(x => x.src.toLowerCase() === t.src.toLowerCase());
        if(ex){ ex.dst = t.dst; ex.note = t.note || ex.note; } else TERMS.push(t);
      });
      save(LS.terms, TERMS); renderTerms();
      toast('已导入 ' + add.length + ' 条');
    }catch(err){ toast('导入失败：' + err.message, 'e'); }
  };
  rd.readAsText(f, 'UTF-8');
  e.target.value = '';
};
$('#btn-term-scan').onclick = () => $('#termScanFile').click();
$('#termScanFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if(!f) return;
  const btn = $('#btn-term-scan');
  btn.disabled = true; btn.textContent = '🤖 扫描中…';
  try{
    const r = await smartScanFile(f, (msg) => { btn.textContent = '🤖 ' + msg; });
    btn.disabled = false; btn.textContent = '🤖 智能扫描';
    if(r && r.total){
      toast('智能扫描完成：抽取 ' + r.total + ' 条术语 → 集合。已放入「专有译词库」，可到那里审核后点「⚡ 同步到术语库」一键锁定。');
    }
  }catch(err){
    btn.disabled = false; btn.textContent = '🤖 智能扫描';
    toast('智能扫描失败：' + err.message, 'e');
  }
};
$('#btn-term-clr').onclick = () => {
  if(!TERMS.length){ toast('术语库已是空的'); return; }
  if(confirm('确定清空全部 ' + TERMS.length + ' 条术语？建议先导出备份。')){
    TERMS = []; save(LS.terms, TERMS); renderTerms(); toast('已清空');
  }
};
$('#btn-pref-save').onclick = () => {
  PREFS = $('#prefs').value.trim(); save(LS.prefs, PREFS);
  $('#prefSaved').textContent = '✓ 已保存 · ' + new Date().toLocaleTimeString('zh-CN');
};

/* ═══════════ 团队云端同步（3.2） ═══════════ */
$('#cloudUrl').value = CFG.cloudUrl || '';
$('#btn-cloud-pull').onclick = async () => {
  const url = $('#cloudUrl').value.trim();
  const msg = $('#cloudMsg');
  if(!url){ msg.innerHTML = '<span style="color:var(--err)">请先粘贴共享词库网址（见下方发布教程）</span>'; return; }
  if(!/^https?:\/\//i.test(url)){ msg.innerHTML = '<span style="color:var(--err)">网址需要以 http:// 或 https:// 开头</span>'; return; }
  CFG.cloudUrl = url; save(LS.cfg, CFG);
  msg.innerHTML = '<span style="color:var(--tx3)">⏳ 正在拉取云端词库……</span>';
  try{
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error('网址返回了错误状态 HTTP ' + res.status + (res.status === 404 ? '（链接失效？重新复制一次 Raw 网址）' : ''));
    const txt = await res.text();
    let j;
    try{ j = JSON.parse(txt); }
    catch(_){ throw new Error('返回内容不是 JSON——请确认粘贴的是「Raw」网址：浏览器打开它应该显示一串纯文本词条，而不是网页界面'); }
    const arr = Array.isArray(j) ? j : (Array.isArray(j.terms) ? j.terms : null);
    if(!arr) throw new Error('格式不认识：需要「导出 JSON」得到的词库数组');
    const add = arr.map(t => {
      if(t && (t.src || t.source)) return { src: t.src || t.source || '', dst: t.dst || t.target || '', cat: t.cat || '其他', note: t.note || '' };
      if(t && (t.zh || t.foreign)) return { src: t.foreign || t.zh || '', dst: t.zh || '', cat: t.type || '其他', note: [t.note, (t.tags||[]).join('、')].filter(Boolean).join('；') };
      return null;
    }).filter(t => t && t.src && t.dst);
    if(!add.length) throw new Error('云端词库是空的，或不是本工具导出的格式');
    let added = 0, updated = 0;
    add.forEach(t => {
      const ex = TERMS.find(x => x.src.toLowerCase() === t.src.toLowerCase());
      if(ex){ if(ex.dst !== t.dst){ ex.dst = t.dst; updated++; } ex.note = t.note || ex.note; }
      else { TERMS.push(t); added++; }
    });
    save(LS.terms, TERMS); renderTerms();
    msg.innerHTML = '<span style="color:var(--ok)">✓ 同步完成（' + new Date().toLocaleTimeString('zh-CN') + '）：云端 ' + add.length + ' 条 → 新增 ' + added + '、更新 ' + updated + '、与本地一致 ' + (add.length - added - updated) + '</span>';
    toast('云端词库已同步');
  }catch(err){
    const net = /Failed to fetch|NetworkError|Load failed/i.test(err.message);
    msg.innerHTML = '<span style="color:var(--err)">✗ 拉取失败：' + esc(net ? '网络不通，或该网址不允许浏览器跨域读取。建议：① 检查网络后重试；② 确认复制的是 GitHub Gist 的 Raw 网址；③ 仍不行就把 JSON 放进 GitHub 仓库，改用 jsDelivr 网址（cdn.jsdelivr.net/gh/用户名/仓库名@main/文件名.json）' : err.message) + '</span>';
  }
};

/* ═══════════ 数据管理 ═══════════ */
function today(){ return new Date().toISOString().slice(0,10); }
function dl(name, content, type){
  const b = new Blob([content], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
// 全部持久化 key（v2 备份/恢复/清除/统计的单一来源）
const ALL_KEYS = ['tp.cfg','tp.terms','tp.prefs','tp.history','tp.memory','tp.project','tp.prompts','tp.gloss','tp.task','tp.stage','tp.theme','tp.accent','tp.splash','tp.fb.log'];
$('#btn-backup').onclick = () => {
  // v2：完整备份所有本地数据（12 个 key），用于原封不动迁移到其他设备/平台
  const data = {};
  ALL_KEYS.forEach(k => { try{ const v = localStorage.getItem(k); if(v != null) data[k] = v; }catch(e){} });
  dl('译校助手完整备份_' + today() + '.json', JSON.stringify({ v:2, date:new Date().toISOString(), data }, null, 2), 'application/json');
};
$('#btn-restore').onclick = () => $('#bakFile').click();
$('#bakFile').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try{
      const j = JSON.parse(rd.result);
      if(j.data && typeof j.data === 'object'){
        // v2：完整恢复所有本地数据，然后刷新让全部模块重新加载
        Object.entries(j.data).forEach(([k, v]) => { if(v != null && ALL_KEYS.includes(k)){ try{ localStorage.setItem(k, v); }catch(_){} } });
        toast('完整备份已恢复，即将刷新…');
        setTimeout(() => location.reload(), 600);
      } else {
        // v1 兼容：旧的 cfg/terms/prefs
        if(j.cfg) { CFG = Object.assign({}, DEF_CFG, j.cfg); save(LS.cfg, CFG); }
        if(Array.isArray(j.terms)) { TERMS = j.terms; save(LS.terms, TERMS); }
        if(typeof j.prefs === 'string') { PREFS = j.prefs; save(LS.prefs, PREFS); $('#prefs').value = PREFS; }
        fillCfg(); renderTerms(); renderDataStat();
        toast('备份已恢复');
      }
    }catch(err){ toast('恢复失败：' + err.message, 'e'); }
  };
  rd.readAsText(f, 'UTF-8'); e.target.value = '';
};
$('#btn-wipe').onclick = () => {
  if(!confirm('将清除 API Key、术语库、偏好、历史、翻译记忆、项目进度等全部本地数据。此操作不可撤销。确定继续？')) return;
  ALL_KEYS.forEach(k => localStorage.removeItem(k));
  // 刷新让所有模块从（已清空的）localStorage 重新初始化，避免内存残留数据被静默写回
  toast('已清除全部数据，即将刷新…');
  setTimeout(() => location.reload(), 600);
};
function renderDataStat(){
  const size = ALL_KEYS.reduce((n,k) => n + (localStorage.getItem(k)||'').length, 0);
  $('#dataStat').textContent = '术语 ' + TERMS.length + ' 条 · 偏好 ' + PREFS.length + ' 字 · 占用约 ' + (size/1024).toFixed(1) + ' KB';
  renderHistory();
}
function renderHistory(){
  const h = load(LS.history, []);
  const tb = $('#histTable tbody');
  if(!tb) return;
  $('#histCount').textContent = h.length ? ('共 ' + h.length + ' 条记录') : '暂无记录';
  if(!h.length){
    tb.innerHTML = '<tr><td colspan="3"><div class="empty">还没有校对记录</div></td></tr>';
    return;
  }
  tb.innerHTML = h.map((r, i) => {
    const d = new Date(r.t);
    const ts = d.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    return '<tr data-i="' + i + '">' +
      '<td style="color:var(--tx3);font-size:12px;white-space:nowrap">' + esc(ts) + (r.ext ? ' <span class="tag p">延伸</span>' : '') + '</td>' +
      '<td style="font-size:12.5px;color:var(--tx2)">' + esc((r.title||'').slice(0,60)) + '…</td>' +
      '<td style="white-space:nowrap"><button class="btn gray sm" data-open>查看</button> <button class="btn gray sm" data-del>删除</button></td></tr>';
  }).join('');
  tb.querySelectorAll('tr').forEach(tr => {
    const i = +tr.dataset.i;
    tr.querySelector('[data-open]').onclick = () => {
      const r = load(LS.history, [])[i];
      if(!r) return;
      LAST_OUT = r.out;
      modal('历史记录 · ' + new Date(r.t).toLocaleString('zh-CN'), [
        '<p style="font-size:12px;color:var(--tx3)">' + (r.ext ? '模式：术语/争议点延伸分析' : '模式：完整校对') + '</p>',
        '<div style="background:var(--bg);border:1px solid var(--bd);border-radius:6px;padding:14px;max-height:52vh;overflow-y:auto">' + md(r.out) + '</div>',
        '<p style="font-size:12px;color:var(--tx3);margin-top:12px">已载入到剪贴板来源，关闭后可直接点工作台页的「复制结果」或「转公众号格式」。</p>'
      ].join(''));
    };
    tr.querySelector('[data-del]').onclick = () => {
      const h2 = load(LS.history, []); h2.splice(i, 1); save(LS.history, h2); renderHistory();
    };
  });
}
$('#btn-hist-clr').onclick = () => {
  if(!load(LS.history, []).length){ toast('历史已是空的'); return; }
  if(confirm('确定清空全部校对历史？')){ save(LS.history, []); renderHistory(); toast('已清空'); }
};

/* ═══════════ 示例 ═══════════ */
const SAMPLE = {
  src:`It is argued that the modern subject is constituted not prior to, but through, the very disciplinary apparatuses that claim merely to describe it. Foucault's account of the panopticon is instructive here: the inmate internalises the gaze to the point where surveillance becomes superfluous. What is at stake, then, is not simply the extent of coercion, but the manner in which power produces the categories by which we come to recognise ourselves as subjects at all.`,
  dst:`有人认为，现代主体不是在规训机制之前构成的，而是通过这些机制构成的，而这些机制声称只是在描述它。福柯对全景敞视监狱的论述在此很有启发性：囚犯将目光内化到监视变得多余的程度。因此，问题的关键不仅仅是强制的程度，而是权力如何产生那些我们借以承认自己为主体的范畴。`
};
$('#btn-sample').onclick = () => {
  $('#src').value = SAMPLE.src; $('#dst').value = SAMPLE.dst;
  $('#lang').value = '英语'; $('#genre').value = '学术论文';
  toast('已载入示例文本');
};
$('#btn-clear').onclick = () => {
  ['src','dst','extra'].forEach(id => $('#' + id).value = '');
  $('#out').innerHTML = ''; $('#stats').style.display = 'none'; LAST_OUT = '';
  // P1：清空文件绑定
  ['src','dst'].forEach(side => { __TP_FILES[side] = null; renderFileBar(side); });
};
