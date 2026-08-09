export async function loadVotes(pollIds) {
  const supabase = ensureSupabase();
  const ids = (Array.isArray(pollIds) ? pollIds : [])
    .filter(Boolean)
    .map(String);

  if (!ids.length) {
    return [];
  }

  try {
    const { data, error } = await supabase.rpc(
      'condomit_assembly_poll_results',
      {
        target_assembly_id: Number(state.assemblyId)
      }
    );

    if (error) {
      console.error(
        'Erro ao carregar resultados agregados da votação:',
        error
      );
      return [];
    }

    return (Array.isArray(data) ? data : [])
      .filter((row) => ids.includes(String(row.poll_id)))
      .map((row) => ({
        poll_id: row.poll_id,
        option_id: row.option_id,
        vote_count: Number(row.vote_count || 0),
        current_user_voted: row.current_user_voted === true
      }));
  } catch (error) {
    console.error(
      'Falha ao carregar resultados da votação:',
      error
    );
    return [];
  }
}
