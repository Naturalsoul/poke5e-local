const MODULE_ID = "poke5e-local";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOCKET_MESSAGE_TYPE = "scene-transition";
const FLAG_KEY = "sceneTransition";
const DEFAULT_SETTING = "sceneTransitionDefault";
const DURATION_SETTING = "sceneTransitionDuration";
const OVERLAY_CLASS = "poke5e-scene-transition";
const STUCK_TIMEOUT = 20000;
const PENDING_TTL = 10000;

export const SCENE_TRANSITION_EFFECTS = Object.freeze(["grow", "rain", "close"]);

const EFFECT_LABELS = {
  none: "Ninguna",
  grow: "Pokéball que crece",
  rain: "Lluvia de Pokéballs",
  close: "Pokéball que se cierra",
  random: "Aleatoria"
};

const RED = "#E24B4A";
const WHITE = "#F7F7F2";
const BLACK = "#2C2C2A";
const EASE_IN = "cubic-bezier(0.55, 0, 1, 0.45)";
const EASE_OUT = "cubic-bezier(0, 0.55, 0.45, 1)";
const EASE_BACK = "cubic-bezier(0.34, 1.56, 0.64, 1)";

let registered = false;
let active = null;
let apiOverride = null;
const pending = new Map();


/* Turns a scene flag and the world default into a concrete effect, or null for no transition. */
export function resolveSceneTransitionEffect(flagValue, defaultValue, random = Math.random) {
  const value = flagValue || defaultValue || "none";
  if (value === "random") {
    return SCENE_TRANSITION_EFFECTS[Math.floor(random() * SCENE_TRANSITION_EFFECTS.length)];
  }
  return SCENE_TRANSITION_EFFECTS.includes(value) ? value : null;
}


export function registerSceneTransitionService() {
  if (registered) {return;}
  registered = true;

  game.settings.register(MODULE_ID, DEFAULT_SETTING, {
    name: "Poke5e - Transición al cambiar de escena",
    hint: "La Pokéball que se ve al activar o ver una escena. Cada escena puede elegir la suya en su configuración.",
    scope: "world",
    config: true,
    type: String,
    choices: { ...EFFECT_LABELS },
    default: "none"
  });

  game.settings.register(MODULE_ID, DURATION_SETTING, {
    name: "Poke5e - Duración de la transición de escena",
    hint: "Milisegundos que tarda la Pokéball en cerrarse, y otros tantos en abrirse.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 500, max: 3000, step: 100 },
    default: 1400
  });

  wrapSceneView();
  Hooks.on("renderSceneConfig", injectSceneConfigField);
  Hooks.on("preUpdateScene", announceActivation);

  Hooks.once("ready", () => {
    game.socket.on(SOCKET_CHANNEL, payload => {
      if (payload?.type !== SOCKET_MESSAGE_TYPE) {return;}
      pending.set(payload.sceneId, { effect: payload.effect, at: Date.now() });
    });
  });
}


/* Macro / Region API: changeScene("Ciudad Carmín", "close"). Without an effect, uses the scene's own. */
export async function changeSceneWithTransition(sceneRef, effect) {
  if (!game.user.isGM) {
    ui.notifications.warn("Solo el GM puede cambiar de escena.");
    return false;
  }
  const scene = sceneRef instanceof Scene ? sceneRef : (game.scenes.get(sceneRef) ?? game.scenes.getName(sceneRef));
  if (!scene) {
    ui.notifications.error(`No existe la escena: ${sceneRef}`);
    return false;
  }
  apiOverride = effect ? { sceneId: scene.id, effect } : null;
  try {
    await scene.activate();
  } finally {
    apiOverride = null;
  }
  return true;
}


function sceneEffect(scene) {
  return resolveSceneTransitionEffect(scene.getFlag(MODULE_ID, FLAG_KEY) || "", game.settings.get(MODULE_ID, DEFAULT_SETTING));
}


/* The GM picks the effect once and tells everyone, so "random" and macro overrides look the same on every screen. */
function announceActivation(scene, changed) {
  if (changed.active !== true || !game.user.isGM) {return;}
  const chosen = apiOverride?.sceneId === scene.id
    ? resolveSceneTransitionEffect(apiOverride.effect, "none")
    : sceneEffect(scene);
  const effect = chosen ?? "none";
  pending.set(scene.id, { effect, at: Date.now() });
  game.socket.emit(SOCKET_CHANNEL, { type: SOCKET_MESSAGE_TYPE, sceneId: scene.id, effect });
}

