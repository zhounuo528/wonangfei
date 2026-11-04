// Only real module/database initialization controls the loading screen.
// No minimum duration, fake progress, or extra waiting is added here.
const shell = document.getElementById('app-shell');
const screen = document.getElementById('boot-screen');
try {
  const { initialized } = await import('./app.mjs');
  await initialized;
  shell.inert = false;
  shell.setAttribute('aria-busy', 'false');
  document.body.classList.remove('app-loading');
  screen.hidden = true;
  document.documentElement.dataset.bootState = 'ready';
} catch {
  screen.dataset.state = 'error';
  document.getElementById('boot-copy').textContent = '页面暂时未能加载，请检查网络后重试。';
  const retry = document.getElementById('boot-retry');
  retry.hidden = false;
  retry.addEventListener('click', () => location.reload());
  document.documentElement.dataset.bootState = 'error';
}
