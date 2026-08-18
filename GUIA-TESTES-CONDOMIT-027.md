# Condomit 027 — Guia de implantação e testes

Este guia valida os 30 recursos adicionados ao Condomit e a correção da câmera traseira da assembleia.

## 0. Preparação obrigatória

1. Faça backup do banco do Supabase.
2. No **Supabase SQL Editor**, execute as migrations em ordem e confirme que as anteriores já foram aplicadas. Para esta versão, execute principalmente:
   - `supabase/migrations/023_package_pickup_notification.sql` caso ainda não esteja aplicada;
   - `supabase/migrations/024_advanced_management_suite.sql`.
3. Faça um novo deploy do projeto no Netlify.
4. Confirme no Netlify as variáveis já usadas pelo Condomit (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` etc.). Para testar a API pública, crie também `CONDOMIT_API_KEY` com um valor secreto de teste.
5. Limpe o cache do navegador ou abra o projeto em janela anônima após o deploy, pois esta versão usa os arquivos `v=027`.
6. Tenha, se possível, três contas do mesmo condomínio: **síndico**, **morador** e **porteiro**. Para os testes da administradora, crie também uma conta com `user_type = 'administradora'`.

A página central dos novos módulos é `pages/gestao-avancada.html`. O menu **Gestão Avançada** também é inserido nas barras laterais autenticadas.

---

## 1. Central Inteligente de Documentos

**Onde:** Gestão Avançada → Documentos e IA.

**Como testar:** entre como síndico, cadastre um documento chamado `Regulamento do Salão`, categoria `Regulamento`, versão `1`, com um conteúdo como `O salão de festas pode ser utilizado até as 22h`. Salve. Pesquise por `salão` no campo de busca. Cadastre uma segunda versão com versão `2` e altere o conteúdo.

**Resultado esperado:** os documentos aparecem com categoria, versão, data, validade e link de arquivo quando informado. A pesquisa filtra a lista. Documentos com visibilidade `gestao` não devem aparecer para morador/porteiro.

## 2. IA baseada nos documentos do condomínio

**Onde:** `IA - Dúvidas do Condomínio` / `ai-condomit.html`.

**Como testar:** depois do teste 1, pergunte `Até que horas posso usar o salão de festas?`.

**Resultado esperado:** a IA procura primeiro os documentos do CEP atual e usa o conteúdo do regulamento cadastrado na resposta. Para validar isolamento, cadastre um documento `Somente gestão` e confira que um morador não recebe o conteúdo restrito.

## 3. Dashboard financeiro + orçamento previsto × realizado

**Onde:** Gestão Avançada → Financeiro e consumo.

**Como testar:** como síndico, cadastre um orçamento mensal de R$ 5.000 para `Manutenção`. Depois registre uma despesa de R$ 3.000 no mesmo mês e uma receita de R$ 10.000.

**Resultado esperado:** Receita, Despesa, Saldo e Pendências são recalculados. O gráfico **Previsto × realizado** mostra o orçamento e as despesas do mês. O painel de visão geral mostra o saldo registrado.

## 4. Controle de água, gás e energia

**Onde:** Gestão Avançada → Financeiro e consumo → Leitura de consumo.

**Como testar:** registre para a mesma unidade/tipo uma leitura `100` em uma data e depois `140` em uma data posterior.

**Resultado esperado:** aparece um aviso de consumo acima do padrão, aproximadamente `+40%`. Leituras de unidades/tipos diferentes não são misturadas.

## 5. Gestão de patrimônio

**Onde:** Gestão Avançada → Patrimônio.

**Como testar:** cadastre `Elevador social`, tipo `Elevador`, local `Bloco A`, número de série, fornecedor e garantia.

**Resultado esperado:** o equipamento aparece em **Patrimônio cadastrado** com situação e identificação própria.

## 6. QR Code do equipamento + histórico

**Onde:** Gestão Avançada → Patrimônio → botão QR do ativo.

**Como testar:** abra o QR do `Elevador social`. Escaneie o QR usando outro celular em que a conta de gestão esteja autenticada.

**Resultado esperado:** o QR contém uma URL do Condomit com `?asset=<id>`, abre Gestão Avançada, entra em Patrimônio e abre a ficha do ativo. O modal mostra também as manutenções vinculadas ao equipamento.

## 7. Manutenção preventiva recorrente

**Onde:** Gestão Avançada → Patrimônio → Plano recorrente.

**Como testar:** crie um plano para o elevador com intervalo de 30 dias e `Próxima data` igual a hoje. Clique em **Gerar manutenções vencidas**.

**Resultado esperado:** uma nova manutenção é criada em `maintenance_items`, vinculada ao ativo e ao plano. A `next_due` do plano avança 30 dias. Clicar novamente no mesmo dia não deve duplicar a ocorrência já avançada.

## 8. Chamados com SLA

**Onde:** Gestão Avançada → Chamados e SLA.

**Como testar:** como morador, abra um chamado de teste. Como síndico, crie/edite um chamado com prazo SLA no passado e altere os estados `Aberto → Em análise → Em andamento → Aguardando prestador → Resolvido`.

**Resultado esperado:** o solicitante enxerga os próprios chamados; a gestão enxerga os do condomínio. Chamado aberto com `sla_due_at` vencido recebe destaque **SLA vencido** e entra no indicador operacional.

## 9. Encomendas avançadas

**Onde:** Configurações → Registrar encomenda e `Autorização de Entregas`.

**Como testar:** registre uma encomenda com transportadora, rastreio e opcionalmente uma URL de foto. Abra Autorização de Entregas como porteiro. Confira o código de retirada e abra o QR. Marque a encomenda como retirada.

**Resultado esperado:** foto aparece quando informada, código/QR de retirada é exibido, e a retirada gera notificação direcionada ao destinatário. Para testar alerta de encomenda antiga imediatamente, altere `received_at` de uma encomenda aguardando retirada para mais de 3 dias no passado e reabra a página; `condomit_notify_old_packages()` deve gerar aviso direcionado uma única vez.

## 10. Vagas e empréstimo temporário

**Onde:** Gestão Avançada → Vagas e recarga.

**Como testar:** cadastre uma vaga com unidade, placa e e-mail. Informe **Emprestada até** com uma data futura.

**Resultado esperado:** a vaga fica com situação `emprestada`, mostra o usuário e a data de devolução. O botão **Liberar** devolve a vaga para `livre` e remove o empréstimo.

## 11. Carregadores para carros elétricos

**Onde:** Gestão Avançada → Vagas e recarga.

**Como testar:** como síndico, cadastre um carregador. Como morador, reserve das 18:00 às 19:00. Tente reservar o mesmo carregador das 18:30 às 19:30.

**Resultado esperado:** a primeira reserva é aceita e a sobreposição é recusada. A gestão pode clicar em **Concluir** e registrar o consumo final em kWh.

## 12. Modo Emergência

**Onde:** Gestão Avançada → Comunidade → Modo Emergência.

**Como testar:** publique `Falta de água` como severidade alta. Abra outra página do Condomit com uma conta do mesmo CEP.

**Resultado esperado:** um banner de emergência aparece globalmente no topo. O usuário pode confirmar leitura. Ao encerrar o alerta como síndico, o banner deixa de aparecer.

## 13. Confirmação e estatística de leitura

**Onde:** Mural de Avisos.

**Como testar:** publique um aviso como síndico. Abra o aviso em duas contas de morador. Depois abra os detalhes do mesmo aviso como síndico.

**Resultado esperado:** cada abertura registra `communication_reads`. O síndico vê algo como `2 de X moradores confirmaram a leitura`, sem contar repetidamente o mesmo usuário.

## 14. Feed do condomínio

**Onde:** Mural de Avisos.

**Como testar:** como síndico, crie um aviso com link de anexo, marque **Fixar no topo** e mantenha comentários habilitados. Como morador, abra o aviso, reaja e escreva um comentário.

**Resultado esperado:** aviso fixado aparece primeiro; anexo pode ser aberto; reações persistem; comentários persistem; o síndico pode fixar/desafixar. Se publicar com comentários desativados, o formulário de comentário não aparece.

## 15. Calendário geral integrado

**Onde:** Gestão Avançada → Comunidade → Calendário geral.

**Como testar:** crie um evento manual. Depois agende uma assembleia, crie uma manutenção futura e faça uma reserva de área comum nas páginas originais. Atualize Gestão Avançada.

**Resultado esperado:** o calendário mescla eventos manuais, assembleias, manutenções e reservas, identificando os itens sincronizados.

## 16. Copiloto do Síndico

**Onde:** IA - Dúvidas do Condomínio.

**Como testar como síndico:** use perguntas como `resumo do condomínio`, `quais manutenções estão atrasadas?`, `quantos chamados estão fora do SLA?` e `gere um comunicado sobre manutenção do elevador amanhã`.

**Resultado esperado:** as respostas de indicadores vêm das tabelas do próprio CEP e a solicitação de comunicado gera um rascunho, com atalhos para IA de Comunicados/Mural.

## 17. Resumo aprimorado de assembleia

**Onde:** Assembleia → reunião → Resumo/Ata após encerramento.

**Como testar:** realize uma assembleia de teste com chat e pelo menos uma votação. Encerre a assembleia e abra o resumo.

**Resultado esperado:** o resumo mostra dados persistidos, votações/resultados e a seção de decisões em destaque, permitindo gerar uma ata preliminar mais completa.

## 18. Tarefas geradas pela assembleia

**Onde:** Resumo da Assembleia e Gestão Avançada → Governança.

**Como testar:** depois de uma votação encerrada, clique em **Gerar tarefas das decisões**.

**Resultado esperado:** uma tarefa é criada em `assembly_tasks` para a decisão vencedora. Repetir a ação não deve gerar a mesma tarefa várias vezes. A gestão pode concluir/reabrir a tarefa em Governança.

## 19. Auditoria administrativa

**Onde:** Gestão Avançada → Governança → Auditoria.

**Como testar:** cadastre/edite itens em documentos, financeiro, patrimônio, chamados, estacionamento, emergência ou assembleia. Depois atualize a auditoria.

**Resultado esperado:** aparecem data, usuário, operação, tabela/entidade e ID. A auditoria é visível somente para gestão autorizada.

## 20. Central de permissões

**Onde:** Gestão Avançada → Governança → Permissões por perfil.

**Como testar:** como síndico, habilite/desabilite `Ver financeiro` ou `Gerenciar manutenção` para um perfil. Confirme a linha em `role_permissions`. Para validar a regra com a conta desse perfil, abra o console da página e execute:

```js
await supabaseFetch('/rpc/condomit_has_permission', {
  method: 'POST',
  body: JSON.stringify({
    target_cep: '04284070',
    permission_name: 'ver_financeiro'
  })
});
```

**Resultado esperado:** a permissão é persistida em `role_permissions` e o RPC retorna `true` quando habilitada e `false` quando desabilitada. Os módulos avançados que usam essa permissão em RLS (como leitura financeira/manutenção) não dependem apenas de esconder botões na interface.

## 21. Administradora com vários condomínios

**Onde:** `index-administradora.html`.

**Preparação de teste no SQL Editor:** substitua e-mails/CEPs pelos seus valores.

```sql
INSERT INTO public.management_companies(name,email)
VALUES ('Administradora Teste','admin@teste.com')
RETURNING id;

-- Use o ID retornado:
INSERT INTO public.management_company_users(company_id,user_email,role)
VALUES (1,'admin@teste.com','administradora')
ON CONFLICT DO NOTHING;

INSERT INTO public.managed_condominiums(company_id,cep)
VALUES (1,'<CEP_EXISTENTE_1>'),(1,'<CEP_EXISTENTE_2>')
ON CONFLICT DO NOTHING;

UPDATE public.users
SET user_type='administradora'
WHERE LOWER(email)='admin@teste.com';
```

**Como testar:** faça login com a conta administradora.

**Resultado esperado:** ela vai para o painel dedicado e pode alternar entre todos os CEPs vinculados, sem precisar ser cadastrada como moradora em cada condomínio.

## 22. Dashboard consolidado da administradora

**Onde:** `index-administradora.html`.

**Como testar:** use dois condomínios vinculados com quantidades diferentes de chamados, manutenções, alertas, documentos e finanças.

**Resultado esperado:** o RPC `condomit_managed_condominiums_dashboard()` consolida os indicadores de forma segura, mostra cada condomínio e o saldo total, e o botão **Abrir condomínio** define o CEP ativo para Gestão Avançada.

## 23. API pública protegida

**Onde:** Netlify Function `/.netlify/functions/public-api`.

**Preparação:** configure `CONDOMIT_API_KEY` no Netlify e faça deploy.

**Teste:**

```bash
curl -H "x-condomit-api-key: SUA_CHAVE" \
  "https://SEU-SITE.netlify.app/.netlify/functions/public-api?resource=metrics&cep=04284070"
```

Repita com `resource=calendar` e `resource=assets`.

**Resultado esperado:** chave correta retorna JSON; chave ausente/incorreta retorna HTTP 401; CEP inválido retorna HTTP 400.

## 24. PWA instalável

**Onde:** qualquer página, principalmente Gestão Avançada → Integrações.

**Como testar no Android/Chrome:** abra o site por HTTPS, aguarde o navegador reconhecer a PWA e use **Instalar Condomit** ou `Instalar app` no menu do navegador.

**Resultado esperado:** Condomit fica instalado com ícone próprio e abre em modo standalone. O service worker mantém o shell básico em cache.

## 25. Segurança, sessões e 2FA

**Onde:** Gestão Avançada → Integrações → Segurança e sessões; Configurações para 2FA.

**Como testar:** entre na mesma conta em dois navegadores/dispositivos e navegue em ambos. Abra a central de sessões. Depois clique em **Sair de todos os dispositivos**.

**Resultado esperado:** os dispositivos aparecem em `user_session_log`; a sessão atual é identificada; sessões revogadas deixam de permanecer ativas. O botão **Gerenciar 2FA** leva à configuração já existente de autenticação em duas etapas.

## 26. Pesquisa de satisfação

**Onde:** Gestão Avançada → Comunidade.

**Como testar:** síndico cria uma pesquisa. Morador responde com 1–5 estrelas; tente responder novamente com outra nota.

**Resultado esperado:** existe apenas uma resposta por usuário/pesquisa, atualizável. A média aparece nos indicadores da visão geral.

## 27. Gamificação comunitária

**Onde:** Gestão Avançada → Comunidade → Conquistas comunitárias.

**Como testar:** atribua a um morador `Participou de assembleia` e 10 pontos; depois atribua `Colaborou em pesquisa`.

**Resultado esperado:** as conquistas aparecem no histórico com pontos. Não há prêmio financeiro nem ranking que envolva dinheiro; o recurso é somente de participação comunitária.

## 28. Marketplace aprimorado

**Onde:** Marketplace.

**Como testar:** publique um anúncio. Marque-o como favorito em outra conta. Como anunciante, altere entre `Disponível`, `Reservado` e `Vendido`. Clique em **Entrar em contato**. Se o anunciante tiver telefone cadastrado, teste também **WhatsApp**.

**Resultado esperado:** favorito persiste no banco; status persiste; contato abre o chat já direcionado ao anunciante quando ele está entre os contatos do condomínio. Anúncios com `expires_at` vencido são marcados como expirados por `condomit_expire_marketplace_items()`.

Para testar expiração sem esperar:

```sql
UPDATE public.marketplace_items
SET expires_at = NOW() - INTERVAL '1 day'
WHERE id = <ID_DO_ANUNCIO>;
SELECT public.condomit_expire_marketplace_items();
```

## 29. Achados e Perdidos inteligente

**Onde:** Achados e Perdidos.

**Como testar:** com uma conta, registre `Chave preta` como **Perdido** no `Hall`, data de hoje. Com outra conta, registre `Chave preta` como **Encontrado** no mesmo local/data. Atualize a página.

**Resultado esperado:** `condomit_suggest_lost_found_matches()` cria uma correspondência com confiança alta, a interface mostra a sugestão e os usuários com `created_by` recebem uma notificação direcionada. Itens antigos são arquivados por `condomit_archive_old_lost_found()`.

## 30. Painel de indicadores do condomínio

**Onde:** Gestão Avançada → Visão geral.

**Como testar:** depois dos testes anteriores, clique em **Atualizar dados**.

**Resultado esperado:** o painel exibe documentos, chamados abertos, manutenções pendentes, alertas ativos, satisfação e saldo. Indicadores operacionais mostram SLA vencido, manutenção atrasada e documentos próximos do vencimento.

---

# 31. Correção da câmera traseira no celular

**Onde:** Assembleia → Configurar dispositivos / Sala da assembleia.

**Como testar em um celular físico por HTTPS:** conceda permissão de câmera. Em **Configurar dispositivos**, confirme que aparecem **Câmera frontal** e **Câmera traseira** quando o aparelho expõe os dois sensores. Escolha `Câmera traseira` antes de entrar e entre na reunião. Depois use **Virar câmera** para alternar para frontal e novamente para traseira.

**Resultado esperado:** a seleção traseira é respeitada ao entrar. Durante a reunião, a troca tenta primeiro o `deviceId` exato do outro sensor e valida se o track realmente mudou; se o navegador ignorar, o Condomit tenta `restartTrack({ facingMode })`, `switchActiveDevice` e recriação da captura. A interface só informa sucesso quando a mudança de sensor é confirmada pelas configurações/label do track.

**Observação de diagnóstico:** faça o teste em dispositivo real, não apenas em emulação do DevTools. Se o navegador expuser somente uma câmera ao site, confirme nas permissões do sistema/navegador se a câmera está liberada e feche outros aplicativos que possam estar usando o sensor.

---

## Teste de regressão recomendado

Depois de validar os novos módulos, repita pelo menos: login/logout de síndico, morador e porteiro; troca de idioma; notificações; ocorrências; chats; visitantes; reservas; assembleia; configuração de dispositivos; marketplace; achados e perdidos; manutenção e responsividade em 360 px, 390 px, 412 px, tablet e desktop.

## Arquivos centrais desta versão

- `supabase/migrations/024_advanced_management_suite.sql`
- `pages/gestao-avancada.html`
- `scripts/gestao-avancada.js`
- `styles/gestao-avancada.css`
- `pages/index-administradora.html`
- `scripts/index-administradora.js`
- `scripts/advanced-global.js`
- `netlify/functions/public-api.js`
- `manifest.webmanifest`
- `service-worker.js`
- `scripts/assembly/room/livekit.js`

