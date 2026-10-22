import { playPokemonCry } from "./pokemon-cry-service.mjs";

/* ============================================================
 * EXP GAIN ANIMATION
 *
 * The games' EXP bar: it fills while the number counts up and ticks, and if the Pokémon can level up it flashes,
 * plays a short fanfare and its cry, and offers the level-up. The sounds are synthesized (no audio files).
 * ============================================================ */

const MODULE_ID = "poke5e-local";

const LABELS = {
  es: { title: "¡Experiencia!", level: "Nv.", levelUp: "Subir de nivel", close: "Cerrar",
    ready: (name, level) => `¡${name} puede subir al Nv. ${level}!`,
    capped: (lost, level) => `Al nivel de su Entrenador (Nv. ${level}): ${lost.toLocaleString()} XP se pierden.` },
  en: { title: "Experience!", level: "Lv.", levelUp: "Level up", close: "Close",
    ready: (name, level) => `${name} can grow to Lv. ${level}!`,
    capped: (lost, level) => `At its trainer's level (Lv. ${level}): ${lost.toLocaleString()} XP are lost.` }
};

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

function volume() {
  try {
    return Number(game.settings.get("core", "globalInterfaceVolume")) || 0;
  } catch {
    return 0.5;
  }
}

// Short square blips (the bar's tick) and a rising arpeggio (the fanfare), on the interface volume.
function createSounds() {
  const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const level = volume() * 0.12;
  if (!AudioContext || !level) {return { tick() {}, fanfare() {}, close() {} };}
  const context = new AudioContext();
  const note = (frequency, start, length, type = "square") => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(level, context.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + start);
    oscillator.stop(context.currentTime + start + length);
  };
  return {
    tick: progress => note(660 + progress * 440, 0, 0.04),
    fanfare: () => [523, 659, 784, 1047].forEach((frequency, index) => note(frequency, index * 0.11, 0.22, "triangle")),
    close: () => setTimeout(() => context.close().catch(() => {}), 1500)
  };
}

/**
 * @param {{ actor: Actor, before: object, after: object, gained: number, lost: number }} gain  from claimReward
 */
export function showExperienceGain({ actor, before, after, gained, lost }) {
  const text = LABELS[game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es"];
  const ready = after.readyToLevel;
  const from = before.percent;
  const to = ready ? 100 : after.percent;

  const content = `
    <div class="poke5e-xp-gain__body">
      <img class="poke5e-xp-gain__portrait" src="${escape(actor.img)}" alt="">
      <div class="poke5e-xp-gain__info">
        <strong>${escape(actor.name)} <small>${text.level} ${before.level}</small></strong>
        <div class="poke5e-xp-gain__bar"><span style="width: ${from}%"></span></div>
        <span class="poke5e-xp-gain__count" aria-live="polite">+0 XP</span>
        <p class="poke5e-xp-gain__message" hidden></p>
      </div>
    </div>`;

  const animate = element => {
    const fill = element.querySelector(".poke5e-xp-gain__bar > span");
    const count = element.querySelector(".poke5e-xp-gain__count");
    const message = element.querySelector(".poke5e-xp-gain__message");
    const levelUp = element.querySelector('[data-action="level-up"]');
    if (levelUp) {levelUp.disabled = true;}
    const sounds = createSounds();
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const duration = reduced ? 0 : 900 + 900 * Math.min(1, Math.abs(to - from) / 100);
    const started = performance.now();
    let lastTick = 0;

    const finish = () => {
      fill.style.width = `${to}%`;
      count.textContent = `+${gained.toLocaleString()} XP`;
      if (ready) {
        element.classList.add("is-ready");
        message.textContent = text.ready(actor.name, before.level + 1);
        sounds.fanfare();
        void playPokemonCry(actor);
        if (levelUp) {levelUp.disabled = false;}
      } else if (lost > 0 && after.atLevelCap) {
        element.classList.add("is-capped");
        message.textContent = text.capped(lost, after.levelCap);
      }
      message.hidden = !message.textContent;
      sounds.close();
    };

    const frame = now => {
      const t = duration ? Math.min(1, (now - started) / duration) : 1;
      const eased = 1 - (1 - t) ** 3;
      fill.style.width = `${from + (to - from) * eased}%`;
      count.textContent = `+${Math.round(gained * eased).toLocaleString()} XP`;
      if (now - lastTick > 70 && t < 1) {
        sounds.tick(eased);
        lastTick = now;
      }
      if (t < 1) {requestAnimationFrame(frame);} else {finish();}
    };
    requestAnimationFrame(frame);
  };

  void foundry.applications.api.DialogV2.wait({
    window: { title: text.title, icon: "fa-solid fa-star" },
    classes: ["poke5e-xp-gain"],
    position: { width: 400 },
    content,
    render: (event, dialog) => animate(dialog.element),
    buttons: [
      ...(ready ? [{ action: "level-up", label: text.levelUp, icon: "fa-solid fa-arrow-up",
        // Loaded on click: the level-up dialog pulls in the whole importer.
        callback: () => void import("./pokemon-level-up-dialog.mjs").then(({ openPokemonLevelUpDialog }) => openPokemonLevelUpDialog(actor)) }] : []),
      { action: "close", label: text.close, icon: "fa-solid fa-check", default: !ready }
    ],
    rejectClose: false
  });
}
