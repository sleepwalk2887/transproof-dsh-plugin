/**
 * 译校助手 TransProof —— DSH 插件薄壳客户端（原型）。
 *
 * 关键结论（本原型要证明的事）：
 *   DSH 插件的「页面入口」是一个 React 组件，经 window.__ModuleLoader__.load()
 *   的 factory(require) 注入 require('react')，再用 ctx.slots 注册到 main 槽。
 *   —— 所以纯 HTML/JS 不能「裸」当入口，但套一层薄壳（这里用 <iframe> 承载
 *      现有 TransProof 网页）就能进，核心 13 个 js 一行不改。
 *
 * 契约来自 coldgust/dsh-translation-assistant 的真实 client.js（非编造）：
 *   window.__ModuleLoader__.load({ id, factory(require){ const React = require('react'); ... } })
 *   factory 返回 { inject: ['slots','locale'], apply(ctx){ ctx.slots.inject('main', ...) } }
 */

window.__ModuleLoader__.load({
  id: 'transproof-dsh-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'transproof';
    const PANEL_ID = 'transproof';
    // Host 侧静态服务提供的 TransProof 页面（host/index.js 用 webServer.register 提供）。
    // 现有 TransProof 的相对路径 js/xx.js 因此能正常加载，本地体检在 iframe 里照常跑、不联网。
    const APP_URL = '/dsh-transproof/app/index.html';

    /** 页面：一个 iframe 承载纯前端 TransProof —— 这就是「薄壳」。 */
    function TransProofPage() {
      return h('div', { style: { width: '100%', height: '100%', display: 'flex' } },
        h('iframe', {
          title: '译校助手 TransProof',
          src: APP_URL,
          style: { width: '100%', height: '100%', border: '0', background: '#fff' },
        }),
      );
    }

    /** 侧栏面板图标（点击进入主页面）。 */
    function TransProofPanelIcon() {
      return h('div', { style: { fontSize: '18px', lineHeight: 1 } }, '🈴');
    }

    // 极简字典（TA 用 locale.register(NS, {zh,en})；这里给最小可用集）。
    const zh = { panel: '译校助手', title: '译校助手 TransProof' };
    const en = { panel: 'TransProof', title: 'TransProof' };

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'transproof-dsh-plugin: dictionaries');
        const t = ctx.locale.bind(NS);
        // 主槽页面
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, TransProofPage));
        // 侧栏面板入口
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 21,
          locale: NS,
          label: () => t('panel'),
        }, TransProofPanelIcon));
      },
    };
  },
});
