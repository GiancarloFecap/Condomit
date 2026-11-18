# Condomit v0.77.1 — ATA automática a partir do Deepgram

## O que mudou

- O Claude recebe os segmentos **originais** da tabela `assembly_transcripts` (origem `recording_video_deepgram`), depois da associação automática das vozes ao nome/cargo pela função `condomit_auto_identify_deepgram_072`.
- Nunca é enviado ao Claude o `body` de `assembly_minutes_drafts` nem qualquer resumo pré-gerado. A organização temática é usada apenas para agrupar os segmentos; cada `transcript` original é mantido sem truncamento. Trechos longos são repartidos e reunidos sem remoção de caracteres.
- Após a conclusão do MP4 e do Deepgram, a rotina Netlify `assembly-minutes-auto-dispatch` encontra a assembleia elegível e aciona `assembly-minutes-auto-background`. A rotina é totalmente independente de o síndico manter a página aberta.
- Não existe mais botão para acionar o Claude. A aba de revisão exibe o estado do processamento e atualiza a minuta quando ela ficar pronta.
- A IA não aprova, não assina nem publica: a minuta só fica disponível aos moradores depois da conferência, aprovação e assinatura do síndico.
- Por segurança, uma minuta existente não é substituída automaticamente. Se houver texto anterior, a versão produzida fica guardada no job e o síndico pode optar por **aplicar** o texto, sem precisar gerar novamente. Atas aprovadas/assinadas não são alteradas.

## Passos de instalação

1. Na Supabase SQL Editor, execute **somente após a 072** o arquivo `supabase/migrations/073_assembly_claude_automatic_from_deepgram.sql`.
2. Publique a **versão completa v0.77.1** na Netlify. Confirme a existência das funções `assembly-minutes-auto-dispatch` (agendada a cada minuto) e `assembly-minutes-auto-background` (processamento em segundo plano).
3. Confira, nas variáveis de ambiente da Netlify aplicáveis a **Functions / Production**, as variáveis já usadas pelo projeto: `ANTHROPIC_API_KEY`, `CLAUDE_MINUTES_MODEL` (por exemplo `claude-sonnet-5-5`), `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. A variável `URL` normalmente é fornecida automaticamente pela Netlify. Não coloque chaves secretas em código de frontend.
4. Se desejar, configure `CLAUDE_MINUTES_MAX_CHUNKS=36`. O padrão são 36 blocos; ao exceder esse valor o sistema falha explicitamente, **não** descarta falas para publicar uma ATA incompleta.
5. Teste uma assembleia encerrada com vídeo MP4 confirmado no Storage e Deepgram com status `concluido`. Não clique em nenhum botão de Claude. Aguarde a tarefa de servidor e consulte o resultado na aba **Revisões → Resumo / Ata**.
6. Confira a autoria nominal, o discurso indireto, a fidelidade a valores/votações, revise, aprove e assine.

## Diagnóstico

- **Aguardando transcrição:** uma ou mais gravações ainda não estão concluídas e transcritas pelo Deepgram.
- **Pendente:** o callback do Deepgram enfileirou a tarefa, e o agendamento da Netlify deverá dispará-la.
- **Processando:** uma função em segundo plano está redigindo a minuta.
- **Concluído:** a redação foi gravada na tabela `assembly_auto_minutes_jobs`; se não existia minuta anterior, também foi salva em `assembly_minutes_drafts`.
- **Falhou:** `last_error` armazena a causa. O servidor tenta novamente com espera progressiva, até cinco tentativas. Confira as credenciais, o identificador do modelo e o saldo da Anthropic. A falha não autoriza publicação nem substitui a transcrição bruta.

Consultas de suporte (somente leitura):

```sql
SELECT assembly_id, status, attempts, source_count,
       saved_to_draft, last_error, created_at, updated_at
FROM public.assembly_auto_minutes_jobs
ORDER BY created_at DESC LIMIT 20;
```

Não execute a migração diretamente na produção a partir de ferramentas de terceiros sem conferência.

## Privacidade e limites

A transcrição textual com nomes é enviada à Anthropic para o processamento solicitado. É necessário observar as políticas de consentimento/transparência e proteção de dados do condomínio. Quando o Deepgram separar a voz, mas não houver evidência suficiente de identidade, o Condomit indica falante não identificado: **não inventa nome**.

Funções agendadas têm limite de execução curto; a geração por Claude é executada por uma **Background Function** da Netlify, com limite de até 15 minutos por execução. Assembleias excepcionalmente extensas podem exigir processamento em etapas com persistência adicional. É cobrada utilização da API Claude conforme os tokens efetivamente processados.
