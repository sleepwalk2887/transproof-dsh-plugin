/* ═══════════ 配置与状态 ═══════════ */
const APP_VERSION = '4.43.0'; // 全局版本号：TransProof.version 与 #g-version 标签共用
/* 左下角版本显示（v4.39.1） */
(function(){
  function addVerTag(){
    if(typeof document === 'undefined' || document.getElementById('ver-tag')) return;
    var d = document.createElement('div');
    d.id = 'ver-tag';
    d.className = 'ver-tag';
    d.textContent = 'v' + APP_VERSION;
    (document.body || document.documentElement).appendChild(d);
  }
  if(document.body){ addVerTag(); } else { document.addEventListener('DOMContentLoaded', addVerTag); }
})();
const LS = {
  cfg:'tp.cfg', terms:'tp.terms', prefs:'tp.prefs', history:'tp.history', memory:'tp.memory'
};
const DEF_CFG = {
  baseUrl:'https://api.deepseek.com', model:'deepseek-chat', apiKey:'',
  maxTok:16000, maxInChars:80000, temp:0.3, timeout:180, webhook:''
};
let CFG = load(LS.cfg, DEF_CFG);
let TERMS = load(LS.terms, []);
let PREFS = load(LS.prefs, '');
let ABORT = null, LAST_OUT = '', RUNNING = false;
let PAUSE = null, PAUSE_REQUESTED = false; // 暂停态：保留已生成内容，支持续写
/* 校对阶段：full=完整校对 / pass1=一校（硬伤） / pass2=二校（文风） */
let STAGE = load('tp.stage', 'full');
/* 批注错误类型（用于分类标签与统计筛选） */
const ERR_TYPES = ['漏译','增译','误译','术语不一致','歧义','逻辑关系','中式英语','标点格式','语体不当'];
/* P2/P3 批注修正闭环：已修条目指纹表 {指纹:1}（跨模块共享数据，按拆分红线必须声明在 01 号文件） */
let AUDIT_FIX = {};

/* ═══════════ 翻译记忆（P1 · 零 token · 还能省 token）═══════════
   本地缓存「原文句 → 定稿句」；校对完成自动学习，下次遇到完全相同的
   句子就注入提示词让 AI 原样保留，跳过重翻。 */
let TM = load(LS.memory, []);
function splitSentences(text){
  return String(text || '').split(/[\n。！？；.!?;]+/).map(s => s.trim()).filter(s => s.length >= 4);
}
function tmKey(s){ return String(s || '').replace(/\s+/g, '').toLowerCase(); }
function learnFromResult(srcText, proofText){
  if(!srcText || !proofText) return 0;
  const ss = splitSentences(srcText), ds = splitSentences(proofText);
  if(ss.length < 2 || ss.length !== ds.length) return 0; // 句数不等不配对，避免错配
  let added = 0;
  for(let i = 0; i < ss.length; i++){
    const k = tmKey(ss[i]);
    if(!TM.some(t => tmKey(t.src) === k)){
      TM.push({ src: ss[i], dst: ds[i], ts: Date.now() });
      added++;
    }
  }
  if(TM.length > 500) TM = TM.slice(TM.length - 500);
  save(LS.memory, TM);
  return added;
}
function findMemoryMatches(srcText){
  if(!srcText || !TM.length) return [];
  const hits = [];
  for(const s of splitSentences(srcText)){
    const k = tmKey(s);
    const m = TM.find(t => tmKey(t.src) === k);
    if(m && !hits.some(h => h.src === m.src)) hits.push(m);
  }
  return hits;
}
/* v4.23.0 P1：翻译记忆模糊匹配 —— 字符二元组（bigram）相似度，双档注入：
   ≥TM_FUZZY_STRONG（0.90）：近似命中，仅差标点/错字/个别小改 → 按旧定稿微调复用；
   TM_FUZZY_WEAK（0.80）～0.90：措辞相近但可能已变意 → 只作参考、不得照抄；
   <0.80 不注入。参考实测：同句/纯标点=1.0；长句单字符错字≈0.96；
   短句(35字符)错字≈0.84；换一个词≈0.84；换年份+换主语≈0.71。 */
