# Condomit v0.49.0 — Dashboard financeiro, atas, assembleias e checkout

## Alterações

- Botão “Ir para Painel Morador/Comunidade Digital” agora abre Gestão de Moradores.
- Azul principal atualizado para `#3360F2`, baseado na referência visual enviada.
- Checkout atualiza os dados do condomínio direto do banco após troca de síndico, incluindo total de apartamentos.
- Login e restauração de sessão também passam a carregar `total_apartments`.
- Síndico pode assinar eletronicamente a ata de uma assembleia finalizada.
- Removida a assinatura “Responsável pela conferência da ata”.
- Adicionado botão “Imprimir ata”.
- Data formal da ata passa a usar ordinal: “Ao trigésimo primeiro dia do mês de agosto de 2026”.
- Corrigido o botão Sair da sidebar em Detalhes da Assembleia.
- Resumo de Despesas/Receitas da index deixou de usar valores fictícios.
- Despesas mensais passam a somar lançamentos reais + pagamentos aprovados da assinatura Condomit.
- Receitas mensais passam a somar lançamentos reais registrados no financeiro.
- Removidas as caixas individuais em torno de Despesas e Receitas.
- Síndico ganhou botão para finalizar assembleias agendadas; após finalizar, elas passam para Assembleias Realizadas.

## Supabase

Execute a migration:

`supabase/migrations/032_dashboard_assembly_checkout_fixes.sql`

Ela cria as RPCs seguras de snapshot do condomínio, resumo financeiro, finalização de assembleia e assinatura eletrônica da ata, além da tabela de assinaturas.
