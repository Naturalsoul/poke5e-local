import { playerTeams, pokemonLevel } from "./encounter-difficulty.mjs";
import { encounterShare } from "./encounter-xp-service.mjs";
import { addPokemonExperience } from "./pokemon-experience-service.mjs";

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

/**
 * After the fight: the GM ticks the players' Pokémon that took part and are still standing, each gets its share
 * (catch-up XP in an optional encounter, so the weaker get more), editable before it's given. A chat message (to the
 * GM) sums up the XP, the money of a trainer battle (poke5e: highest level d4 × 100 per trainer) and any loot.
 *
 * @param {{ rows: { level: number, sr: any, quantity: number }[], context: object | null, optional: boolean,
 *   name: string, trainers: number, loot: string[] }} encounter
 */
export async function awardEncounterXp({ rows, context, optional, name, trainers, loot }) {
  const teams = playerTeams().filter(({ pokemon }) => pokemon.length);
  if (!teams.length) {
    ui.notifications.warn("No hay Pokémon de jugadores a los que repartir XP.");
    return;
  }

  const content = `
    <p class="poke5e-xp-award__hint">
      Marca los Pokémon que participaron y siguen en pie: la XP se divide entre ellos${
        optional ? ". Encuentro opcional: los más débiles reciben más (XP de recuperación)" : ""}.
    </p>
    <div class="poke5e-xp-award__list">
      ${teams.map(({ trainer, pokemon }) => `
        <section class="poke5e-xp-award__trainer">
          <h4>${escape(trainer.name)}</h4>
          <div class="poke5e-xp-award__grid">
            ${pokemon.map(actor => `
              <label class="poke5e-xp-award__pokemon">
                <input type="checkbox" data-uuid="${actor.uuid}" data-level="${pokemonLevel(actor)}">
                <img src="${escape(actor.img)}" alt="">
                <span class="poke5e-xp-award__name">
                  <strong>${escape(actor.name)}</strong>
                  <small>Nv. ${pokemonLevel(actor)}</small>
                </span>
                <span class="poke5e-xp-award__share">
                  <input type="number" data-share="${actor.uuid}" min="0" step="1" value="0" disabled
                    aria-label="XP para ${escape(actor.name)}">
                  <small>XP</small>
                </span>
              </label>`).join("")}
          </div>
        </section>`).join("")}
    </div>
    <p class="poke5e-xp-award__summary" data-role="summary">Ningún Pokémon marcado.</p>`;

  const refresh = element => {
    const boxes = [...element.querySelectorAll("input[type=checkbox]")];
    const checked = boxes.filter(box => box.checked);
    let total = 0;
    for (const box of boxes) {
      const share = element.querySelector(`[data-share="${box.dataset.uuid}"]`);
      share.disabled = !box.checked;
      share.value = box.checked ? encounterShare(rows, Number(box.dataset.level), checked.length, { context, optional }) : 0;
      total += Number(share.value);
    }
    element.querySelector('[data-role="summary"]').textContent = checked.length
      ? `${checked.length} Pokémon · ${total.toLocaleString()} XP en total`
      : "Ningún Pokémon marcado.";
  };

  const awarded = await foundry.applications.api.DialogV2.wait({
    window: { title: `Repartir XP · ${name}`, icon: "fa-solid fa-gift" },
    classes: ["poke5e-xp-award"],
    position: { width: 560 },
    content,
    render: (event, dialog) => {
      const element = dialog.element;
      element.querySelectorAll("input[type=checkbox]").forEach(box => box.addEventListener("change", () => refresh(element)));
    },
    buttons: [
      {
        action: "award",
        label: "Entregar",
        icon: "fa-solid fa-gift",
        default: true,
        callback: (event, button) => [...button.form.querySelectorAll("input[type=checkbox]:checked")]
          .map(box => ({ uuid: box.dataset.uuid, xp: Math.max(0, Math.trunc(Number(button.form.querySelector(`[data-share="${box.dataset.uuid}"]`).value) || 0)) }))
      },
      { action: "cancel", label: "Cancelar", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!Array.isArray(awarded) || !awarded.length) {return;}

  const lines = [];
  for (const { uuid, xp } of awarded) {
    const actor = fromUuidSync(uuid);
    if (!actor || !xp) {continue;}
    const before = pokemonLevel(actor);
    await addPokemonExperience(actor, xp);
    const after = pokemonLevel(actor);
    lines.push(`<li>${escape(actor.name)}: +${xp} XP${after > before ? ` → <strong>Nv. ${after}</strong>` : ""}</li>`);
  }

  let money = "";
  if (trainers > 0) {
    const highest = Math.max(1, ...rows.map(row => row.level));
    const roll = await new Roll(`${trainers * highest}d4 * 100`).evaluate();
    money = `<p>Dinero (${trainers} × ${highest}d4 × 100): <strong>${roll.total} ₽</strong></p>`;
  }

  await ChatMessage.create({
    content: `<h3>${escape(name)}${optional ? " (opcional)" : ""}</h3><ul>${lines.join("")}</ul>${money}${
      loot.length ? `<p>Botín sugerido:</p><ul>${loot.map(each => `<li>${escape(each)}</li>`).join("")}</ul>` : ""}`,
    whisper: ChatMessage.getWhisperRecipients("GM")
  });
}
