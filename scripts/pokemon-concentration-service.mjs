const DND5E_NAMESPACE =
  "dnd5e";


function assertActor(
  pokemon
) {

  if (
    pokemon?.documentName !==
    "Actor"
  ) {

    throw new Error(
      "Se requiere un Actor válido para gestionar Concentración."
    );
  }
}


function resolveConcentrationSource(
  pokemon,
  effect
) {

  const itemData =
    effect.getFlag(
      DND5E_NAMESPACE,
      "item"
    ) ??
    {};


  const itemId =
    String(
      itemData.id ??
      itemData.data?._id ??
      ""
    )
      .trim();


  const embeddedItem =
    itemId
      ? pokemon.items.get(
          itemId
        )
      : null;


  return {
    name:
      embeddedItem?.name ??
      itemData.data?.name ??
      effect.name ??
      "Concentration",

    img:
      embeddedItem?.img ??
      itemData.data?.img ??
      effect.img ??
      null
  };
}


export function getPokemonConcentrations(
  pokemon
) {

  assertActor(
    pokemon
  );


  const effects =
    pokemon.concentration
      ?.effects;


  if (
    !effects ||
    typeof effects[
      Symbol.iterator
    ] !== "function"
  ) {

    return [];
  }


  return [
    ...effects
  ]
    .filter(
      effect =>
        Boolean(
          effect?.id
        )
    )
    .map(
      effect => {

        const source =
          resolveConcentrationSource(
            pokemon,
            effect
          );


        return {
          effectId:
            effect.id,

          name:
            source.name,

          img:
            source.img
        };
      }
    );
}


export async function endPokemonConcentration(
  pokemon,
  effectId
) {

  assertActor(
    pokemon
  );


  if (
    typeof pokemon.endConcentration !==
    "function"
  ) {

    throw new Error(
      "D&D5e no expone endConcentration para este Actor."
    );
  }


  const normalizedEffectId =
    String(
      effectId ??
      ""
    )
      .trim();


  if (!normalizedEffectId) {

    return false;
  }


  const concentration =
    getPokemonConcentrations(
      pokemon
    )
      .find(
        entry =>
          entry.effectId ===
          normalizedEffectId
      );


  if (!concentration) {

    return false;
  }


  await pokemon.endConcentration(
    normalizedEffectId
  );


  return true;
}