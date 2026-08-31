# Condomit v0.37.0 — Planos, cobrança e assembleias

## O que foi implementado

- Controle de acesso por plano pago do condomínio:
  - **Essencial:** Início, Mural de Avisos, Canal de Sugestões, Notificações, Gestão de Moradores, IA - Dúvidas, dados pessoais, Minha unidade e configurações básicas.
  - **Pro:** tudo do Essencial + Chats, Achados e Perdidos, Assembleias, Reserva de Locais, Manutenção Preventiva, Controle de Acesso e Registrar Encomenda.
  - **Premium:** tudo do Pro + Ocorrências, Marketplace, Gestão Avançada e IA - Comunicados Automáticos.
- Páginas acima do plano contratado são bloqueadas mesmo quando acessadas diretamente pela URL.
- Itens de menu, dashboard e opções de Configurações incompatíveis com o plano são ocultados.
- O checkout aceita o fluxo `checkout.html?upgrade=1` para troca/upgrade de plano durante um ciclo ativo.
- Cobrança continua vinculada ao condomínio e cada pagamento aprovado libera **1 mês**. Após o vencimento:
  - síndico é direcionado ao checkout para renovar;
  - moradores e porteiros têm o login/sessão bloqueados até a regularização.
- Assembleias:
  - "Preparar entrada" só é liberado a partir do horário cadastrado;
  - acesso antecipado por URL e emissão antecipada de token LiveKit também são bloqueados;
  - início antecipado pelo backend é recusado;
  - a primeira verificação de sala vazia ocorre 30 minutos depois do horário cadastrado;
  - se houver participante, a próxima verificação daquela assembleia ocorre somente 30 minutos depois;
  - se não houver participante ativo na verificação, a assembleia é encerrada automaticamente.
- Cadastro:
  - corrigida a falha do fallback de cadastro causada por reatribuição de variáveis `const`;
  - corrigido o roteamento Netlify de `/api/auth/admin/signup` para a função de cadastro administrativo.

## Passos necessários no ambiente publicado

1. Aplicar no Supabase a migration `supabase/migrations/027_subscription_entitlements_assembly_rules.sql`.
2. Publicar/republicar o projeto na Netlify para atualizar as Functions e a rotina `auto-end-assemblies`.
3. Confirmar que a tabela `plano` possui planos cujo campo `nome` contenha **Essencial**, **Pro** e **Premium**.
4. Manter configuradas as variáveis já usadas pelo projeto, especialmente Supabase, Mercado Pago e LiveKit.

## Validação local

O comando abaixo foi executado com sucesso nesta versão:

```bash
npm run check:project
```

Resultado: **52 HTMLs e 90 JavaScripts verificados sem erros de estrutura/referências.**
