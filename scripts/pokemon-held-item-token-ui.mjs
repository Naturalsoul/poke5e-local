import {
  getPokemonHeldItem
} from "./pokemon-held-item-service.mjs";

import {
  isPokemonActor
} from "./trainer-party-service.mjs";


const INDICATOR_MIN_SIZE =
  24;

const INDICATOR_MAX_SIZE =
  48;

const INDICATOR_SIZE_RATIO =
  0.34;

const INDICATOR_RIGHT_PROTRUSION_RATIO =
  0.05;

const INDICATOR_TOP_OFFSET_RATIO =
  0.30;

const TOKEN_INDICATORS =
  new WeakMap();


let registered =
  false;


/* ============================================================
 * VISIBILITY
 * ============================================================ */

function pokemonActorFromToken(
  token
) {

  const actor =
    token?.actor;


  return isPokemonActor(
    actor
  )
    ? actor
    : null;
}


function canCurrentUserSeeHeldItem(
  actor
) {

  return (
    game.user.isGM ||
    actor.isOwner
  );
}


/* ============================================================
 * SIZE / POSITION
 * ============================================================ */

function heldItemIndicatorSize(
  token
) {

  const width =
    Number(
      token?.w ??
      0
    );


  const height =
    Number(
      token?.h ??
      0
    );


  const tokenSize =
    Math.min(
      width,
      height
    );


  if (
    !Number.isFinite(
      tokenSize
    ) ||
    tokenSize <= 0
  ) {

    return INDICATOR_MIN_SIZE;
  }


  return Math.max(
    INDICATOR_MIN_SIZE,
    Math.min(
      INDICATOR_MAX_SIZE,
      tokenSize *
        INDICATOR_SIZE_RATIO
    )
  );
}


function heldItemIndicatorParent(
  token
) {

  return (
    token?.mesh
      ?.parent ??
    null
  );
}

function positionHeldItemIndicator(
  token,
  sprite
) {

  if (
    !token ||
    !sprite
  ) {

    return;
  }


  const bounds =
    token.bounds;


  const width =
    Number(
      bounds?.width ??
      0
    );


  const height =
    Number(
      bounds?.height ??
      0
    );


  const x =
    Number(
      bounds?.x
    );


  const y =
    Number(
      bounds?.y
    );


  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {

    return;
  }


  const size =
    heldItemIndicatorSize(
      token
    );


  sprite.width =
    size;

  sprite.height =
    size;


  /*
   * El Held Item continúa viviendo en el mismo
   * PrimaryCanvasGroup que token.mesh y permanece
   * detrás del Pokémon.
   *
   * Sin embargo, no lo dejamos completamente
   * dentro de token.bounds.
   *
   * Los sprites animados pueden ocupar una parte
   * mucho mayor del Token que los sprites estáticos
   * y ocultar casi completamente el Item.
   *
   * Desplazamos el centro ligeramente fuera del
   * borde derecho y cerca del borde superior.
   *
   * Con anchor 0.5:
   *
   * - aproximadamente la mitad del Item sobresale
   *   por la derecha;
   * - una pequeña parte sobresale por arriba;
   * - el resto continúa detrás del Pokémon.
   *
   * Esto evita depender del padding transparente
   * particular de cada PNG/WebM.
   */

  const rightProtrusion =
    size *
    INDICATOR_RIGHT_PROTRUSION_RATIO;


  const topOffset =
    size *
    INDICATOR_TOP_OFFSET_RATIO;


  sprite.x =
    x +
    width +
    rightProtrusion;


  sprite.y =
    y +
    topOffset;
}

function placeHeldItemIndicatorBehindToken(
  token,
  sprite
) {

  const parent =
    heldItemIndicatorParent(
      token
    );


  const mesh =
    token?.mesh;


  if (
    !parent ||
    !mesh ||
    !sprite
  ) {

    return false;
  }


  /*
   * Primera inserción.
   *
   * Insertamos el Held Item justo antes del
   * PrimarySpriteMesh del Pokémon.
   */
  if (
    sprite.parent !==
      parent
  ) {

    if (
      sprite.parent
    ) {

      sprite.parent.removeChild(
        sprite
      );
    }


    const meshIndex =
      parent.getChildIndex(
        mesh
      );


    parent.addChildAt(
      sprite,
      Math.max(
        0,
        meshIndex
      )
    );


    return true;
  }


  /*
   * Foundry puede reorganizar elementos del
   * PrimaryCanvasGroup durante refreshes.
   *
   * Volvemos a garantizar que el Item esté
   * inmediatamente antes del Pokémon.
   */
  const meshIndex =
    parent.getChildIndex(
      mesh
    );


  const spriteIndex =
    parent.getChildIndex(
      sprite
    );


  const targetIndex =
    Math.max(
      0,
      meshIndex -
        1
    );


  if (
    spriteIndex !==
      targetIndex
  ) {

    parent.setChildIndex(
      sprite,
      targetIndex
    );
  }


  return true;
}


/* ============================================================
 * INDICATOR
 * ============================================================ */