function takePendingEffect(scene) {
  const entry = pending.get(scene.id);
  pending.delete(scene.id);
  if (!entry || Date.now() - entry.at > PENDING_TTL) {return undefined;}
  return entry.effect === "none" ? null : entry.effect;
}


/* Activation, "View Scene" and "Pull players" all end in Scene#view, so one wrapper covers them. */
function wrapSceneView() {
  const proto = CONFIG.Scene.documentClass.prototype;
  const original = proto.view;
  proto.view = async function viewWithTransition(...args) {
    const changing = canvas.initialized && !canvas.loading && canvas.scene?.id !== this.id
      && !game.settings.get("core", "noCanvas");
    if (!changing) {return original.apply(this, args);}

    const announced = takePendingEffect(this);
    const effect = announced === undefined ? sceneEffect(this) : announced;
    if (!effect) {return original.apply(this, args);}

    await cover(effect, this.id);
    try {
      return await original.apply(this, args);
    } finally {
      void reveal();
    }
  };
}


/* ============================================================
 * SCENE CONFIG
 * ============================================================ */

function injectSceneConfigField(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(`[name="flags.${MODULE_ID}.${FLAG_KEY}"]`)) {return;}

  const tab = root.querySelector('.tab[data-tab="basics"]') ?? root.querySelector("form .tab") ?? root.querySelector("form");
  if (!tab) {return;}

  const current = app.document.getFlag(MODULE_ID, FLAG_KEY) || "";
  const worldLabel = EFFECT_LABELS[game.settings.get(MODULE_ID, DEFAULT_SETTING)] ?? EFFECT_LABELS.none;
  const options = [["", `Por defecto del mundo (${worldLabel})`], ...Object.entries(EFFECT_LABELS)]
    .map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`)
    .join("");

  const group = document.createElement("div");
  group.className = "form-group";
  group.innerHTML = `
    <label>Transición Pokéball</label>
    <div class="form-fields"><select name="flags.${MODULE_ID}.${FLAG_KEY}">${options}</select></div>
    <p class="hint">Se ve al activar o ver esta escena.</p>`;
  tab.append(group);
}


/* ============================================================
 * OVERLAY
 * ============================================================ */

function cover(effect, sceneId) {
  active?.remove();

  const root = document.createElement("div");
  root.className = OVERLAY_CLASS;
  const width = window.innerWidth;
  document.body.append(root);

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const build = EFFECTS[!reduced && EFFECTS[effect] ? effect : "fade"];
  const state = {
    sceneId,
    duration: game.settings.get(MODULE_ID, DURATION_SETTING),
    fx: build(root, width, window.innerHeight),
    revealing: false,
    stuckTimer: window.setTimeout(() => void reveal(), STUCK_TIMEOUT),
    remove() {
      window.clearTimeout(state.stuckTimer);
      root.remove();
      if (active === state) {active = null;}
    }
  };
  active = state;
  state.covered = state.fx.cover(state.duration);
  return state.covered;
}

async function reveal() {
  const state = active;
  if (!state || state.revealing) {return;}
  state.revealing = true;
  await state.covered;
  if (active !== state) {return;}
  await state.fx.reveal(state.duration);
  state.remove();
}


/* ============================================================
 * EFFECTS — transform/opacity animations run on the compositor,
 * so they stay smooth while Foundry loads the new scene.
 * ============================================================ */

function run(element, keyframes, options) {
  return element.animate(keyframes, { fill: "both", ...options }).finished.catch(() => undefined);
}

function el(parent, style) {
  const node = document.createElement("div");
  Object.assign(node.style, { position: "absolute", ...style });
  parent.append(node);
  return node;
}

function halfSvg(top) {
  const sweep = top ? 1 : 0;
  const y = top ? -8 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 ${top ? -100 : 0} 200 100" width="100%" height="100%">`
    + `<path d="M-96 0 A96 96 0 0 ${sweep} 96 0 Z" fill="${top ? RED : WHITE}" stroke="${BLACK}" stroke-width="6"/>`
    + `<rect x="-96" y="${y}" width="192" height="8" fill="${BLACK}"/>`
    + `<path d="M-30 0 A30 30 0 0 ${sweep} 30 0 Z" fill="${BLACK}"/>`
    + `<path d="M-19 0 A19 19 0 0 ${sweep} 19 0 Z" fill="${WHITE}"/></svg>`;
}

