/* Keeps one AUDICANVAS player tab available across Rebojar pages of this origin. */
(() => {
  const playerUrl = 'https://rebojar.github.io/audicanvas/';
  const channel = typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('rebojar-audicanvas-v1') : null;
  const soundSelector = '.controle-som-site, #somEfeitos, #somWidget, #somPorta';
  const soundButton = () => document.querySelector(soundSelector);
  let applyingPlayerState = false;

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || link.href !== playerUrl) return;
    window.name = 'rebojar-portal';
    link.target = 'rebojar-audicanvas';
    link.title = 'Abrir o AUDICANVAS em outra guia e manter o som ao navegar';
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target.closest(soundSelector);
    if (!button || applyingPlayerState) return;
    queueMicrotask(() => {
      channel?.postMessage({ type: 'set-muted', muted: button.getAttribute('aria-checked') !== 'true' });
    });
  });

  if (channel) {
    channel.onmessage = ({ data }) => {
      if (data?.type !== 'player-state' || !data.playing || typeof data.muted !== 'boolean') return;
      const button = soundButton();
      if (!button || button.getAttribute('aria-checked') === String(!data.muted)) return;
      applyingPlayerState = true;
      try {
        if (button.matches('.controle-som-site') && window.RebojarSom) {
          window.RebojarSom.definirAtivo(!data.muted);
        } else button.click();
      } finally { applyingPlayerState = false; }
    };
    const requestState = () => channel.postMessage({ type: 'request-state' });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', requestState, { once: true });
    else requestState();
  }
})();
