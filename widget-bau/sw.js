const VERSAO="bau-rebojar-v2-publico";
const ARQUIVOS=["./","./index.html","./pagina.min.css","../assets/rebojar-som.min.js?v=20261014-4","./rebojar-bau.min.js?v=20261014-4","./demo-bau.min.js","./portal-bau.min.js?v=20261014-1","./manifest.webmanifest","./widget-bau-v02.ico","./widget-bau-v02-180.png","./widget-bau-v02-192.png","./widget-bau-v02-512.png"];
self.addEventListener("install",evento=>{evento.waitUntil(caches.open(VERSAO).then(cache=>cache.addAll(ARQUIVOS)));self.skipWaiting()});
self.addEventListener("activate",evento=>{evento.waitUntil(caches.keys().then(chaves=>Promise.all(chaves.filter(chave=>chave.startsWith("bau-rebojar-")&&chave!==VERSAO).map(chave=>caches.delete(chave)))));self.clients.claim()});
self.addEventListener("fetch",evento=>{if(evento.request.method!=="GET")return;evento.respondWith(caches.match(evento.request).then(resposta=>resposta||fetch(evento.request)))});