const BALL_IMAGE = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200">${halfSvg(true).replace(/^<svg[^>]*>|<\/svg>$/g, "")}${halfSvg(false).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`
)}")`;

const EFFECTS = {
  grow(root, w, h) {
    const size = Math.hypot(w, h) + 80;
    const ball = el(root, { left: `${(w - size) / 2}px`, top: `${(h - size) / 2}px`, width: `${size}px`, height: `${size}px`, willChange: "transform" });
    const top = el(ball, { left: 0, top: 0, width: "100%", height: "50%" });
    const bottom = el(ball, { left: 0, top: "50%", width: "100%", height: "50%" });
    top.innerHTML = halfSvg(true);
    bottom.innerHTML = halfSvg(false);
    return {
      cover: duration => run(ball, [{ transform: "scale(0) rotate(0deg)" }, { transform: "scale(1) rotate(720deg)" }], { duration, easing: EASE_IN }),
      reveal: duration => Promise.all([
        run(top, [{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }], { duration, easing: EASE_IN }),
        run(bottom, [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], { duration, easing: EASE_IN })
      ])
    };
  },

  rain(root, w, h) {
    const cell = 64;
    const radius = 46;
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    const balls = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const node = el(root, {
          left: `${c * cell - radius}px`, top: `${r * cell - radius}px`,
          width: `${radius * 2}px`, height: `${radius * 2}px`,
          backgroundImage: BALL_IMAGE, backgroundSize: "100% 100%", transform: "scale(0)"
        });
        balls.push({ node, wave: (c + r) / (cols + rows - 2) });
      }
    }
    const play = (duration, keyframes, easing) => Promise.all(balls.map(({ node, wave }) =>
      run(node, keyframes, { duration: duration * 0.45, delay: duration * 0.55 * wave, easing })));
    return {
      cover: duration => play(duration, [{ transform: "scale(0) rotate(0deg)" }, { transform: "scale(1) rotate(360deg)" }], EASE_BACK),
      reveal: duration => play(duration, [{ transform: "scale(1) rotate(360deg)" }, { transform: "scale(0) rotate(720deg)" }], EASE_IN)
    };
  },

  close(root, w, h) {
    const band = Math.max(10, h * 0.03);
    const button = Math.min(w, h) * 0.12;
    const panel = (isTop) => {
      const node = el(root, { left: 0, width: "100%", height: "50%", [isTop ? "top" : "bottom"]: 0, background: isTop ? RED : WHITE });
      const edge = isTop ? "bottom" : "top";
      el(node, { left: 0, width: "100%", height: `${band}px`, [edge]: 0, background: BLACK });
      const round = isTop ? `${button}px ${button}px 0 0` : `0 0 ${button}px ${button}px`;
      const inner = button * 0.64;
      el(node, { left: `calc(50% - ${button}px)`, [edge]: 0, width: `${button * 2}px`, height: `${button}px`, borderRadius: round, background: BLACK });
      el(node, {
        left: `calc(50% - ${inner}px)`, [edge]: 0, width: `${inner * 2}px`, height: `${inner}px`,
        borderRadius: isTop ? `${inner}px ${inner}px 0 0` : `0 0 ${inner}px ${inner}px`, background: WHITE
      });
      return node;
    };
    const top = panel(true);
    const bottom = panel(false);
    const flash = el(root, {
      left: `calc(50% - ${button * 0.45}px)`, top: `calc(50% - ${button * 0.45}px)`,
      width: `${button * 0.9}px`, height: `${button * 0.9}px`, borderRadius: "50%", background: "#FFFFFF", opacity: 0
    });
    return {
      cover: async duration => {
        await Promise.all([
          run(top, [{ transform: "translateY(-100%)" }, { transform: "translateY(0)" }], { duration, easing: EASE_OUT }),
          run(bottom, [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], { duration, easing: EASE_OUT })
        ]);
        await run(flash, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 300 });
      },
      reveal: duration => Promise.all([
        run(top, [{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }], { duration, easing: EASE_IN }),
        run(bottom, [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], { duration, easing: EASE_IN })
      ])
    };
  },

  fade(root) {
    const veil = el(root, { inset: 0, background: BLACK });
    return {
      cover: duration => run(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: duration / 2 }),
      reveal: duration => run(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: duration / 2 })
    };
  }
};