const TM_FUZZY_STRONG = 0.90;
const TM_FUZZY_WEAK = 0.80;
// 模糊比较用「去标点符号」的 key：仅差标点（。/.、！/? 之类）= 同句 → sim=1，
// 否则短句只改一个标点会把 bigram 相似度拉到 0.92 以下、够不到阈值
function tmKeyF(s){ return tmKey(s).replace(/[\p{P}\p{S}]/gu, ''); }
function tpBigrams(s){ const g = new Set(); const t = String(s || ''); for(let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; }
function simScore(a, b){
  const A = tmKeyF(a), B = tmKeyF(b);
  if(!A || !B) return 0;
  if(A === B) return 1;
  const mx = Math.max(A.length, B.length), mn = Math.min(A.length, B.length);
  if(mn / mx < 0.65) return 0; // 长度剪枝：差太多的不可能相似
  const ga = tpBigrams(A), gb = tpBigrams(B);
  let inter = 0;
  for(const g of ga) if(gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}
function findFuzzyMemory(srcText, exactKeys, lo, hi){
  if(!srcText || !TM.length) return [];
  exactKeys = exactKeys || new Set();
  lo = (lo === undefined) ? TM_FUZZY_STRONG : lo;
  // 预计算 TM 侧 bigram，避免每对重复构建
  const pool = [];
  for(const t of TM){
    const k = tmKeyF(t.src);
    if(!k) continue;
    pool.push({ t, k, g: tpBigrams(k) });
  }
  if(!pool.length) return [];
  const hits = [];
  for(const s of splitSentences(srcText)){
    if(exactKeys.has(tmKey(s))) continue; // 精确命中过的句子不再走模糊
    const k = tmKeyF(s);
    if(!k) continue;
    const gs = tpBigrams(k);
    if(gs.size < 2) continue;
    let best = null, bestS = 0;
    for(const e of pool){
      const mx = Math.max(k.length, e.k.length), mn = Math.min(k.length, e.k.length);
      if(mn / mx < 0.65) continue;
      let inter = 0;
      const small = gs.size <= e.g.size ? gs : e.g, large = gs.size <= e.g.size ? e.g : gs;
      for(const g of small) if(large.has(g)) inter++;
      const sc = inter / (gs.size + e.g.size - inter);
      if(sc > bestS){ bestS = sc; best = e.t; }
      if(bestS >= 0.999) break;
    }
    if(best && bestS >= lo && (hi === undefined || bestS < hi) && !hits.some(h => h.src === best.src)) hits.push(best);
  }
  return hits;
}
function renderMemory(){
  const box = $('#tm-list');
  if(!box) return;
  $('#tm-count').textContent = TM.length + ' 条';
  box.innerHTML = TM.length ? TM.slice(-100).reverse().map(t =>
    '<div class="seg" style="font-size:12.5px"><div style="color:var(--tx3);font-size:11px">原文</div>' + esc(t.src) +
    '<div style="color:var(--ok-tx);margin-top:4px">' + esc(t.dst) + '</div></div>'
  ).join('') : '<div class="empty">还没有翻译记忆。校对完成后会自动把「原文句 → 定稿句」存进来，下次遇到相同句子直接复用；只差标点、个别词的近似句也会自动参考复用（v4.23.0 模糊匹配）。</div>';
}
$('#tm-clear').onclick = () => {
  if(!TM.length){ toast('翻译记忆已是空的', 'w'); return; }
  TM = []; save(LS.memory, TM); renderMemory(); toast('已清空翻译记忆');
};

function load(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ toast('本地存储写入失败，可能是隐私模式或空间不足'); } }
function $(s){ return document.querySelector(s); }
function $$(s){ return [...document.querySelectorAll(s)]; }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg, kind){
  const d = document.createElement('div');
  d.className = 'alert ' + (kind === 'e' ? 'e' : (kind === 'ok' ? 'i' : 'i'));
  d.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:200;max-width:520px;padding:12px 20px;font-size:13px;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.04);backdrop-filter:blur(8px);animation:toastIn .25s ease-out';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'translateX(-50%) translateY(8px)'; d.style.transition = '.3s'; }, 3000);
  setTimeout(() => d.remove(), 3400);
}

