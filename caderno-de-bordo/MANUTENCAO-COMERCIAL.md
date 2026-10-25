# Manutenção da área comercial

A conta mensal, a assinatura e a exportação paga permanecem visíveis apenas como uma proposta de produto. Enquanto o modo de manutenção estiver ativo, nenhuma cobrança, autenticação comercial ou exportação paga pode ser iniciada pela demonstração pública.

## Chave central

A chave está em `caderno.js`, dentro do bloco:

```js
/* REBOJAR: INÍCIO — CHAVE E BLOQUEIO DO MODO COMERCIAL EM MANUTENÇÃO */
const MODO_COMERCIAL_EM_MANUTENCAO=true;
/* REBOJAR: FIM — CHAVE E BLOQUEIO DO MODO COMERCIAL EM MANUTENÇÃO */
```

- `true`: mantém os avisos visíveis e bloqueia conta, assinatura, Stripe, checkout e exportação paga.
- `false`: devolve o controle aos fluxos comerciais existentes.

Os blocos relacionados estão identificados por comentários `REBOJAR: INÍCIO` e `REBOJAR: FIM` em `index.html`, `estilo.css`, `caderno.js` e no `index.html` do portal.

## Antes de desativar a manutenção

1. Confirmar a entidade responsável pela venda, os canais de atendimento e os dados de contato.
2. Revisar preço, entrega, recorrência, cancelamento, arrependimento, reembolso e emissão de comprovantes.
3. Revisar Termos de Serviço e Política de Privacidade.
4. Testar conta, recuperação de acesso e cancelamento.
5. Testar Stripe em ambiente de teste, inclusive falha, duplicidade, Pix pendente e reembolso.
6. Validar acessibilidade, versão mobile e mensagens de erro.
7. Fazer uma compra completa de homologação antes de aceitar pagamento real.

Não basta alterar a chave para considerar a área pronta para produção: a chave é um mecanismo operacional, não uma aprovação comercial, jurídica ou de segurança.
