/* ═══════════ T-017 错误回流 · 一键升为规则（v4.45.0）═══════════
   批注卡「升为术语 / 升为禁用 / 升为文风规则」三按钮背后的逻辑。
   术语/禁用 → GLOSS.terms（saveGloss）；文风规则 → PREFS（下次 buildSystem 自动附带）。 */
(function(){
  'use strict';
  const EF_SOURCE = 's-err-feedback';
  function efEnsureSource(){
    if(!GLOSS.sources || !GLOSS.sources.some(function(s){ return s && s.id === EF_SOURCE; })){
      GLOSS.sources = GLOSS.sources || [];
      GLOSS.sources.push({ id: EF_SOURCE, name: '错误回流', kind: 'feedback', date: new Date().toISOString(), count: 0 });
    }
  }
  function efAddTag(hit){
    hit.tags = hit.tags || [];
    if(hit.tags.indexOf('错误回流') < 0) hit.tags.push('错误回流');
    if(hit.sources.indexOf(EF_SOURCE) < 0) hit.sources.push(EF_SOURCE);
  }
  function efNote(hit, reason){
    if(reason && (hit.note || '').indexOf(reason) < 0){
      hit.note = (hit.note ? hit.note + '；' : '') + reason;
    }
  }
  function efPromoteTerm(a){
    if(!a || !a.frag || !a.fix){ toast('这条批注缺原文或新译，无法升为术语', 'w'); return false; }
    const from = normText(a.frag), to = normText(a.fix);
    if(!from || !to){ toast('这条批注缺原文或新译', 'w'); return false; }
    efEnsureSource();
    const fk = fKey(from);
    let hit = (GLOSS.terms || []).find(function(t){ return t && t.foreign && fKey(t.foreign) === fk; });
    if(hit){
      if(hit.status === 'confirmed' && hit.zh !== to){
        hit.aliases = hit.aliases || [];
        if(hit.aliases.indexOf(to) < 0) hit.aliases.push(to);
      } else {
        hit.zh = to; hit.status = 'confirmed'; hit.recommend = 'rec';
      }
      efNote(hit, a.reason); efAddTag(hit); hit.updated = Date.now();
    } else {
      GLOSS.terms.push({ id: GID++, zh: to, foreign: from, aliases: [], type: guessType(to, from),
        tags: ['错误回流'], note: a.reason || '', sources: [EF_SOURCE], occurrences: [],
        collections: [], status: 'confirmed', recommend: 'rec', url: '', created: Date.now(), updated: Date.now() });
    }
    saveGloss(); glossLog('feedback', 'term:' + from, null, { to: to, reason: a.reason });
    if(typeof renderGloss === 'function') renderGloss();
    toast('已升为术语 ✓ 「' + from + '」→「' + to + '」');
    return true;
  }
  function efPromoteBan(a){
    if(!a || !a.frag){ toast('这条批注缺原文', 'w'); return false; }
    const from = normText(a.frag), to = normText(a.fix || '');
    efEnsureSource();
    const fk = fKey(from);
    let hit = (GLOSS.terms || []).find(function(t){ return t && t.foreign && fKey(t.foreign) === fk; });
    if(hit){
      hit.status = 'rejected'; hit.recommend = 'ban';
      if(to) hit.zh = to;
      efNote(hit, a.reason); efAddTag(hit); hit.updated = Date.now();
    } else {
      GLOSS.terms.push({ id: GID++, zh: to, foreign: from, aliases: [], type: guessType(to, from),
        tags: ['错误回流'], note: a.reason || '', sources: [EF_SOURCE], occurrences: [],
        collections: [], status: 'rejected', recommend: 'ban', url: '', created: Date.now(), updated: Date.now() });
    }
    saveGloss(); glossLog('feedback', 'ban:' + from, null, { to: to, reason: a.reason });
    if(typeof renderGloss === 'function') renderGloss();
    toast('已升为禁用 ✕ 「' + from + '」' + (to ? '（应译为「' + to + '」）' : ''));
    return true;
  }
  function efPromoteStyle(a){
    if(!a || (!a.reason && !a.fix)){ toast('这条批注缺规则内容', 'w'); return false; }
    const rule = normText(a.reason || (a.frag + ' → ' + a.fix));
    if(!rule){ toast('这条批注缺规则内容', 'w'); return false; }
    if(String(PREFS || '').indexOf(rule) >= 0){ toast('这条规则已在文风偏好里', 'w'); return false; }
    PREFS = (String(PREFS || '').trim() ? PREFS.trim() + String.fromCharCode(10) : '') + rule;
    save(LS.prefs, PREFS);
    const el = $('#prefs'); if(el) el.value = PREFS;
    toast('已升为文风规则 ✓（下次请求自动附带）');
    return true;
  }
  window.efPromoteTerm = efPromoteTerm;
  window.efPromoteBan = efPromoteBan;
  window.efPromoteStyle = efPromoteStyle;
})();