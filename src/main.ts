// Entry point. Rapier ships as WASM and needs an async init, so the whole
// bootstrap is awaited before the first frame.

import './style.css';
import { Game } from './game/Game';

async function boot(): Promise<void> {
  const game = new Game();
  await game.init();
  game.start();
}

boot().catch((err) => {
  console.error('Spin Arena failed to start:', err);
  const root = document.getElementById('ui-root');
  if (root) {
    root.innerHTML = `<div style="position:absolute;inset:0;display:flex;
      align-items:center;justify-content:center;text-align:center;padding:24px;
      color:#e8ecff;font-family:system-ui,sans-serif;">
      <div><h2>Spin Arena failed to start</h2>
      <p style="color:#8b93bd;margin-top:8px;">${String(err)}</p></div></div>`;
  }
});
