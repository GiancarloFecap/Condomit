# Condomit v0.39.0 — Confirmação, identidade visual, documentos, checkout e ata formal

## Alterações desta versão

- Confirmação de e-mail direciona para `pages/email-confirmado.html`; a página valida o retorno do Supabase, encerra qualquer sessão temporária criada pela confirmação e leva o usuário para `entrar.html`.
- A barra lateral prioriza a logo cadastrada pelo síndico no registro do condomínio. Se não existir logo, continua usando `assets/logo-lado.png` da Condomit.
- O cadastro de blocos preserva os nomes já digitados ao alterar a quantidade: diminuir remove somente os últimos campos; aumentar mantém os existentes e acrescenta novos campos vazios.
- O Regulamento Interno aceita somente Word `.doc`/`.docx`, até 10 MB, e é armazenado em bucket privado do Supabase Storage.
- A logo do condomínio aceita PNG/JPG, até 2 MB, e é armazenada no Supabase Storage para uso na interface.
- Checkout do Mercado Pago corrigido: o Wallet Brick usa a configuração suportada e há um botão alternativo visível se o Brick não puder ser renderizado.
- Se o usuário retornar do Mercado Pago pelo botão Voltar do navegador sem pagamento aprovado, a sessão é encerrada e ele volta para a página de entrada.
- A ata da assembleia passou a ser apresentada como documento formal: identificação do condomínio, data, horário, presidência quando identificada, participantes, Ordem do Dia, discussões registradas, votações, encerramento e campos de assinatura. O conteúdo é gerado somente a partir dos dados persistidos, sem copiar imagens ou cabeçalho do documento usado como referência.
- Cache/PWA atualizado para `condomit-shell-v039`.
- Pasta `www/` deve ser regenerada com `npm run mobile:build` antes do pacote final.

## Obrigatório no Supabase

Execute as migrations em ordem e, para esta versão, aplique:

```text
supabase/migrations/029_condominium_assets_and_documents.sql
```

Ela adiciona os campos de logo/regulamento na tabela `public.condominiums` e cria os buckets:

```text
condomit-condominium-logos
condomit-condominium-regulations
```

O primeiro é público para permitir a exibição da identidade visual. O segundo é privado e limitado aos tipos MIME do Microsoft Word usados por `.doc` e `.docx`.

## URL de confirmação de e-mail

No Supabase, em **Authentication > URL Configuration > Redirect URLs**, inclua a URL de produção equivalente a:

```text
https://SEU-DOMINIO/pages/email-confirmado.html
```

Mantenha também a URL equivalente do ambiente local quando estiver testando localmente.

## Mercado Pago

Após publicar, confira as variáveis de ambiente do Mercado Pago já utilizadas pelo projeto. O frontend agora continua exibindo uma opção de pagamento mesmo quando o Wallet Brick falha, mas a criação da preferência ainda depende de o backend estar corretamente configurado.

## Publicação

Depois de aplicar a migration 029:

1. Execute `npm run check:project`.
2. Execute `npm run mobile:build` para sincronizar `www/`.
3. Publique novamente o projeto e as Netlify Functions.
4. Limpe/atualize o cache do PWA caso esteja testando uma instalação antiga.
