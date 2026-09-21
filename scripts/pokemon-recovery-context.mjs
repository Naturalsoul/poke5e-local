const recoveryDepthByActor =
  new Map();


export function isPokemonRecoveryInProgress(
  actor
) {

  if (!actor?.uuid) {

    return false;
  }


  return (
    recoveryDepthByActor.get(
      actor.uuid
    ) ??
    0
  ) > 0;
}


export async function withPokemonRecoveryContext(
  actor,
  operation
) {

  if (!actor?.uuid) {

    throw new TypeError(
      "withPokemonRecoveryContext requiere un Actor con UUID."
    );
  }


  if (
    typeof operation !==
      "function"
  ) {

    throw new TypeError(
      "withPokemonRecoveryContext requiere una operación."
    );
  }


  const uuid =
    actor.uuid;

  const depth =
    recoveryDepthByActor.get(
      uuid
    ) ??
    0;


  recoveryDepthByActor.set(
    uuid,
    depth + 1
  );


  try {

    return await operation();

  } finally {

    const currentDepth =
      recoveryDepthByActor.get(
        uuid
      ) ??
      1;


    if (
      currentDepth <= 1
    ) {

      recoveryDepthByActor.delete(
        uuid
      );

    } else {

      recoveryDepthByActor.set(
        uuid,
        currentDepth - 1
      );
    }
  }
}