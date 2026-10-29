import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultEncounterItemPolicy } from "../scripts/encounter-item-policy.mjs";
import { listTrainerArchetypeGroups, getTrainerArchetype } from "../scripts/encounter-trainer-archetypes.mjs";
import { calculateEncounterTotals, getDefaultMixedTrainerArchetypeIds } from "../scripts/encounter-planner-data.mjs";
import { plannerBoosts } from "../scripts/encounter-planner-generation.mjs";
import { renderPlannerContent } from "../scripts/encounter-planner-markup.mjs";

globalThis.game = { settings: { get: () => "es" }, user: { isGM: true } };

function freshState(type) {
  return {
    activeTab: "composition", compositionView: "compact", collapsedTrainerIds: new Set(), type,
    location: "Ruta 1", name: "Hierba alta", encounterKey: null, selectedEncounterKey: "", selectedEncounterLocation: "",
    search: "", rows: [], trainers: [], selectedTrainerId: "", randomRegion: "", randomBiome: "",
    randomMinLevel: 1, randomMaxLevel: 5, randomSize: "normal", randomMinSr: "", randomMaxSr: "",
    trainerRandomRegion: "", trainerRandomCount: "auto", trainerRandomOnField: "auto", trainerRandomPokemonCount: "auto",
    trainerRandomRank: "route", trainerRandomArchetype: "generic", trainerRandomMixedArchetypes: getDefaultMixedTrainerArchetypeIds(),
    rerollMoves: false, rerollAbilities: false, rerollItems: false,
    itemPolicies: { wild: getDefaultEncounterItemPolicy("wild"), trainer: getDefaultEncounterItemPolicy("trainer") },
    allowHiddenAbilities: true, hiddenAbilityChancePercent: 5, busy: false
  };
}

function emptyContext(state) {
  return {
    language: "es", existingEncounters: [], savedEncounterLocations: [], savedEncountersForLocation: [], searchResults: [],
    rows: [], totals: calculateEncounterTotals([], state.type), randomRegions: [], wildRandomRegions: [], randomBiomes: [],
    randomSrValues: [], randomCandidateCount: 0, randomLockedCount: 0, trainerRandomCandidateCount: 0,
    trainerArchetypeGroups: listTrainerArchetypeGroups(), selectedTrainerArchetype: getTrainerArchetype("generic"),
    trainerRandomMixedArchetypes: [...state.trainerRandomMixedArchetypes]
  };
}

for (const type of ["wild", "trainer"]) {
  test(`the planner body renders an empty ${type} encounter`, () => {
    const state = freshState(type);
    const html = renderPlannerContent(state, emptyContext(state), {
      itemPolicy: state.itemPolicies[type],
      party: { size: 4, level: 5, team: 4, pokemon: [], strongest: null, participants: 4 },
      boosts: plannerBoosts(state),
      routeSummary: "<p data-test=\"route\"></p>",
      stepPanel: type === "trainer" ? "<p data-test=\"steps\"></p>" : "",
      difficulty: { tier: "easy", title: "t", label: "Fácil" },
      progress: { title: "p", label: "Nivel 5" }
    });
    assert.match(html, new RegExp(`data-encounter-type="${type}"`));
    assert.match(html, /data-test="route"/);
    assert.equal(/data-test="steps"/.test(html), type === "trainer");
    assert.match(html, /data-tier="easy"/);
    assert.match(html, /Hierba alta/);
    assert.doesNotMatch(html, /undefined|\[object Object\]/);
  });
}
