const VERSAO = "estante-rebojar-v52-bau-menor";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./pagina.min.css",
  "../assets/widget-estante/rebojar-estante.min.js?v=20261109-bau-menor",
  "../assets/rebojar-som.min.js",
  "./manifest.webmanifest",
  "./widget-estante-v01.ico",
  "./widget-estante-v01-180.png",
  "./widget-estante-v01-192.png",
  "./widget-estante-v01-512.png"
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
  evento.respondWith(
    caches.match(evento.request).then((resposta) => resposta || fetch(evento.request))
  );
});
