const VERSAO = "estojo-rebojar-v14-controles-direita";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./pagina.min.css?v=20261116-11",
  "./rebojar-estojo.min.js?v=20261116-11",
  "../assets/rebojar-som.min.js",
  "./manifest.webmanifest",
  "./widget-estojo-v02.ico?v=20261116-11",
  "./icone-estojo.svg?v=20261116-11"
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((chave) => chave !== VERSAO).map((chave) => caches.delete(chave))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;
  evento.respondWith(caches.match(evento.request).then((resposta) => resposta || fetch(evento.request)));
});
