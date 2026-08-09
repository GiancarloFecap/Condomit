  const votesByOption = new Map();
  const votesByPollAndUser = new Map();

  const currentUserEmail = state.tokenInfo?.user?.email
    ? String(state.tokenInfo.user.email).toLowerCase()
    : null;

  votes.forEach((v) => {
    const increment = Number(v.vote_count ?? 1) || 0;
    const optionKey = String(v.option_id);

    const currentCount = Number(
      votesByOption.get(optionKey) || 0
    );

    votesByOption.set(
      optionKey,
      currentCount + increment
    );

    if (
      v.current_user_voted === true &&
      v.poll_id &&
      currentUserEmail
    ) {
      votesByPollAndUser.set(
        `${String(v.poll_id)}::${currentUserEmail}`,
        true
      );
    } else if (
      v.poll_id &&
      v.user_email
    ) {
      votesByPollAndUser.set(
        `${String(v.poll_id)}::${String(v.user_email).toLowerCase()}`,
        true
      );
    }
  });
