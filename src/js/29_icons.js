// =====================================================================
//  ICONS — встроенные SVG-иконки (не зависят от emoji-шрифтов системы).
//  Моды: ITEMS[id].svg = '<svg…>' или .iconUrl = 'картинка.png';
//  иначе используется .icon (emoji / текст).
// =====================================================================
const ICON_SVG = (() => {
  const S = (body) => `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
  const O = 'stroke="#1a140a" stroke-width="1.6"';
  return {
    almond: S(`<rect x="10" y="9" width="12" height="19" rx="3" fill="#f2e6c4" ${O}/><rect x="12.5" y="4" width="7" height="5" rx="1" fill="#c9b27a" ${O}/><rect x="10" y="15" width="12" height="6" fill="#c98f4a" opacity=".85"/><ellipse cx="16" cy="18" rx="2.2" ry="1.6" fill="#7a4a1e"/>`),
    water: S(`<path d="M12 7h8l2 4v15a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V11z" fill="#9fd0e4" ${O}/><rect x="13" y="3" width="6" height="4" rx="1" fill="#3b78c4" ${O}/><path d="M10 15h12M10 21h12" stroke="#5f9fbf" stroke-width="1.4"/><path d="M13 13v10" stroke="#e8f8ff" stroke-width="1.6" opacity=".8"/>`),
    bar: S(`<g transform="rotate(-25 16 16)"><rect x="5" y="11" width="22" height="10" rx="1.5" fill="#7a3a22" ${O}/><rect x="13" y="11" width="14" height="10" fill="#c23a2e" ${O}/><path d="M16 13.5h8M16 18.5h8" stroke="#f3d77a" stroke-width="1.4"/><path d="M8 13v6M10.5 13v6" stroke="#4e2414" stroke-width="1.2"/></g>`),
    can: S(`<ellipse cx="16" cy="9" rx="8" ry="3" fill="#c8c8c8" ${O}/><path d="M8 9v14c0 1.7 3.6 3 8 3s8-1.3 8-3V9" fill="#a0a0a0" ${O}/><path d="M8 14c0 1.7 3.6 3 8 3s8-1.3 8-3v5c0 1.7-3.6 3-8 3s-8-1.3-8-3z" fill="#b8664a"/><ellipse cx="16" cy="9" rx="5" ry="1.5" fill="none" stroke="#7a7a7a" stroke-width="1"/>`),
    pills: S(`<rect x="7" y="13" width="18" height="12" rx="2" fill="#e8e8f0" ${O}/><rect x="9" y="7" width="14" height="6" rx="1.5" fill="#d84f4f" ${O}/><rect x="11" y="16" width="10" height="6" rx="1" fill="#fff" stroke="#8aa0c8" stroke-width="1"/><path d="M16 17v4M14 19h4" stroke="#d84f4f" stroke-width="1.6"/>`),
    energy: S(`<rect x="10" y="6" width="12" height="21" rx="2.5" fill="#3a8a4a" ${O}/><rect x="11.5" y="4" width="9" height="3" rx="1" fill="#b8b8b8" ${O}/><path d="M17.5 10l-4 7h3l-2 6 5-8h-3l2-5z" fill="#e8f060" stroke="#1a140a" stroke-width=".9"/>`),
    battery: S(`<rect x="5" y="11" width="20" height="10" rx="2" fill="#2b2b2b" ${O}/><rect x="25" y="13.5" width="3" height="5" rx="1" fill="#c8a040" ${O}/><rect x="7" y="13" width="9" height="6" rx="1" fill="#e6b84a"/><path d="M19 16h4M21 14v4" stroke="#e8e0c0" stroke-width="1.4"/>`),
    chalk: S(`<g transform="rotate(-35 16 16)"><rect x="6" y="12.5" width="20" height="7" rx="3" fill="#f4f2ea" ${O}/><path d="M22 12.5v7" stroke="#cfcab8" stroke-width="1.2"/></g><path d="M6 27c3-2 6-2 9 0" stroke="#e8e4d4" stroke-width="1.6" fill="none"/>`),
    panel: S(`<path d="M5 9l14-4 8 4-14 4z" fill="#ece6d2" ${O}/><path d="M5 9v14l8 4V13z" fill="#bdb6a0" ${O}/><path d="M13 13l14-4v14l-14 4z" fill="#d2cdbb" ${O}/><path d="M17 15v9M22 13.5v9" stroke="#b0a890" stroke-width="1"/>`),
    plank: S(`<g transform="rotate(-20 16 16)"><rect x="3" y="9" width="26" height="6" rx="1" fill="#b48a52" ${O}/><rect x="3" y="17" width="26" height="6" rx="1" fill="#9a7040" ${O}/><path d="M7 12h7M18 11.5h6M6 20h5M15 20.5h9" stroke="#6e4c26" stroke-width="1"/><circle cx="23" cy="20" r="1" fill="#6e4c26"/></g>`),
    cloth: S(`<path d="M6 10c4-3 8 1 10-1s7-3 10 1v13c-3-3-7-1-10 0s-6 3-10-1z" fill="#6a7184" ${O}/><path d="M9 13c3-1 5 1 7 0s5-2 7 0M9 18c3-1 5 1 7 0s5-2 7 0" stroke="#9aa0b4" stroke-width="1.2" fill="none"/>`),
    wire: S(`<ellipse cx="16" cy="17" rx="9" ry="7" fill="none" stroke="#1a140a" stroke-width="5"/><ellipse cx="16" cy="17" rx="9" ry="7" fill="none" stroke="#c8402e" stroke-width="2.6"/><ellipse cx="16" cy="17" rx="5" ry="3.6" fill="none" stroke="#c8402e" stroke-width="2"/><path d="M24 12l4-5" stroke="#d8a040" stroke-width="2.4"/>`),
    bulb: S(`<path d="M16 4a8 8 0 0 0-5 14.2c1 .9 1.6 2 1.6 3.3V23h6.8v-1.5c0-1.3.6-2.4 1.6-3.3A8 8 0 0 0 16 4z" fill="#fff4c0" ${O}/><rect x="12.5" y="23" width="7" height="5" rx="1" fill="#a0a0a0" ${O}/><path d="M14 16l2-3 2 3" stroke="#d0a030" stroke-width="1.3" fill="none"/><path d="M12.5 25.5h7" stroke="#6a6a6a" stroke-width="1"/>`),
    note: S(`<path d="M8 4h12l5 5v19H8z" fill="#e8e0c8" ${O}/><path d="M20 4v5h5" fill="#cfc4a4" ${O}/><path d="M11 13h10M11 17h10M11 21h7" stroke="#5a5a8a" stroke-width="1.3"/>`),
    scrap: S(`<path d="M6 20l6-9 5 3 4-6 5 4-3 10-9 3z" fill="#8a8c88" ${O}/><circle cx="12" cy="18" r="1.6" fill="#4a4a48"/><circle cx="20" cy="15" r="1.6" fill="#4a4a48"/><path d="M14 22l6-1" stroke="#5a5a58" stroke-width="1.2"/>`),
    fuel: S(`<path d="M8 9h14l3 3v15H8z" fill="#c23a2e" ${O}/><rect x="10" y="4" width="8" height="5" rx="1" fill="#8a2a20" ${O}/><path d="M11 14l9 9M20 14l-9 9" stroke="#f3d77a" stroke-width="1.6"/>`),
    bandage: S(`<g transform="rotate(-40 16 16)"><rect x="4" y="11" width="24" height="10" rx="5" fill="#f0dcc0" ${O}/><rect x="12" y="11" width="8" height="10" fill="#fff"/><circle cx="14.5" cy="14" r=".8" fill="#c8a080"/><circle cx="17.5" cy="18" r=".8" fill="#c8a080"/></g>`),
    filter: S(`<ellipse cx="16" cy="9" rx="9" ry="3.5" fill="#e8e0c8" ${O}/><path d="M7 9v13c0 2 4 3.5 9 3.5s9-1.5 9-3.5V9" fill="#d8d0b8" ${O}/><path d="M10 13v10M14 14v10M18 14v10M22 13v10" stroke="#a8a088" stroke-width="1"/>`),
    circuit: S(`<rect x="5" y="7" width="22" height="18" rx="1.5" fill="#2e7a4a" ${O}/><rect x="12" y="12" width="8" height="8" fill="#1a1a1a" stroke="#c8c8c8" stroke-width=".8"/><path d="M7 11h5M7 21h5M20 11h5M20 21h5M16 9v3M16 20v3" stroke="#e8c060" stroke-width="1.3"/>`),
    flash: S(`<path d="M6 13h11l4-4h4v14h-4l-4-4H6z" fill="#3a3a38" ${O}/><path d="M25 11l4-2M25 16h4M25 21l4 2" stroke="#f3d77a" stroke-width="1.6"/>`),
    wobj: S(`<circle cx="16" cy="16" r="10" fill="none" stroke="#f3d77a" stroke-width="2"/>`),
  };
})();
function iconHtml(id, cls = 'ico') {
  const d = ITEMS[id];
  if (d?.svg) return `<span class="${cls}">${d.svg}</span>`;
  if (d?.iconUrl) return `<span class="${cls}"><img src="${esc(d.iconUrl)}" alt=""></span>`;
  if (ICON_SVG[id] && !d?.iconOverride) return `<span class="${cls}">${ICON_SVG[id]}</span>`;
  return `<span class="${cls} emo">${esc(d?.icon || '?')}</span>`;
}
