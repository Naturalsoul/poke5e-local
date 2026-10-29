export function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

// Fraction of a damage or HP amount; rounds down unless mode is "ceil" or "round".
export function fractionalAmount(amount, fraction, mode) {
  const raw = Math.max(0, Number(amount)) * Math.max(0, Number(fraction));
  if (mode === "ceil") {
    return Math.ceil(raw);
  }
  if (mode === "round") {
    return Math.round(raw);
  }
  return Math.floor(raw);
}
