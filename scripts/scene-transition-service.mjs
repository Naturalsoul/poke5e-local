const MODULE_ID = "poke5e-local";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOCKET_MESSAGE_TYPE = "scene-transition";
const FLAG_KEY = "sceneTransition";
const DEFAULT_SETTING = "sceneTransitionDefault";
const DURATION_SETTING = "sceneTransitionDuration";
const OVERLAY_CLASS = "poke5e-scene-transition";
const STUCK_TIMEOUT = 20000;
const PENDING_TTL = 10000;

/* "random" draws from these; the Team Rocket R is a faction effect, so it is only picked on purpose. */
export const SCENE_TRANSITION_EFFECTS = Object.freeze(["grow", "rain", "close", "stripes", "spiral", "mosaic"]);
const ALL_EFFECTS = [...SCENE_TRANSITION_EFFECTS, "rocket"];

const EFFECT_LABELS = {
  none: "Ninguna",
  grow: "Pokéball que crece",
  rain: "Lluvia de Pokéballs",
  close: "Pokéball que se cierra",
  stripes: "Franjas (GBA)",
  spiral: "Espiral (GBA)",
  mosaic: "Mosaico (GBA)",
  rocket: "R del Team Rocket",
  random: "Aleatoria"
};

const RED = "#E24B4A";
const WHITE = "#F7F7F2";
const BLACK = "#2C2C2A";
const ROCKET_RED = "#C80000";
const EASE_IN = "cubic-bezier(0.55, 0, 1, 0.45)";
const EASE_OUT = "cubic-bezier(0, 0.55, 0.45, 1)";
const EASE_BACK = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/* Decorations live on the top half only, so the halves can still split apart. Coordinates: radius-96 ball centred at 0,0. */
const BALLS = {
  poke: { top: RED },
  great: {
    top: "#3B7DD8",
    deco: `<path d="M-84 -44 Q-74 -70 -50 -84 L-44 -60 Q-62 -54 -70 -38 Z" fill="${RED}"/>`
      + `<path d="M84 -44 Q74 -70 50 -84 L44 -60 Q62 -54 70 -38 Z" fill="${RED}"/>`
  },
  ultra: {
    top: "#2E2E33",
    deco: `<path d="M-54 0 V-79 Q-43 -86 -32 -90 V0 Z" fill="#F2C53D"/>`
      + `<path d="M54 0 V-79 Q43 -86 32 -90 V0 Z" fill="#F2C53D"/>`
  },
  master: {
    top: "#7B3FA0",
    deco: `<circle cx="-50" cy="-52" r="16" fill="#E86BA8"/><circle cx="50" cy="-52" r="16" fill="#E86BA8"/>`
      + `<path d="M-22 -30 V-70 L0 -48 L22 -70 V-30 H12 V-50 L0 -38 L-12 -50 V-30 Z" fill="${WHITE}"/>`
  },
  premier: { top: WHITE, band: RED }
};
export const BALL_TYPES = Object.freeze(Object.keys(BALLS));

/* Traced from the Team Rocket R reference (object_references/despacho_giovanni), 500x500 box. */
const ROCKET_R_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">`
  + `<path fill-rule="evenodd" fill="${ROCKET_RED}" d="M24 35 H345 C425 35 472 95 472 180 C472 250 445 295 402 322 L476 466 H330 L265 345 H158 V466 H24 Z`
  + ` M158 152 H290 C312 152 326 166 326 186 C326 206 312 220 290 220 H158 Z"/></svg>`;

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
  return ALL_EFFECTS.includes(value) ? value : null;
}

export function pickBallType(random = Math.random) {
  return BALL_TYPES[Math.floor(random() * BALL_TYPES.length)];
}