function removeHeldItemIndicator(
  token
) {

  const state =
    TOKEN_INDICATORS.get(
      token
    );


  if (!state) {

    return;
  }


  const sprite =
    state.sprite;


  if (
    sprite?.parent
  ) {

    sprite.parent.removeChild(
      sprite
    );
  }


  sprite?.destroy();


  TOKEN_INDICATORS.delete(
    token
  );
}


function createHeldItemIndicator(
  item
) {

  const source =
    String(
      item?.img ??
      ""
    ).trim();


  if (!source) {

    return null;
  }


  const sprite =
    foundry.canvas
      .containers
      .SpriteMesh
      .from(
        source
      );


  sprite.anchor.set(
    0.5
  );


  sprite.alpha =
    1;


  /*
   * Es una ayuda visual.
   *
   * No debe interceptar selección,
   * targeting ni movimiento del Token.
   */
  sprite.eventMode =
    "none";


  sprite.roundPixels =
    true;


  return sprite;
}


function syncHeldItemIndicator(
  token
) {

  const actor =
    pokemonActorFromToken(
      token
    );


  if (
    !actor ||
    !canCurrentUserSeeHeldItem(
      actor
    )
  ) {

    removeHeldItemIndicator(
      token
    );

    return;
  }


  const heldItem =
    getPokemonHeldItem(
      actor
    );


  if (!heldItem) {

    removeHeldItemIndicator(
      token
    );

    return;
  }


  const source =
    String(
      heldItem.img ??
      ""
    ).trim();


  if (!source) {

    removeHeldItemIndicator(
      token
    );

    return;
  }


  const current =
    TOKEN_INDICATORS.get(
      token
    );


  /*
   * El mismo Held Item ya está dibujado.
   *
   * Reafirmamos primero su posición en la
   * jerarquía para garantizar que siempre
   * quede detrás del mesh del Pokémon.
   */
  if (
    current?.itemId ===
      heldItem.id &&
    current?.source ===
      source &&
    current.sprite?.parent ===
      heldItemIndicatorParent(
        token
      )
  ) {

    placeHeldItemIndicatorBehindToken(
      token,
      current.sprite
    );


    positionHeldItemIndicator(
      token,
      current.sprite
    );

    return;
  }


  removeHeldItemIndicator(
    token
  );


  const sprite =
    createHeldItemIndicator(
      heldItem
    );


  if (!sprite) {

    return;
  }


  if (
    !placeHeldItemIndicatorBehindToken(
      token,
      sprite
    )
  ) {

    sprite.destroy();

    return;
  }


  TOKEN_INDICATORS.set(
    token,
    {
      itemId:
        heldItem.id,

      source,

      sprite
    }
  );


  positionHeldItemIndicator(
    token,
    sprite
  );
}


/* ============================================================
 * ACTOR → TOKENS
 * ============================================================ */

function tokenMatchesActor(
  token,
  actor
) {

  if (
    !token ||
    !actor
  ) {

    return false;
  }


  return (
    token.actor ===
      actor ||

    token.actor
      ?.uuid ===
      actor.uuid ||

    token.document
      ?.actorId ===
      actor.id
  );
}


function syncActorHeldItemIndicators(
  actor
) {

  if (
    !canvas.ready ||
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  const tokens =
    canvas.tokens
      ?.placeables ??
    [];


  for (
    const token
    of tokens
  ) {

    if (
      !tokenMatchesActor(
        token,
        actor
      )
    ) {

      continue;
    }


    syncHeldItemIndicator(
      token
    );
  }
}


/* ============================================================
 * DOCUMENT HOOKS
 * ============================================================ */

function onHeldItemDocumentChange(
  item
) {

  const actor =
    item?.parent;


  if (
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  syncActorHeldItemIndicators(
    actor
  );
}


/* ============================================================
 * REGISTER
 * ============================================================ */

export function registerPokemonHeldItemTokenUi() {

  if (registered) {

    return;
  }


  registered =
    true;


  /*
   * Initial canvas draw.
   */
  Hooks.on(
    "drawToken",
    token => {

      syncHeldItemIndicator(
        token
      );
    }
  );


  /*
   * Size / refresh changes.
   *
   * Si el objeto no cambió, sync no reconstruye
   * el sprite: únicamente reajusta tamaño/posición.
   */
  Hooks.on(
    "refreshToken",
    token => {

      syncHeldItemIndicator(
        token
      );
    }
  );


  Hooks.on(
    "destroyToken",
    token => {

      removeHeldItemIndicator(
        token
      );
    }
  );


  /*
   * El Held Item es un Embedded Item.
   *
   * Escuchamos su ciclo de vida para que el
   * indicador aparezca/desaparezca sin recargar
   * la Scene.
   */
  Hooks.on(
    "createItem",
    onHeldItemDocumentChange
  );


  Hooks.on(
    "updateItem",
    onHeldItemDocumentChange
  );


  Hooks.on(
    "deleteItem",
    onHeldItemDocumentChange
  );


  /*
   * heldItemId vive como flag del Actor.
   *
   * También cubre cambios de ownership y
   * Actors sintéticos de Tokens.
   */
  Hooks.on(
    "updateActor",
    actor => {

      syncActorHeldItemIndicators(
        actor
      );
    }
  );
}