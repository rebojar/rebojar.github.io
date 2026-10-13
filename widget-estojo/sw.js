const VERSAO = "estojo-rebojar-v1";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./pagina.min.css",
  "./rebojar-estojo.min.js",
  "../assets/rebojar-som.min.js",
  "./manifest.webmanifest",
  "./icone-estojo.svg"
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
