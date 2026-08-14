# Correções 014 — Condomit

Esta versão reúne ajustes de Configurações, Marketplace, alertas, acesso rápido, barra lateral, encerramento automático de assembleias e persistência das notificações.

## Configurações

- **Sobre a empresa** agora abre um modal institucional com descrição da Condomit, propósito, públicos, recursos, missão, visão, valores, diferencial e contatos.
- **Informações do condomínio** consulta `condomit_current_condominium_info()` para mostrar o síndico do mesmo CEP e o telefone cadastrado desse síndico.
- **Política de Privacidade** e **Termos de Uso** possuem conteúdo completo em modais próprios.
- **Prestadores de serviços** abre um seletor entre consultar prestadores registrados e registrar um prestador.
- **Contatos úteis** mostra o e-mail oficial encontrado no projeto. Como não existe número oficial da Condomit nos arquivos recebidos, o telefone permanece identificado como não informado, sem inventar um número.

## Marketplace

- `marketplace_items` passa a ter `seller_email` para identificar o verdadeiro dono do anúncio.
- Novos anúncios ficam vinculados à conta autenticada.
- O proprietário pode editar e excluir seu próprio anúncio.
- Foi adicionado o filtro **Meus anúncios**.
- RLS impede que outra conta edite ou exclua o anúncio.

## Alertas

- `scripts/condomit-alerts.js` cria o componente visual compartilhado inspirado na referência enviada: cartão branco, faixa lateral colorida, ícone de estado, título, mensagem e botão fechar.
- `alert()` do navegador é redirecionado para esse componente nas páginas do projeto.
- As funções de toast compartilhadas também utilizam o componente 014.

## Dashboard e navegação

- O botão **Chat** do Acesso rápido no dashboard do síndico abre um modal para escolher entre **Chat com os moradores** e **Chat com porteiro**.
- A barra lateral possui rolagem vertical quando os itens ultrapassam a altura da tela.

## Assembleias

- `condomit_close_stale_assemblies()` passa a encerrar uma assembleia sem participantes depois de **15 minutos** do horário de início.
- A Scheduled Function do Netlify continua executando a verificação a cada 5 minutos. Por isso, o encerramento efetivo pode acontecer no primeiro ciclo após completar os 15 minutos.

## Notificações

- O logout não remove mais chaves `condomit.notifications.*` do `localStorage`.
- A inicialização do Community Hub não apaga mais o cache de notificações ao entrar novamente.

## Banco de dados

Execute no Supabase SQL Editor:

`supabase/migrations/014_settings_marketplace_alerts_assembly.sql`

A migration 014 pressupõe que as migrations anteriores do projeto, especialmente a 012, já estejam aplicadas.
