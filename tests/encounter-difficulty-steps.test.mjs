import assert from "node:assert/strict";
import test from "node:test";

const { TRAINER_STEPS, climbToNextTier, nextStep, previewSteps } = await import("../scripts/encounter-difficulty-steps.mjs");

const base = () => ({
  trainers: [{ id: "t1", archetypeId: "bug-catcher", onField: 1 }],
  rows: [{ id: "r1", trainerId: "t1", level: 5 }, { id: "r2", trainerId: "t1", level: 6 }],
  boosts: { statBonus: 0, coverage: false, items: false }
});
const tools = {
  maxAceLevel: 9,
  maxLevel: 8,
  addPokemon: trainer => ({ id: "new", trainerId: trainer.id, level: 5 }),
  addTrainer: () => ({ trainer: { id: "t2", onField: 1 }, rows: [{ id: "h1", trainerId: "t2", level: 4 }] })
};
// A stand-in strength: every Pokémon, out at once, extras and levels.
const measure = state => {
  const out = state.trainers.reduce((sum, t) => sum + Math.min(t.onField, state.rows.filter(r => r.trainerId === t.id).length), 0);
  const ratio = state.rows.reduce((sum, r) => sum + r.level, 0) / 10 * (1 + out) * (1 + 0.1 * state.boosts.statBonus)
    * (state.boosts.coverage ? 1.1 : 1) * (state.boosts.items ? 1.05 : 1);
  return { ratio, tier: { id: "x", label: String(ratio) } };
};

test("each step changes a copy: on the field, extras, team, helper, ace, levels", () => {
  const state = base();
  const steps = Object.fromEntries(TRAINER_STEPS.map(step => [step.id, step.apply(structuredClone(state), tools)]));
  assert.equal(steps["on-field"].trainers[0].onField, 2);
  assert.equal(steps["stats-1"].boosts.statBonus, 1);
  assert.equal(steps.coverage.boosts.coverage, true);
  assert.equal(steps.team.rows.length, 3);
  assert.equal(steps.helper.trainers.length, 2);
  assert.equal(steps.ace.rows.find(r => r.id === "r2").level, 7, "the strongest goes up");
  assert.deepEqual(steps.levels.rows.map(r => r.level), [6, 7]);
  assert.deepEqual(state, base(), "the encounter itself is untouched");
});

test("steps that can't apply: all out already, a full team, levels at the cap", () => {
  const state = base();
  state.trainers[0].onField = 2;
  state.rows.forEach(r => { r.level = 8; });
  const apply = id => TRAINER_STEPS.find(step => step.id === id).apply(structuredClone(state), tools);
  assert.equal(apply("on-field"), null);
  assert.equal(apply("levels"), null);
  state.rows = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, trainerId: "t1", level: 5 }));
  assert.equal(apply("team"), null);
});

test("climbing: the gentlest step each time, levels only when nothing else is left", () => {
  let state = base();
  const taken = [];
  for (let i = 0; i < 80; i += 1) {
    const step = nextStep(previewSteps(state, tools, measure), measure(state).ratio);
    if (!step) {break;}
    taken.push(step.step.id);
    state = step.state;
  }
  assert.ok(taken.indexOf("items") < taken.indexOf("on-field"), `an item is gentler than a Pokémon more out: ${taken}`);
  const firstLevel = taken.findIndex(id => id === "ace" || id === "levels");
  assert.ok(firstLevel > 0, taken.join(", "));
  assert.ok(taken.slice(firstLevel).every(id => id === "levels" || id === "ace"), `levels last: ${taken}`);
});

test("climbing to the next tier: several gentle steps at once, up to where the tier changes", () => {
  const tiered = state => {
    const { ratio } = measure(state);
    return { ratio, tier: { id: ratio >= 4 ? "medium" : "easy" } };
  };
  const climb = climbToNextTier(base(), tools, tiered);
  assert.equal(climb.tier.id, "medium");
  assert.ok(climb.steps.length > 1, climb.steps.map(step => step.id).join(", "));
  assert.ok(tiered(climb.state).ratio >= 4);
});

test("+1 to the team goes to the shortest team, so repeated it spreads among the trainers", () => {
  const state = base();
  state.trainers.push({ id: "t2", onField: 1 });
  state.rows.push({ id: "h1", trainerId: "t2", level: 4 });
  const team = TRAINER_STEPS.find(step => step.id === "team");
  const once = team.apply(structuredClone(state), tools);
  assert.equal(once.rows.at(-1).trainerId, "t2", "the helper has 1, the leader 2");
  const twice = team.apply(once, tools);
  assert.equal(twice.rows.at(-1).trainerId, "t1", "tied at 2: the leader first");
});

test("the ace +1 goes to the trainer with the lowest ace, so repeated it rotates", () => {
  const state = base();
  state.trainers.push({ id: "t2", onField: 1 });
  state.rows.push({ id: "h1", trainerId: "t2", level: 4 });
  const ace = TRAINER_STEPS.find(step => step.id === "ace");
  const once = ace.apply(structuredClone(state), tools);
  assert.equal(once.rows.find(r => r.id === "h1").level, 5, "the helper's ace (4) before the leader's (6)");
  assert.equal(once.rows.find(r => r.id === "r2").level, 6);
});
