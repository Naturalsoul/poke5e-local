const MODULE_ID = "poke5e-local";
const LABELS = {
  es: { title: "Efectos de movimientos", active: "Activo", paused: "Pausado", edit: "Editar efecto",
    pause: "Pausar efecto", resume: "Reactivar efecto", remove: "Eliminar efecto",
    gmOnly: "Solo el GM puede administrar estos efectos.", unavailable: "El efecto ya no está disponible." },
  en: { title: "Move effects", active: "Active", paused: "Paused", edit: "Edit effect",
    pause: "Pause effect", resume: "Resume effect", remove: "Remove effect",
    gmOnly: "Only the GM can manage these effects.", unavailable: "This effect is no longer available." }
};

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export function getPokemonMoveEffects(pokemon) {
  const concentrationIds = new Set(Array.from(pokemon.concentration?.effects ?? [], effect => effect.id));
  return Array.from(pokemon.effects ?? []).filter(effect => effect.id && !concentrationIds.has(effect.id) &&
    (effect.getFlag(MODULE_ID, "kind") === "pokemon-periodic" || effect.getFlag(MODULE_ID, "sourceMove")));
}

export function pokemonMoveEffectsMarkup(pokemon, language = "es") {
  const effects = getPokemonMoveEffects(pokemon);
  if (!effects.length) {return "";}
  const labels = LABELS[language] ?? LABELS.es;
  const button = (effect, action, icon, label) => `<button type="button"
    class="poke5e-pokemon-concentration__end" data-pokemon-sheet-action="move-effect-${action}"
    data-effect-id="${escape(effect.id)}" title="${escape(label)}" aria-label="${escape(label)}">
    <i class="fa-solid ${icon}" aria-hidden="true"></i></button>`;
  return `<section class="poke5e-pokemon-panel poke5e-pokemon-panel--concentration poke5e-pokemon-panel--move-effects">
    <header><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><h3>${escape(labels.title)}</h3></header>
    <div class="poke5e-pokemon-concentrations">${effects.map(effect => `
      <article class="poke5e-pokemon-concentration${effect.disabled ? " is-paused" : ""}" data-effect-id="${escape(effect.id)}">
        <div class="poke5e-pokemon-concentration__icon"><img src="${escape(effect.img || "icons/svg/aura.svg")}" alt=""></div>
        <div class="poke5e-pokemon-concentration__body">
          <small>${escape(effect.disabled ? labels.paused : labels.active)}</small>
          <strong title="${escape(effect.name)}">${escape(effect.name)}</strong>
          ${effect.duration?.label ? `<small>${escape(effect.duration.label)}</small>` : ""}
        </div>
        ${game.user.isGM ? `<div class="poke5e-pokemon-move-effect__controls">
          ${button(effect, "edit", "fa-pen-to-square", labels.edit)}
          ${button(effect, "toggle", effect.disabled ? "fa-play" : "fa-pause", effect.disabled ? labels.resume : labels.pause)}
          ${button(effect, "remove", "fa-xmark", labels.remove)}
        </div>` : ""}
      </article>`).join("")}</div></section>`;
}

export async function managePokemonMoveEffect(pokemon, effectId, action, language = "es") {
  const labels = LABELS[language] ?? LABELS.es;
  if (!game.user.isGM) {throw new Error(labels.gmOnly);}
  const effect = getPokemonMoveEffects(pokemon).find(entry => entry.id === effectId);
  if (!effect) {throw new Error(labels.unavailable);}
  switch (action) {
    case "edit": return effect.sheet.render(true);
    case "toggle": return effect.update({ disabled: !effect.disabled });
    case "remove": return effect.delete();
    default: throw new Error(labels.unavailable);
  }
}
