// A rival trainer's rolled Pokémon climbs its level evolutions up to its own level, a random branch where they split.
// Only species the roll could have picked count, so region, level and a gym's single type still hold.
const levelOnly = (evolution, level) => {
  const conditions = evolution.conditions ?? [];
  return conditions.some(condition => condition.type === "level") &&
    conditions.every(condition => condition.type === "gender" || (condition.type === "level" && Number(condition.value) <= level));
};

export function evolveRolledPokemon(pokemon, { evolutions = [], pool = [], random = Math.random } = {}) {
  const allowed = new Set(pool.map(species => String(species.id)));
  let pokemonId = pokemon.pokemonId;
  for (let stage = 0; stage < 3; stage += 1) {
    const next = evolutions.filter(evolution => evolution.from === pokemonId && allowed.has(evolution.to) && levelOnly(evolution, pokemon.level));
    if (!next.length) {break;}
    pokemonId = next[Math.floor(random() * next.length)].to;
  }
  return pokemonId === pokemon.pokemonId ? pokemon : { ...pokemon, pokemonId };
}