export function registerSceneTransitionService() {
  if (registered) {return;}
  registered = true;

  game.settings.register(MODULE_ID, DEFAULT_SETTING, {
    name: "Poke5e - Transición al cambiar de escena",
    hint: "La transición que se ve al activar o ver una escena. Cada escena puede elegir la suya en su configuración. El tipo de ball sale al azar en cada cambio.",
    scope: "world",
    config: true,
    type: String,
    choices: { ...EFFECT_LABELS },
    default: "none"
  });

  game.settings.register(MODULE_ID, DURATION_SETTING, {
    name: "Poke5e - Duración de la transición de escena",
    hint: "Milisegundos que tarda la transición en cerrarse, y otros tantos en abrirse.",
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
      pending.set(payload.sceneId, { effect: payload.effect, ball: payload.ball, at: Date.now() });
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


/* The GM picks the effect and ball once and tells everyone, so random choices look the same on every screen. */
function announceActivation(scene, changed) {
  if (changed.active !== true || !game.user.isGM) {return;}
  const chosen = apiOverride?.sceneId === scene.id
    ? resolveSceneTransitionEffect(apiOverride.effect, "none")
    : sceneEffect(scene);
  const entry = { effect: chosen ?? "none", ball: pickBallType() };
  pending.set(scene.id, { ...entry, at: Date.now() });
  game.socket.emit(SOCKET_CHANNEL, { type: SOCKET_MESSAGE_TYPE, sceneId: scene.id, ...entry });
}

function takePending(scene) {
  const entry = pending.get(scene.id);
  pending.delete(scene.id);
  if (!entry || Date.now() - entry.at > PENDING_TTL) {return undefined;}
  return { effect: entry.effect === "none" ? null : entry.effect, ball: BALLS[entry.ball] ? entry.ball : pickBallType() };
}


/* Activation, "View Scene" and "Pull players" all end in Scene#view, so one wrapper covers them. */
function wrapSceneView() {
  const proto = CONFIG.Scene.documentClass.prototype;
  const original = proto.view;
  proto.view = async function viewWithTransition(...args) {
    const changing = canvas.initialized && !canvas.loading && canvas.scene?.id !== this.id
      && !game.settings.get("core", "noCanvas");
    if (!changing) {return original.apply(this, args);}

    const { effect, ball } = takePending(this) ?? { effect: sceneEffect(this), ball: pickBallType() };
    if (!effect) {return original.apply(this, args);}

    await cover(effect, ball, this.id);
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
    <label>Transición de escena</label>
    <div class="form-fields"><select name="flags.${MODULE_ID}.${FLAG_KEY}">${options}</select></div>
    <p class="hint">Se ve al activar o ver esta escena. El tipo de ball sale al azar.</p>`;
  tab.append(group);
}


/* ============================================================
 * OVERLAY
 * ============================================================ */

function cover(effect, ball, sceneId) {
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
    fx: build(root, width, window.innerHeight, BALLS[ball] ?? BALLS.poke),
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

function halfMarkup(top, ball) {
  const sweep = top ? 1 : 0;
  const band = ball.band ?? BLACK;
  return `<path d="M-96 0 A96 96 0 0 ${sweep} 96 0 Z" fill="${top ? ball.top : WHITE}" stroke="${BLACK}" stroke-width="6"/>`
    + (top ? ball.deco ?? "" : "")
    + `<rect x="-96" y="${top ? -8 : 0}" width="192" height="8" fill="${band}"/>`
    + `<path d="M-30 0 A30 30 0 0 ${sweep} 30 0 Z" fill="${band}"/>`
    + `<path d="M-19 0 A19 19 0 0 ${sweep} 19 0 Z" fill="${WHITE}"/>`;
}

function halfSvg(top, ball) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 ${top ? -100 : 0} 200 100" width="100%" height="100%">${halfMarkup(top, ball)}</svg>`;
}

const ballImages = new Map();
function ballImage(ball) {
  if (!ballImages.has(ball)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200">${halfMarkup(true, ball)}${halfMarkup(false, ball)}</svg>`;
    ballImages.set(ball, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  }
  return ballImages.get(ball);
}

/* The GBA effects end with the ball spinning in the middle of the closed screen. */
function centerBall(root, w, h, ball) {
  const size = Math.min(w, h) * 0.28;
  const node = el(root, {
    left: `${(w - size) / 2}px`, top: `${(h - size) / 2}px`, width: `${size}px`, height: `${size}px`,
    backgroundImage: ballImage(ball), backgroundSize: "100% 100%", transform: "scale(0)"
  });
  return {
    show: () => run(node, [{ transform: "scale(0) rotate(-540deg)" }, { transform: "scale(1) rotate(0deg)" }], { duration: 550, easing: EASE_BACK }),
    hide: () => run(node, [{ transform: "scale(1) rotate(0deg)" }, { transform: "scale(0) rotate(360deg)" }], { duration: 300, easing: EASE_IN })
  };
}

function withCenterBall(fx, root, w, h, ball) {
  const center = centerBall(root, w, h, ball);
  return {
    cover: async duration => {
      await fx.cover(duration);
      await center.show();
    },
    reveal: async duration => {
      await center.hide();
      await fx.reveal(duration);
    }
  };
}

const EFFECTS = {
  grow(root, w, h, ball) {
    const size = Math.hypot(w, h) + 80;
    const wrapper = el(root, { left: `${(w - size) / 2}px`, top: `${(h - size) / 2}px`, width: `${size}px`, height: `${size}px`, willChange: "transform" });
    const top = el(wrapper, { left: 0, top: 0, width: "100%", height: "50%" });
    const bottom = el(wrapper, { left: 0, top: "50%", width: "100%", height: "50%" });
    top.innerHTML = halfSvg(true, ball);
    bottom.innerHTML = halfSvg(false, ball);
    return {
      cover: duration => run(wrapper, [{ transform: "scale(0) rotate(0deg)" }, { transform: "scale(1) rotate(720deg)" }], { duration, easing: EASE_IN }),
      reveal: duration => Promise.all([
        run(top, [{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }], { duration, easing: EASE_IN }),
        run(bottom, [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], { duration, easing: EASE_IN })
      ])
    };
  },

  rain(root, w, h, ball) {
    const cell = 64;
    const radius = 46;
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    const image = ballImage(ball);
    const balls = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const node = el(root, {
          left: `${c * cell - radius}px`, top: `${r * cell - radius}px`,
          width: `${radius * 2}px`, height: `${radius * 2}px`,
          backgroundImage: image, backgroundSize: "100% 100%", transform: "scale(0)"
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

  close(root, w, h, ball) {
    const band = Math.max(10, h * 0.03);
    const button = Math.min(w, h) * 0.12;
    const bandColor = ball.band ?? BLACK;
    const panel = (isTop) => {
      const node = el(root, { left: 0, width: "100%", height: "50%", [isTop ? "top" : "bottom"]: 0, background: isTop ? ball.top : WHITE, overflow: "hidden" });
      if (isTop && ball.deco) {
        // The ball's own decoration, stretched across the top panel.
        node.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-96 -96 192 96" preserveAspectRatio="none" width="100%" height="100%">${ball.deco}</svg>`;
      }
      const edge = isTop ? "bottom" : "top";
      el(node, { left: 0, width: "100%", height: `${band}px`, [edge]: 0, background: bandColor });
      const round = isTop ? `${button}px ${button}px 0 0` : `0 0 ${button}px ${button}px`;
      const inner = button * 0.64;
      el(node, { left: `calc(50% - ${button}px)`, [edge]: 0, width: `${button * 2}px`, height: `${button}px`, borderRadius: round, background: bandColor });
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

  stripes(root, w, h, ball) {
    const count = 15;
    const height = Math.ceil(h / count);
    const stripes = Array.from({ length: count }, (_, i) => ({
      node: el(root, { left: 0, top: `${i * height}px`, width: "100%", height: `${height + 1}px`, background: BLACK }),
      side: i % 2 ? 1 : -1
    }));
    // Each stripe enters from its side and keeps going out the other one.
    const fx = {
      cover: duration => Promise.all(stripes.map(({ node, side }) =>
        run(node, [{ transform: `translateX(${side * 100}%)` }, { transform: "translateX(0)" }], { duration, easing: EASE_OUT }))),
      reveal: duration => Promise.all(stripes.map(({ node, side }) =>
        run(node, [{ transform: "translateX(0)" }, { transform: `translateX(${-side * 100}%)` }], { duration, easing: EASE_IN })))
    };
    return withCenterBall(fx, root, w, h, ball);
  },

  spiral(root, w, h, ball) {
    const rings = 10;
    const band = Math.hypot(w, h) / 2 / rings;
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.style.position = "absolute";
    root.append(svg);
    const circles = Array.from({ length: rings }, (_, ring) => {
      const circle = document.createElementNS(svgNs, "circle");
      circle.setAttribute("cx", w / 2);
      circle.setAttribute("cy", h / 2);
      circle.setAttribute("r", (ring + 0.5) * band);
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", BLACK);
      circle.setAttribute("stroke-width", band + 2);
      circle.setAttribute("pathLength", "1");
      circle.setAttribute("stroke-dasharray", "1 1");
      circle.setAttribute("stroke-dashoffset", "1");
      circle.setAttribute("transform", `rotate(${-90 + (rings - ring) * 28} ${w / 2} ${h / 2})`);
      svg.append(circle);
      return circle;
    });
    // Outer rings start first when closing, inner rings first when opening.
    const play = (duration, keyframes, order) => Promise.all(circles.map((circle, ring) =>
      run(circle, keyframes, { duration: duration * 0.55, delay: duration * 0.45 * (order(ring) / (rings - 1)), easing: "ease-in-out" })));
    const fx = {
      cover: duration => play(duration, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], ring => rings - 1 - ring),
      reveal: duration => play(duration, [{ strokeDashoffset: 0 }, { strokeDashoffset: -1 }], ring => ring)
    };
    return withCenterBall(fx, root, w, h, ball);
  },

  mosaic(root, w, h, ball) {
    const cell = 64;
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    const tiles = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const node = el(root, { left: `${c * cell}px`, top: `${r * cell}px`, width: `${cell + 1}px`, height: `${cell + 1}px`, background: BLACK, transform: "scale(0)" });
        tiles.push({ node, order: Math.random() });
      }
    }
    const play = (duration, keyframes) => Promise.all(tiles.map(({ node, order }) =>
      run(node, keyframes, { duration: duration * 0.4, delay: duration * 0.6 * order, easing: "ease-out" })));
    const fx = {
      cover: duration => play(duration, [{ transform: "scale(0)" }, { transform: "scale(1)" }]),
      reveal: duration => play(duration, [{ transform: "scale(1)" }, { transform: "scale(0)" }])
    };
    return withCenterBall(fx, root, w, h, ball);
  },

  rocket(root, w, h) {
    const veil = el(root, { inset: 0, background: "#141414", opacity: 0 });
    const size = h * 0.6;
    const logo = el(root, { left: `${(w - size) / 2}px`, top: `${(h - size) / 2}px`, width: `${size}px`, height: `${size}px`, transform: "scale(0)" });
    logo.innerHTML = ROCKET_R_SVG;
    return {
      cover: duration => Promise.all([
        run(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: duration * 0.6 }),
        run(logo, [{ transform: "scale(0) rotateY(0deg)" }, { transform: "scale(1) rotateY(720deg)" }], { duration, delay: duration * 0.15, easing: EASE_BACK })
      ]),
      reveal: duration => Promise.all([
        run(logo, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(7)", opacity: 0 }], { duration: duration * 0.7, easing: EASE_IN }),
        run(veil, [{ opacity: 1 }, { opacity: 0 }], { duration, easing: EASE_OUT })
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
