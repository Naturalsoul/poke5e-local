/*
 * Raising a trainer battle's difficulty one step at a time, on the encounter as it is (no regeneration). The steps go
 * from the games' ways (more Pokémon out at once, better Pokémon) to levels, which are last: they're the power creep.
 * Climbing takes the gentlest steps that still raise the difficulty until the next tier; going down undoes the last.
 *
 * An encounter here is { trainers, rows, boosts: { statBonus, coverage, items } }. A step's apply gets a copy and
 * returns it changed, or null when it can't apply; the random ones (new Pokémon, new trainer) come from tools.
 */

const rowsOf = (state, trainer) => state.rows.filter(row => row.trainerId === trainer.id);

// A new Pokémon gets its Moves now if the extras choose them (best moveset, coverage), like the others.
const withOwnMoves = (row, boosts, tools) => (boosts.bestMoves || boosts.coverage
  ? { ...row, moveIds: tools.pickMoves?.(row, boosts) ?? row.moveIds }
  : row);

// With these extras, every Pokémon's Moves chosen again (so the composition shows them).
const withMoves = (state, boosts, tools) => {
  const next = { ...state, boosts };
  next.rows = state.rows.map(row => ({ ...row, moveIds: tools.pickMoves?.(row, boosts) ?? row.moveIds }));
  return next;
};

export const TRAINER_STEPS = Object.freeze([
  {
    id: "on-field",
    label: "+1 Pokémon en campo",
    hint: "Un Entrenador saca un Pokémon más a la vez (1+N).",
    apply: state => {
      const trainer = state.trainers.find(each => (each.onField ?? 1) < rowsOf(state, each).length);
      if (!trainer) {return null;}
      trainer.onField = (trainer.onField ?? 1) + 1;
      return state;
    }
  },
  {
    id: "stats-1",
    label: "Características +1",
    hint: "Sus Pokémon tienen +1 en todas las características.",
    apply: state => (state.boosts.statBonus >= 1 ? null : { ...state, boosts: { ...state.boosts, statBonus: 1 } })
  },
  {
    id: "coverage",
    label: "Cobertura súper eficaz",
    hint: "Cada Pokémon aprende, si puede, un Move súper eficaz contra el equipo de los jugadores.",
    apply: (state, tools) => (state.boosts.coverage ? null : withMoves(state, { ...state.boosts, coverage: true }, tools))
  },
  {
    id: "items",
    label: "Objetos garantizados",
    hint: "Cada Pokémon lleva un objeto equipado o una baya, elegido ya: se ve en la composición.",
    apply: (state, tools) => {
      if (state.boosts.items) {return null;}
      for (const row of state.rows.filter(each => !(each.itemResolved && each.itemId))) {
        const itemId = tools.rollItem?.();
        if (itemId) {Object.assign(row, { itemId, itemResolved: true });}
      }
      return { ...state, boosts: { ...state.boosts, items: true } };
    }
  },
  {
    id: "moves",
    label: "Mejores Moves",
    hint: "Cada Pokémon lleva su mejor combinación de Moves de nivel y de huevo: su ataque STAB más fuerte, otros tipos y uno de estado.",
    apply: (state, tools) => (state.boosts.bestMoves ? null : withMoves(state, { ...state.boosts, bestMoves: true }, tools))
  },
  {
    id: "team",
    label: "+1 Pokémon al equipo",
    hint: "El Entrenador con el equipo más corto suma un Pokémon de su arquetipo (repetido, se reparte entre todos).",
    apply: (state, tools) => {
      const open = state.trainers.filter(each => rowsOf(state, each).length < 6);
      const trainer = open.reduce((best, each) => (!best || rowsOf(state, each).length < rowsOf(state, best).length ? each : best), null);
      if (!trainer) {return null;}
      const row = tools.addPokemon(trainer, rowsOf(state, trainer));
      if (!row) {return null;}
      state.rows.push(withOwnMoves(row, state.boosts, tools));
      return state;
    }
  },
  {
    id: "helper",
    label: "+1 Entrenador de apoyo",
    hint: "Se suma un Entrenador del mismo arquetipo, de nivel de ruta.",
    apply: (state, tools) => {
      if (!state.trainers.length || state.trainers.length >= 4) {return null;}
      const helper = tools.addTrainer(state.trainers[0]);
      if (!helper) {return null;}
      state.trainers.push(helper.trainer);
      state.rows.push(...helper.rows.map(row => withOwnMoves(row, state.boosts, tools)));
      return state;
    }
  },
  {
    id: "tm-moves",
    label: "Moves de MT",
    hint: "Su mejor combinación suma las MT que pueden aprender: los Moves más fuertes, así que va después de los de nivel y huevo.",
    apply: (state, tools) => (state.boosts.tmMoves
      ? null
      : withMoves(state, { ...state.boosts, bestMoves: true, tmMoves: true }, tools))
  },
  {
    id: "stats-2",
    label: "Características +2",
    hint: "Sus Pokémon tienen +2 en todas las características.",
    apply: state => (state.boosts.statBonus >= 2 ? null : { ...state, boosts: { ...state.boosts, statBonus: 2 } })
  },
  {
    id: "ace",
    label: "As +1 nivel",
    hint: "El Pokémon más fuerte de un Entrenador sube un nivel: el del Entrenador con el As más bajo, así que repetido rota entre todos. Sube niveles (power creep): va después de lo demás.",
    creep: true,
    apply: (state, tools) => {
      const aceOf = trainer => rowsOf(state, trainer).reduce((best, row) => (!best || row.level > best.level ? row : best), null);
      const ace = state.trainers
        .map(aceOf)
        .filter(each => each && each.level < tools.maxAceLevel)
        .reduce((lowest, each) => (!lowest || each.level < lowest.level ? each : lowest), null);
      if (!ace) {return null;}
      ace.level += 1;
      return state;
    }
  },
  {
    id: "levels",
    label: "+1 nivel a todos",
    hint: "Todos sus Pokémon suben un nivel. Es lo que más infla la campaña (power creep): úsalo al final.",
    creep: true,
    apply: (state, tools) => {
      if (!state.rows.length || state.rows.some(row => row.level >= tools.maxLevel)) {return null;}
      state.rows.forEach(row => { row.level += 1; });
      return state;
    }
  }
]);

