/* ═══════════ T-031 专名百科自动查证（v4.41.0）═══════════
   专名核验面板每行「🔎 查维基」→ 中英维基百科 action API（origin=*，纯前端直连）。
   带回：维基条目名（通行译名建议）+ 一段简介 + 真 URL；人工确认后才入词库。
   查不到 / 网络被拦：友好提示开代理或换渠道。不执行任何第三方脚本。 */
const WIKI_API_ZH = 'https://zh.wikipedia.org/w/api.php?origin=*&format=json&formatversion=2';
const WIKI_API_EN = 'https://en.wikipedia.org/w/api.php?origin=*&format=json&formatversion=2';

function wikiJson(url, ms){
  return new Promise((res, rej) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => { ctrl.abort(); rej(new Error('timeout')); }, ms || 15000);
    fetch(url, { signal: ctrl.signal }).then(r => {
      if(!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(j => { clearTimeout(to); res(j); }, e => { clearTimeout(to); rej(e); });
  });
}

function wikiCleanTitle(title){
  const t = String(title || '');
  let cut = t.length;
  const a = t.indexOf('（');
  const b = t.indexOf('(');
  if(a >= 0 && a < cut) cut = a;
  if(b >= 0 && b < cut) cut = b;
  return (cut > 0 ? t.slice(0, cut) : t).trim() || t;
}

async function wikiSearchTitle(api, q){
  const url = api + '&action=query&list=search&srlimit=3&srsearch=' + encodeURIComponent(q);
  const j = await wikiJson(url);
  return ((j.query && j.query.search) || []).map(h => h.title).filter(Boolean);
}

async function wikiExtract(api, title){
  const url = api + '&action=query&prop=extracts&exintro=1&explaintext=1&titles=' + encodeURIComponent(title);
  const j = await wikiJson(url);
  const pages = (j.query && j.query.pages) || [];
  return pages.length ? (pages[0].extract || '') : '';
}

async function gvWikiLookup(t){
  if(!t || !t.foreign){ toast('这条没有外文名，查不了维基', 'w'); return; }
  modal('🔎 维基查证 · ' + esc(t.foreign), '<div class="alert i" id="gv-wiki-msg"><span class="spin"></span> 正在查中英维基百科，最多 30 秒…</div>');
  try{
    let title = ''; let api = WIKI_API_ZH; let lang = 'zh';
    const zhHits = await wikiSearchTitle(WIKI_API_ZH, t.foreign);
    if(zhHits.length){ title = zhHits[0]; }
    else{
      const enHits = await wikiSearchTitle(WIKI_API_EN, t.foreign);
      if(enHits.length){ title = enHits[0]; api = WIKI_API_EN; lang = 'en'; }
    }
    if(!title){
      $('#gv-wiki-msg').innerHTML = '维基百科没找到「' + esc(t.foreign) + '」相关条目。' +
        '<br><br>可能原因：拼写不同 / 该专名在维基没有独立词条 / 网络被拦。' +
        '<br><br>💡 建议：<br>· 检查外文名拼写后重试；<br>· 点词条行「🔗 回填依据」手填真 URL；<br>· 网络问题请开代理或换渠道（Google Scholar / 百度学术 / CNKI）。';
      return;
    }
    let extract = '';
    try{ extract = await wikiExtract(api, title); }
    catch(e){ extract = ''; }
    const zhSuggest = (lang === 'zh') ? wikiCleanTitle(title) : title;
    const brief = extract ? extract.slice(0, 300) : '';
    const pageUrl = (lang === 'zh' ? 'https://zh.wikipedia.org/wiki/' : 'https://en.wikipedia.org/wiki/') + encodeURIComponent(title);
    const msg = $('#gv-wiki-msg');
    msg.className = 'alert i';
    msg.innerHTML =
      '<div style="font-size:14px;font-weight:600">' + esc(title) + ' <a href="' + esc(pageUrl) + '" target="_blank" rel="noopener" style="font-size:12px">打开真 URL ↗</a></div>' +
      '<div style="font-size:12.5px;margin-top:4px;color:var(--tx2)">建议译名：<b>' + esc(zhSuggest) + '</b>' + (lang === 'en' ? '（英文维基条目，请人工译成中文）' : '') + '</div>' +
      (brief ? '<div style="font-size:12px;margin-top:8px;color:var(--tx2);max-height:180px;overflow:auto">' + esc(brief) + '</div>' : '<div style="font-size:12px;margin-top:8px;color:var(--tx3)">（维基没有简介摘要）</div>') +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn pri sm" id="gv-wiki-adopt">✓ 采用这个译名 + 存依据</button>' +
        '<button class="btn gray sm" id="gv-wiki-urlonly">🔗 只存真 URL</button>' +
        '<button class="btn gray sm" id="gv-wiki-cancel">关闭</button>' +
      '</div>';
    const adopt = $('#gv-wiki-adopt');
    if(adopt) adopt.onclick = () => {
      t.zh = zhSuggest;
      t.url = pageUrl;
      t.brief = brief;
      if(!t.tags) t.tags = [];
      if(t.tags.indexOf('维基查证') < 0) t.tags.push('维基查证');
      saveGloss();
      glossLog('url', 'term:' + t.id, 'wiki', pageUrl);
      if(typeof renderGlossTable === 'function') renderGlossTable();
      if(typeof renderGvPanel === 'function') renderGvPanel();
      closeModal();
      toast('已写入译名与依据，批准后生效');
    };
    const urlOnly = $('#gv-wiki-urlonly');
    if(urlOnly) urlOnly.onclick = () => {
      t.url = pageUrl;
      saveGloss();
      glossLog('url', 'term:' + t.id, 'wiki-url', pageUrl);
      if(typeof renderGlossTable === 'function') renderGlossTable();
      if(typeof renderGvPanel === 'function') renderGvPanel();
      closeModal();
      toast('已回填真 URL');
    };
    const cancel = $('#gv-wiki-cancel');
    if(cancel) cancel.onclick = () => closeModal();
  }catch(e){
    const msg = $('#gv-wiki-msg');
    msg.innerHTML = '❌ 维基百科直连失败（' + esc(errMsg(e)) + '）。' +
      '<br><br>维基百科被网络或浏览器拦了。💡 建议：<br>· 打开代理（或换网络）后点「重试」；<br>· 或点词条行「🔗 回填依据」手填 URL；<br>· 或换渠道：Google Scholar / 百度学术 / CNKI（词库行 🔎 联网查证）。' +
      '<div style="margin-top:12px"><button class="btn sm" id="gv-wiki-retry">↻ 重试</button> <button class="btn gray sm" id="gv-wiki-cancel2">关闭</button></div>';
    const retry = $('#gv-wiki-retry');
    if(retry) retry.onclick = () => gvWikiLookup(t);
    const cancel2 = $('#gv-wiki-cancel2');
    if(cancel2) cancel2.onclick = () => closeModal();
  }
}

window.gvWikiLookup = gvWikiLookup;
window.wikiCleanTitle = wikiCleanTitle;
