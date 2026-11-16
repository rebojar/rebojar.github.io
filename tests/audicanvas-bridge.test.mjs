import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const script = readFileSync(new URL('../assets/audicanvas-bridge.js', import.meta.url), 'utf8');

function setup() {
  const listeners = new Map();
  const messages = [];
  const button = {
    checked: 'true',
    getAttribute() { return this.checked; },
    matches(selector) { return selector === '.controle-som-site'; },
    click() { this.checked = this.checked === 'true' ? 'false' : 'true'; dispatch('click', { target: { closest: (selector) => selector === 'a[href]' ? null : button } }); },
  };
  const link = { href: 'https://rebojar.github.io/audicanvas/', target: '', title: '' };
  class Channel {
    postMessage(message) { messages.push(message); }
  }
  const channel = new Channel();
  const document = {
    readyState: 'complete',
    addEventListener(type, listener) { const group = listeners.get(type) ?? []; group.push(listener); listeners.set(type, group); },
    querySelector() { return button; },
  };
  function dispatch(type, event) { for (const listener of listeners.get(type) ?? []) listener(event); }
  const window = { name: '', RebojarSom: { definirAtivo(value) { button.checked = String(value); } } };
  runInNewContext(script, { document, window, BroadcastChannel: class { constructor() { return channel; } }, queueMicrotask });
  return { button, link, window, channel, messages, dispatch };
}

test('fone conserva o portal e reutiliza uma guia de áudio', () => {
  const app = setup();
  app.dispatch('click', { target: { closest: (selector) => selector === 'a[href]' ? app.link : null } });
  assert.equal(app.window.name, 'rebojar-portal');
  assert.equal(app.link.target, 'rebojar-audicanvas');
});

test('controle da página silencia a cena e a resposta sincroniza o estado', async () => {
  const app = setup();
  app.button.checked = 'false';
  app.dispatch('click', { target: { closest: (selector) => selector === 'a[href]' ? null : app.button } });
  await Promise.resolve();
  assert.equal(app.messages.at(-1).muted, true);
  app.channel.onmessage({ data: { type: 'player-state', playing: true, muted: false } });
  assert.equal(app.button.checked, 'true');
});
