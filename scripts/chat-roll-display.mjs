const MODULE_ID = "poke5e-local";
let sequence = 0;

function resultIsVisible(html) {
  const result = html?.querySelector?.(".dice-total") ?? html;
  if (html?.isConnected === false || result?.closest?.(".dsn-hide, [hidden]")) {
    return false;
  }
  if (typeof result?.checkVisibility === "function") {
    return result.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true });
  }
  return true;
}

export function waitForVisibleResult(record) {
  if (resultIsVisible(record.html)) {return Promise.resolve(true);}
  if (record.html?.isConnected === false) {return Promise.resolve(false);}
  return new Promise(resolve => {
    const observer = new MutationObserver(() => check());
    function check() {
      if (!resultIsVisible(record.html)) {return;}
      observer.disconnect();
      delete record.refresh;
      resolve(true);
    }
    record.refresh = () => {
      observer.disconnect();
      observer.observe(record.html, { attributes: true, childList: true, subtree: true });
      for (let parent = record.html.parentElement; parent; parent = parent.parentElement) {
        observer.observe(parent, { attributes: true });
      }
      check();
    };
    record.refresh();
  });
}

export function afterPaint() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// Subscribe before creating the message: Foundry may render it during toMessage.
// Only the caller continues with damage; rerendering never reapplies it.
export async function publishRollBeforeDamage(roll, data) {
  const key = `${game.user.id}:${Date.now()}:${++sequence}`;
  const record = {};
  let rendered;
  const firstRender = new Promise(resolve => { rendered = resolve; });
  const listener = globalThis.Hooks?.on("dnd5e.renderChatMessage", (message, html) => {
    if (message.getFlag(MODULE_ID, "rollDisplayKey") !== key) {return;}
    record.html = html;
    rendered();
    void afterPaint().then(() => record.refresh?.());
  });
  try {
    const message = await roll.toMessage({ ...data, flags: { ...data.flags,
      [MODULE_ID]: { ...data.flags?.[MODULE_ID], rollDisplayKey: key } } });
    if (!message?.id) {
      throw new Error("No se pudo publicar la tirada; no se aplicó el daño automático.");
    }
    await firstRender;
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message.id);
    await afterPaint();
    if (!await waitForVisibleResult(record)) {
      throw new Error("No se pudo mostrar la tirada en el chat; no se aplicó el daño automático.");
    }
    await afterPaint();
    return message;
  } finally {
    globalThis.Hooks?.off?.("dnd5e.renderChatMessage", listener);
  }
}
