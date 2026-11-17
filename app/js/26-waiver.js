/* ═══════════ 豁免登记（T-026）· v4.52.0 ═══════════
   · 译者有意不一致时留一条「豁免」记录（词条/专名/批注 + 理由），体检别再报。
   · 结构 {type:'term'|'noun'|'audit', key, reason, ts}；key 归一化后去空格小写匹配。 */
(function(){
  'use strict';
  const LS = 'tp.waiver';
  function wAll(){ try{ const a = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
  function wSave(a){ try{ localStorage.setItem(LS, JSON.stringify(a)); }catch(e){} }
  function wNorm(s){ return String(s || '').replace(/\s+/g, '').toLowerCase(); }
  function waiverCount(){ return wAll().length; }
  function waiverAll(){ return wAll(); }
  function waiverHas(type, key){
    const k = wNorm(key); if(!k) return false;
    return wAll().some(w => w.type === type && wNorm(w.key) === k);
  }
  function waiverAdd(type, key, reason){
    reason = String(reason || '').trim();
    if(!reason) return false;   /* 空理由禁止保存 */
    const a = wAll();
    a.push({ type: type, key: String(key || ''), reason: reason, ts: Date.now() });
    wSave(a);
    return true;
  }
  function waiverDel(idx){
    const a = wAll(); if(idx < 0 || idx >= a.length) return;
    a.splice(idx, 1); wSave(a);
  }
  function waiverPrompt(type, key, done){   /* 弹理由输入，保存后回调 */
    const label = { term:'术语', noun:'专名', audit:'批注' }[type] || '该项';
    const html = '<div style="font-size:13px;color:var(--tx2);line-height:1.9">登记「<b>' + esc(key) + '</b>」为有意豁免（' + label + '），体检将不再报它。<br>请写一句理由（为什么故意这么译）：</div>' +
      '<textarea id="wv-reason" rows="2" style="width:100%;margin-top:10px;font-size:14px" placeholder="例如：客户指定沿用旧译名"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="wv-save">保存豁免</button><button class="btn gray" id="wv-cancel">取消</button></div>';
    modal('📝 登记豁免', html);
    $('#wv-cancel').onclick = () => { closeModal(); };
    $('#wv-save').onclick = () => {
      const r = $('#wv-reason').value.trim();
      if(!r){ toast('请先写理由，空理由不能保存', 'e'); return; }
      if(!waiverAdd(type, key, r)){ toast('保存失败', 'e'); return; }
      closeModal(); toast('已登记豁免，体检将跳过它');
      if(typeof done === 'function') done();
    };
  }
  function waiverOpen(){   /* 查看/删除豁免列表 */
    const a = wAll();
    if(!a.length){ modal('📝 豁免登记', '<div class="alert i">还没有豁免记录。在术语库 / 专名核验 / 批注卡点「📝 豁免」即可登记。</div>'); return; }
    const TL = { term:'术语', noun:'专名', audit:'批注' };
    let html = '<div class="alert i" style="margin-bottom:10px">已豁免 <b>' + a.length + '</b> 条，体检将跳过这些项。</div>';
    a.forEach((w, i) => {
      html += '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;border:1px solid var(--bd);border-radius:var(--r);padding:8px 12px;margin-bottom:6px">' +
        '<div style="font-size:13px;line-height:1.6"><b>' + esc(TL[w.type] || w.type) + '</b> · ' + esc(w.key) + '<br><span style="color:var(--tx2)">理由：' + esc(w.reason) + ' · ' + new Date(w.ts).toLocaleString('zh-CN') + '</span></div>' +
        '<button class="btn gray sm" data-wv-del="' + i + '">删除</button></div>';
    });
    modal('📝 豁免登记', html);
    document.querySelectorAll('[data-wv-del]').forEach(b => {
      b.onclick = () => { waiverDel(+b.dataset.wvDel); waiverOpen(); };
    });
  }
  window.waiverCount = waiverCount;
  window.waiverAll = waiverAll;
  window.waiverHas = waiverHas;
  window.waiverAdd = waiverAdd;
  window.waiverPrompt = waiverPrompt;
  window.waiverOpen = waiverOpen;
})();