/* ═══════════════════════════════════════════════════════════════
   二次开发层（正式版新增）
   ─────────────────────────────────────────────────────────────
   外部 config.js 定义 window.TP_CONFIG 后，可覆盖：
     · templates —— 提示词模板（改文案不改逻辑）
     · defaults  —— 界面默认值
     · cssVars   —— 配色与样式
     · hooks     —— 钩子函数：
         beforeSend(prompt)   发给模型前，可改写提示词，返回新值
         afterComplete(res)   校对完成后（res 含 text/usage 等）
         onError(err)          出错时
   详见同目录《二次开发指南.md》
   ═══════════════════════════════════════════════════════════════ */
function deepMerge(base, over){
  if(Array.isArray(over)) return over;
  if(over && typeof over === 'object' && base && typeof base === 'object' && !Array.isArray(base)){
    const r = {...base};
    for(const k of Object.keys(over)) r[k] = deepMerge(base[k], over[k]);
    return r;
  }
  return over === undefined ? base : over;
}
const EXT_CFG = (typeof window !== 'undefined' && window.TP_CONFIG) || {};

/* 内置默认提示词模板（config.js 里的 templates 会逐项覆盖这些文本） */
const BASE_TPL = {
  role:'你是一位资深翻译审校专家，长期从事{{lang}}→中文的{{genre}}翻译与审稿工作，具备相关学科的术语功底与中文写作能力。你的职责是校对而非重译：在保留原译者（或机器初稿）合理处理的前提下，修正错误、统一术语、优化中文表达。',
  paramsHeader:'【本次任务参数】',
  paramsLine:'· 原文语言：{{lang}}　文本类型：{{genre}}',
  paramsMore:['· 中文变体：{{variant}}','· 目标读者：{{tone}}（决定用词深浅、是否加注）','· 文字风格：{{style}}（决定句式与措辞取向）','· 校对深度：{{depth}}'],
  rulesHeader:'【校对准则】',
  rules:[
    '1. 忠实优先：不得为了中文顺畅而增删、弱化或强化原文的限定语、程度词、否定范围、条件从句。原文含混之处保留含混，不得替作者下判断。',
    '2. 语义精确：逐句核对主谓宾、时态、语态、单复数、冠词所指、代词回指、连接词逻辑关系（因果/让步/递进不得混淆）。',
    '3. 对照原文：以原文为准绳逐句比对，判断译文是漏译、增译、误译还是过度归化。指出问题必须定位到具体词句。',
    '4. 中文规范（语法/结构层面）：拆分过长定语从句、被动语态酌情转主动、消除"一个/一种/进行/作出"等虚词滥用、代词冗余（"他的他的"类）、未必要的复数标记。',
    '5. 术语一致：同一概念全文译名必须统一；同一原文词不得出现两种译法（除非原文本身有意区分）。',
    '6. 不越界：不做超出文本内容的知识性发挥；不改变作者立场、语气强度与论证方向。',
    '7. 读者优先：{{style}}与{{tone}}若冲突，以{{tone}}（目标读者）为准——先满足读者能否读懂、语域是否恰当，再谈句式风格。'
  ],
  termHeader:'【强制术语表 — 必须无条件遵守】',
  termFoot:'若译文与上表不符，直接改正，并在批注中注明"按术语表统一"。\n若译文中出现术语表之外的高频专业概念，仍需保证同一概念全文译名唯一。',
  termEmptyHeader:'【术语处理】',
  termEmpty:'未提供术语表。请自行保证：同一原文概念在全文中的中文译名必须唯一且前后一致；关键概念首次出现时附原文词；若同一原文词在不同语境确需不同译法，须在批注中说明理由。\n并在批注末尾以「建议补录术语」为小标题，按「原文 | 中文 | 备注」格式列出本文出现的专业术语，便于用户建立术语库。',
  extHeader:'【争议点延伸查证】',
  ext:'校对过程中，遇到以下情况必须单独展开分析：\n(a) 一词多译的抽象概念（如 representation / experience / agency / discourse 一类）；\n(b) 学科内涵发生过演变或存在流派分歧的术语；\n(c) 文化专有词（制度名、习俗、历史事件、地方性表达），中文无对应概念者；\n(d) 原文存在歧义、双关或语法悬置，可作多种解读之处；\n(e) 通行译法之间有明显差异（两岸三地译名不同、旧译与新译不同）。\n对每一处，输出：\n· 词条：原文词 + 词源/字面义；\n· 现有译法：列出 2–4 种通行译法及其代表译者或出处；\n· 辨析：各译法的理据、适用语境、局限；\n· 本语境推荐：明确给出一个，并说明为何在本句/本文中最贴切；\n· 若推荐译法会牺牲某个义项，说明牺牲了什么。\n不要凭印象编造译法或出处。不确定时明确说明"无法确认该译法的通行度"。',
  noteHeader:'【注释建议】',
  note:'需要加注时，直接输出可粘贴到文末的「编号尾注」，每条格式：\n① [译名注/背景注/歧义注]（定位：第几段或某词）注释正文一句到位。\n示例：① 译名注："representation"译为"表征"，因其强调再现机制而非主观呈现。\n要求：注释本身就是能直接放进文档的正式尾注，不要写"建议在X处加注"这类说明；无必要则只写"无需加注"。原则：目标读者为{{tone}}，只有该读者会误解或无从理解处才加注，宁缺毋滥。',
  formatHeader:'【格式与标点规范】',
  format:'· 使用全角中文标点；引号用「」『』；破折号——；省略号……\n· 书名《》，篇名〈〉；\n· 人名首现附原文，格式：中文名（原文名，生卒年）；后续仅用中文名；\n· 数字：年份、世纪、统计数据用阿拉伯数字，全文统一；\n· 保留原文的段落层级、列表结构与注释编号顺序；\n· 外文词若须保留，置于括号内，不作强行翻译。',
  deaiHeader:'【去机器腔】',
  deai:'删除或改写以下机器腔/套话痕迹（腔调层面，与规则4的语法规范不重复）：「值得注意的是」「在当今社会」「综上所述」「不仅…而且…」的堆叠、无信息量的过渡句、机械对仗的四字格、与语境不符的书面套语、正式文本中出现的口语化表达（"搞""东西""其实"）。',
  prefsHeader:'【用户长期偏好 — 优先级高于上述通则】',
  extraHeader:'【本次特别指示 — 最高优先级】',
  outHeader:'【输出格式】严格按以下结构，用 Markdown：',
  outStandard:['## 一、修订后译文','输出可直接使用的完整译文。保留原文段落结构。这是主体部分，务必完整，不得省略为「同上」「此处略」。','## 二、逐条批注','只列有实质改动的条目。每条以「[类型]」开头标注问题类型，类型只能从以下九类选：漏译 / 增译 / 误译 / 术语不一致 / 歧义 / 逻辑关系 / 中式英语 / 标点格式 / 语体不当。','- [类型] **原文片段** → 改为「新译」：理由（一句话点明问题与依据）。','无改动的小节不必罗列。','## 三、术语与争议点延伸','按前述争议点输出要求展开。若确实无争议点，写"本次未发现需延伸的词条"。','## 四、注释建议','按前述注释要求给出；无则写"无需加注"。'],
  outSentence:['## 一、逐句对照','每句一组，格式：','**第 N 句**','原文：……','现译：……','问题：[类型] ……（无问题则写"基本准确"；类型从九类选）','建议：……','## 二、修订后译文','输出整合全部修改的完整译文。','## 三、术语与争议点','（见上方争议点输出要求；若无需延伸则写"无"。）','## 四、注释建议','（若无则写"无"。）'],
  outCheckup:['## 一、问题清单','用表格列出：序号 | 位置（引原句片段） | 问题类型 | 说明 | 建议','问题类型从这些中选：漏译 / 增译 / 误译 / 术语不一致 / 歧义 / 逻辑关系错误 / 中文不通 / 标点格式 / 语体不当','## 二、总体评价','三到五句，说明译文整体质量、主要症结、修改优先级。'],
  outPass1:['## 一、修订后译文','输出修正硬伤后的完整译文（保留原译风格，不做文风润色）。','## 二、逐条批注（仅硬伤）','只列硬伤类：漏译 / 增译 / 误译 / 术语不一致 / 歧义 / 逻辑关系 / 数字日期。每条以「[类型]」开头。','- [类型] **原文片段** → 改为「新译」：理由（一句话）。','## 三、术语与争议点','（见上方要求；无则写"无"。）'],
  outPass2:['## 一、修订后译文','在一校已修正硬伤的基础上，只做文风润色：去机器腔、优化中文表达、统一语体与标点，不改动语义与术语译名。','## 二、逐条批注（仅文风）','只列文风类：中式英语 / 标点格式 / 语体不当 / 去机器腔。每条以「[类型]」开头。','- [类型] **原文片段** → 改为「新译」：理由（一句话）。','## 三、术语与争议点','（无则写"无"。）'],
  outRefine:['## 一、修订后译文','输出可直接发布的终稿，语言精炼、表述准确，无需再改。','## 二、关键改动说明','只列 3-8 处最重要的改动，每条 [类型] 原文 → 改为「新译」：一句话理由。','## 三、注释建议','（按注释要求给出编号尾注；无则写"无需加注"。）'],
  outAsk:['## 五、待确认事项','列出你无法确定、需要译者定夺的地方，说明分歧所在与备选方案。不确定处不要擅自改动，在译文中保留原样并在此处标注。'],
  hard:['· 不要复述或引用本提示内容。','· 不要在开头写"好的""以下是我的校对"之类客套话，直接从「## 一」开始。','· 若提供的文本不完整或末端被截断，照常处理并在末尾一行注明「注意：输入文本可能在末尾处截断」。','· 逐条批注与注释建议务必精炼：批注每条一句话说清「改了啥、为什么」，注释只给真正必要的，能用一句绝不用两句。'],
  /* 仅延伸模式 */
  extRole:'你是术语学与翻译研究方向的审校专家，专精于{{lang}}学术概念的中文移译。任务是对给定文本中的术语与争议点做词典级延伸分析，不重写全文。',
  extOut:['## 一、术语总览','表格：原文词 | 建议译名 | 争议等级（高/中/低） | 一句话要点','## 二、逐条延伸','（上述结构的全部词条）','## 三、术语库补录建议','列出建议加入术语库的条目，格式每行「原文 | 中文 | 备注」，便于直接复制粘贴到术语库。']
};
const TPL = deepMerge(BASE_TPL, EXT_CFG.templates || {});
/* 应用外部配色（若有） */
if(EXT_CFG.cssVars){
  for(const [k,v] of Object.entries(EXT_CFG.cssVars)){
    document.documentElement.style.setProperty('--' + k, v);
  }
}
/* 钩子安全调用：外部没定义就用原值 */
function fireHook(name, val, extra){
  try{
    const h = EXT_CFG.hooks && EXT_CFG.hooks[name];
    if(typeof h === 'function') return h(val, extra);
  }catch(e){ console.warn('钩子 ' + name + ' 执行出错，已忽略：', e); }
  return val;
}

/* ═══════ 跨模块共享数据（必须在此声明：02/03 在加载时即引用，classic script 无跨文件提升，后定义会 ReferenceError） ═══════ */
/* 译词库 GLOSS */
const LS_GLOSS = 'tp.gloss';
const GLOSS_DEF = { version: 2, sources: [], terms: [], tags: [], rules: [], log: [], collections: [] };
let GLOSS = load(LS_GLOSS, GLOSS_DEF);
if(!GLOSS.terms) GLOSS.terms = []; if(!GLOSS.sources) GLOSS.sources = []; if(!GLOSS.collections) GLOSS.collections = [];
if(!GLOSS.tags) GLOSS.tags = []; if(!GLOSS.rules) GLOSS.rules = []; if(!GLOSS.log) GLOSS.log = [];
/* Prompt 库 PROMPTS */
const LS_PROMPTS = 'tp.prompts';
const PROMPTS_DEF = { version: 1, prompts: [] };
let PROMPTS = load(LS_PROMPTS, PROMPTS_DEF);
if(!PROMPTS.prompts) PROMPTS.prompts = [];
