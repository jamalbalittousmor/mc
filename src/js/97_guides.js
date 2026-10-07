// =====================================================================
//  GUIDES — руководства открываются при первом знакомстве с механикой
// =====================================================================
const GuideT = { dark: 0, t: 0 };
const guide = id => { if (game.started) unlockNote(id); };
bus.on('inventory:changed', () => { if (game.playT > 2) guide('g_inventory'); });
bus.on('build:placed', () => guide('g_build'));
bus.on('shelter:enter', () => guide('g_shelter'));
bus.on('director:event', () => { if (game.playT > 60) guide('g_events'); });
Mods.on('craft', () => guide('g_craft'));
Mods.on('quest:done', q => { if (q.id === 'q_salvage') guide('g_salvage'); if (q.id === 'q_power') guide('g_power'); });
setInterval(() => {
  if (!game.started || game.state !== 'play') return;
  const st = player.st;
  if (game.playT > 4) guide('g_start');
  if (game.playT > 240) guide('g_escape');
  GuideT.dark = player.lightLevel < BAL.darkLevel ? GuideT.dark + 1 : 0; if (GuideT.dark > 4) guide('g_dark');
  if (st.sanity < 55) guide('g_sanity');
  if (st.thirst < 45) guide('g_water');
  if (st.hunger < 45) guide('g_food');
  if (st.energy < 45) guide('g_sleep');
  if (zoneAt(camera.position.x, camera.position.z).key === 'pools') guide('g_pools');
  if (build.on) guide('g_build');
}, 1000);
