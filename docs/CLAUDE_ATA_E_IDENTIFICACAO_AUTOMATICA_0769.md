# Condomit v0.76.9 — ATA com Claude e identificação automática

## Visão geral

Esta atualização mantém o Deepgram como motor de transcrição literal do MP4 e utiliza a **API Claude (Anthropic)** para redigir a minuta da ATA em português, em discurso indireto. As falas são agrupadas por assunto, com nome e cargo quando a autoria tiver sido identificada com segurança. Votações são incorporadas ao documento a partir dos registros oficiais, não inventadas pelo modelo. A aprovação e a assinatura continuam restritas ao síndico e necessárias antes da divulgação aos moradores.

**Atenção:** Deepgram fornece diarização (Voz 1, Voz 2 etc.), não reconhecimento biométrico automático do nome. O Condomit associa cada voz a uma pessoa pelo cruzamento dos intervalos de fala registrados com a identidade autenticada no LiveKit/Supabase. Quando faltam eventos ou há falas simultâneas, nenhuma identificação automática deve ser considerada 100% confiável; o sistema mantém a autoria pendente para revisão em vez de inventar um nome. A correção manual fica disponível como exceção.

## Passo a passo — publicar no Condomit

1. **Backup:** guarde o ZIP e a configuração publicada da v0.76.8. Não publique migrações fora de ordem.
2. **Supabase:** no painel do projeto, vá a **SQL Editor → New query** e execute `supabase/migrations/072_assembly_claude_auto_speaker.sql` **após a 071**. Essa função exige `service_role` e só é executada pelo servidor; não coloque a chave `service_role` no navegador.
3. **Claude:** acesse [Claude Console](https://console.anthropic.com/), configure cobrança/créditos se a conta exigir, e crie uma chave de API. Guarde a chave em local seguro; não a cole no chat e não a inclua no projeto.
4. **Netlify:** projeto Condomit → **Project configuration → Environment variables → Add a variable**. Crie `ANTHROPIC_API_KEY` com o valor secreto. Use escopo **Functions** para o ambiente **Production** e os ambientes de teste desejados.
5. **Modelo (opcional):** crie `CLAUDE_MINUTES_MODEL` = `claude-sonnet-5-5`. Se deixar sem configurar, esse é o modelo padrão da v0.76.9. Verifique sua disponibilidade na conta da Anthropic.
6. **Controle de custo (opcional):** crie `CLAUDE_MINUTES_MAX_CHUNKS` = `12` para limitar a quantidade máxima de lotes de uma geração. Cada lote gera consumo de tokens e custo na Anthropic. A função possui limite de execução da Netlify; assembleias muito longas poderão exigir uma implementação assíncrona separada.
7. **Publique** o conteúdo do ZIP completo atualizado na Netlify e aguarde um deploy bem-sucedido. Os scripts `www/` incluídos já estão sincronizados para as versões móveis.
8. **Teste:** crie uma assembleia curta com **dois usuários distintos**, cada um conectado à própria conta e com microfone. Fale alternadamente, aguarde o MP4 concluir, confira as falas transcritas e a identificação automática. No painel do síndico, abra **Revisões → Resumo / Ata → Gerar ATA com Claude (nuvem)**. Revise nomes, valores, votações e decisões, salve, aprove e assine.
9. **Falha de identificação:** confira se `assembly_speech_activity` recebeu eventos dos dois usuários, se o Deepgram conseguiu separar vozes e se os horários da gravação correspondem aos intervalos da chamada. O servidor tenta novamente a associação antes de gerar a ATA. Se não houver prova suficiente, o falante permanece sem identificação, como medida para impedir atribuição errada.
10. **Atas antigas:** para uma ATA já aprovada, use **Reabrir para corrigir manifestações**, gere novamente pelo Claude, revise, aprove e assine. Uma ATA já assinada não pode ser alterada silenciosamente.

## Fluxo técnico

- `scripts/assembly/room/transcription.js` envia blocos da atividade de cada microfone em intervalos de aproximadamente 7 segundos; assim, uma queda abrupta de conexão tende a perder no máximo o trecho recente, não toda uma fala longa.
- `assembly-deepgram-callback.js` reexecuta a vinculação automática após receber o resultado do Deepgram; `assembly-minutes-indirect.js` repete essa tentativa antes da geração.
- A migração `072` permite associar **falas curtas** quando o cruzamento é particularmente convincente, sem sobrescrever uma atribuição confirmada manualmente. O algoritmo anterior `065` continua em uso para os casos normais.
- O navegador envia a solicitação autenticada para `/.netlify/functions/assembly-minutes-indirect`. O segredo Anthropic fica **somente no servidor**.
- A função agrupa a transcrição bruta por assunto e identidade; solicita ao Claude a redação detalhada de cada lote e exige que o resultado mencione todos os autores reconhecidos. O conteúdo original do Deepgram permanece preservado.
- Se a API retornar erro, estrutura inválida ou omitir um autor, a geração falha de forma visível. O Condomit **não disfarça** um texto por regras locais como se fosse gerado pelo Claude.
- O síndico continua responsável pela revisão e pela assinatura; sem elas, os detalhes não ficam disponíveis aos moradores.

## Qualidade e privacidade

- O texto enviado ao Claude contém falas e nomes dos participantes; **atualize a informação de privacidade e a base legal aplicável ao condomínio (LGPD)** e defina retenção, controles de acesso e termos contratuais pertinentes antes de uso em produção.
- A redação é feita em discurso indireto e o modelo é instruído a não inventar decisões, cotações, votos ou atribuições. **IA pode cometer erros**, portanto as atas exigem revisão humana.
- A geração depende de créditos e rede da Anthropic. **A API não é gratuita por padrão**; consultar os preços do modelo no Claude Console.
- O processamento Claude nesta versão é solicitado de forma síncrona pelo síndico. Reuniões extensas podem exceder o limite de 60 segundos da função Netlify. Isso não apaga as transcrições; tente novamente ou implemente um processamento em segundo plano para casos extensos.
- A gravação e o pipeline Egress/S3 permanecem os da v0.76.8; esta versão **não altera a configuração de upload do LiveKit** nem recupera arquivos que falharam anteriormente.

## Arquivos principais

| Arquivo | Mudança |
|---|---|
| `netlify/functions/lib/assembly-claude-minutes.js` | Cliente privado da API Claude, validação de resposta e divisão em lotes |
| `netlify/functions/assembly-minutes-indirect.js` | Claude como gerador principal, conferência de autoria, contexto completo, nova tentativa de associação |
| `netlify/functions/assembly-deepgram-callback.js` | Identificação automática após o callback, com compatibilidade com a função anterior |
| `scripts/assembly/room/transcription.js` | Envio periódico da atividade da voz autenticada |
| `scripts/assembly/room/index.js` | Atualização de cache da rotina de transcrição |
| `scripts/assembly/assembly-summary.js` | Botão Claude, geração automática, revisão opcional de falantes |
| `pages/assembleia-resumo.html` | Atualização do módulo de revisão |
| `supabase/migrations/072_assembly_claude_auto_speaker.sql` | Associação segura de falas curtas à pessoa autenticada |
| `tests/assembly-claude-auto-0769.test.cjs` | Testes de API, lotes, confidencialidade e autores |
| `www/` | Cópia atualizada para as plataformas móveis |
| `package.json`, `package-lock.json` | Versão v0.76.9 |

## Testes

Execute `node --test tests/*.test.cjs` e `npm run check:project`. Os testes da API utilizam respostas simuladas: não fazem chamadas reais nem comprovam qualidade de modelo com material confidencial. Faça um teste de ponta a ponta no ambiente publicado.

## Correção de compatibilidade v0.77.0

A geração pela Claude API nas versões anteriores incluía `temperature: 0.15`, rejeitado pelos modelos Sonnet 5 e 5.5 (HTTP 400). A v0.77.0 remove o parâmetro e separa os avisos de modelo inválido, parâmetros incompatíveis, chave e créditos. Para instalar, publique o pacote v0.77.0; mantenha `ANTHROPIC_API_KEY` e prefira `CLAUDE_MINUTES_MODEL=claude-sonnet-5-5`. Não há migração SQL nova. Consulte Netlify Functions logs se outro HTTP 400 ocorrer.