/**
 * Every step's outcome on this encounter, measured: [{ step, state, ratio, tier }], null state where it can't apply.
 */
export function previewSteps(state, tools, measure) {
  return TRAINER_STEPS.map(step => {
    const next = step.apply(structuredClone(state), tools);
    return { step, state: next, ...(next ? measure(next) : {}) };
  });
}

// "Subir un paso": the gentlest step that raises the difficulty; levels (the power creep) only when nothing else can.
export function nextStep(previews, currentRatio) {
  const raising = previews.filter(preview => preview.state && preview.ratio > currentRatio);
  const gentlest = options => options.reduce((best, each) => (!best || each.ratio < best.ratio ? each : best), null);
  return gentlest(raising.filter(preview => !preview.step.creep)) ?? gentlest(raising);
}

/**
 * Up to the next tier: the gentlest steps, one after another, until the tier changes. { state, steps, tier } or null
 * when nothing raises it any more; if the steps run out first, as high as they get.
 */
export function climbToNextTier(state, tools, measure, limit = 40) {
  const start = measure(state);
  let current = { state, ...start };
  const steps = [];
  for (let i = 0; i < limit && current.tier.id === start.tier.id; i += 1) {
    const step = nextStep(previewSteps(current.state, tools, measure), current.ratio);
    if (!step) {break;}
    steps.push(step.step);
    current = step;
  }
  return steps.length ? { state: current.state, steps, tier: current.tier } : null;
}
