const DEFAULT_SHINY_RULE_ID =
  "1-in-100";


const SHINY_RULES =
  Object.freeze({
    "1-in-20":
      Object.freeze({
        id:
          "1-in-20",

        label:
          "5% — 1 en 20",

        formula:
          "1d20",

        successTotal:
          20
      }),
    "1-in-100":
      Object.freeze({
        id:
          "1-in-100",

        label:
          "1 en 100",

        formula:
          "1d100",

        successTotal:
          100
      }),

    "1-in-1000":
      Object.freeze({
        id:
          "1-in-1000",

        label:
          "1 en 1000",

        formula:
          "3d10",

        successTotal:
          30
      }),

    "1-in-4096":
      Object.freeze({
        id:
          "1-in-4096",

        label:
          "1 en 4096",

        formula:
          "4d8",

        successTotal:
          32
      })
  });


function normalizeRuleId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}


export function getDefaultShinyRuleId() {

  return DEFAULT_SHINY_RULE_ID;
}


export function getShinyRule(
  value
) {

  const id =
    normalizeRuleId(
      value
    );


  return (
    SHINY_RULES[
      id
    ] ??
    null
  );
}


export function listShinyRules() {

  return Object.values(
    SHINY_RULES
  );
}


export function isShinyRollSuccess(
  rule,
  total
) {

  if (!rule) {

    return false;
  }


  return (
    Number(
      total
    ) ===
      Number(
        rule.successTotal
      )
  );
}