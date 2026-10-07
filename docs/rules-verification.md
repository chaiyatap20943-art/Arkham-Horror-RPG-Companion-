# Corebook verification register

Reviewed on 2026-10-07 against the user-supplied **Arkham Horror — The
Roleplaying Game Core Rulebook**, credited © 2024 Edge Studio. These notes
verify reference facts; **verified does not mean implemented**. The first
milestone delivers application foundation and campaign management. It does
not implement character creation, advancement, a dice roller, or a rules
engine.

The supplied requirements document is a product brief. Its `RULE-CANDIDATE`
entries were checked against the PDF rather than accepted as evidence by
themselves. No full-book text, PDF, or artwork is included in this repository.

## Source identity and page mapping

- Source filename: `Arkham-Horror-RPG-Corebook.pdf`.
- SHA-256:
  `7901c7c8cf0657d6cc2f65104ad6c7b46077cc489f653c6310897d5f2cd86d7a`.
- Source: the user's private uploaded attachment; no public download is
  supplied or required.
- Citations below use **printed page / PDF page**, with PDF pages numbered
  from 1. In this file, the verified numbered pages have the mapping
  `PDF page = printed page + 1`. A zero-based PDF array index is therefore
  equal to the printed page number.
- Examples checked: printed 17 is PDF 18; printed 42 is PDF 43; printed 66
  is PDF 67; printed 67 is PDF 68. Recheck mapping if the source file changes.

## Status meanings

| Status | Meaning |
| --- | --- |
| `VERIFIED_REFERENCE` | The fact below was checked in this exact source; it is not a claim that related software exists or all interactions are covered. |
| `NEEDS_VERIFICATION` | Additional source review is required before this data or behavior can enter game logic. |
| `NOT_IMPLEMENTED` | No game behavior is delivered for this topic in the foundation milestone. |

All game topics in this register have implementation status
`NOT_IMPLEMENTED`. Source citations must accompany future canonical rule
data, and future game actions need their own domain and acceptance tests.

## Requirements candidates

| ID | Reference status | Verified finding | Printed / PDF pages |
| --- | --- | --- | --- |
| RC-01 | `VERIFIED_REFERENCE` | Background construction is narrative and supplies no direct mechanical bonus. Its story elements can later qualify an investigator for an Insight-limit increase; this is a separate advancement rule. | 42 / 43; 67 / 68 |
| RC-02 | `VERIFIED_REFERENCE` | All skills start at 6+. Choose three distinct skills to improve to 5+ and one additional skill to improve to 4+. These initial improvements cost no XP. | 66 / 67 |
| RC-03 | `VERIFIED_REFERENCE` | Start with one Tier 1 knack from the selected archetype, $50 for gear, and Insight limit 1. The free knack counts toward the Tier 1 maximum. Unspent gear funds remain cash. | 66 / 67 |
| RC-04 | `VERIFIED_REFERENCE` | Choose exactly one additional package: $100 for gear, 5 XP, or Insight limit 2. Unspent money and XP are retained. | 66 / 67 |
| RC-05 | `VERIFIED_REFERENCE` | Starting purchases of relics and tomes require specific GM approval. | 66 / 67 |
| RC-06 | `VERIFIED_REFERENCE` | An archetype provides advancement limits and knack availability by tier. It does not automatically improve skills. The initial archetype cannot be discarded and replaced; later multiclassing is separate. Individual archetype catalogs still need extraction and verification. | 49 / 50; 67 / 68 |
| RC-07 | `VERIFIED_REFERENCE` | A natural 1 fails and a natural 6 succeeds regardless of modifiers. This applies to each die, not automatically to the entire action. | 17 / 18 |
| RC-08 | `VERIFIED_REFERENCE` for the general tables below | Skill costs, knack tier costs/counts/prerequisites, and general Insight-limit advancement conditions were verified. Individual knack effects and archetype-specific catalogs remain unverified. | 66–67 / 67–68 |

No direct contradiction was found in RC-01 through RC-08. The qualifications
and exceptions below are necessary to avoid overgeneralizing their brief
wording.

## Verified advancement reference

### Skill improvements

| Improvement | XP cost | Limit |
| --- | --- | --- |
| 6+ → 5+ | 2 | No archetype restriction. |
| 5+ → 4+ | 4 | No archetype restriction. |
| 4+ → 3+ | 7 | The skill must be eligible under the investigator's archetype. |
| 3+ → 2+ | 12 | The skill must be eligible under the investigator's archetype. |

Source: Table 3–1, printed 67 / PDF 68. Each purchase advances one level.
The general archetype structure allows three specified skills up to 3+ and
one specified skill up to 2+; each actual archetype's eligible skills must be
verified separately before implementing its validator (printed 49 / PDF 50).

### Knack purchases

| Tier | XP cost | Maximum count before multiclassing |
| --- | --- | --- |
| 1 | 3 | 3, including the free starting knack. |
| 2 | 6 | 2. |
| 3 | 10 | 2. |
| 4 | 15 | 1. |

Source: Table 3–2 and accompanying restrictions, printed 67 / PDF 68.
The knack must be available to the chosen archetype. To purchase a knack at
a given tier, the investigator must already have at least one knack from
**each** preceding tier. A shared knack may occupy different tiers in
different archetypes, so its cost cannot be inferred from its name alone.

### Insight-limit increases

Printed 67 / PDF 68 permits spending 1 XP at the end of a qualifying session
to permanently increase Insight limit by 1. Only one increase is allowed
after a session, and the limit cannot exceed 10. Qualifying events are:

- Ending an encounter with all dice in the investigator's pool replaced by
  horror dice.
- Suffering an injury with severity 4 or greater.
- Facing a dark and terrible returning element from the investigator's past.
- Bringing an element of the investigator's background into play.
- A failure severe enough to place the investigator or their group at risk.

Do not expose this as an unrestricted XP purchase or infer qualification
solely from the browser's claims.

### High-level exception

Printed 67 / PDF 68 describes multiclassing after at least 125 XP has been
spent: a 20 XP purchase increases dice-pool maximum by 1 and grants the
specified additional archetype or same-archetype benefits. Six is therefore
the normal starting player maximum, not an immutable lifetime maximum.
Full multiclass validation is outside this verification scope.

## Verified baseline dice and live-state reference

| Topic | Verified baseline | Printed / PDF pages |
| --- | --- | --- |
| Skill catalog | Ten skills: Agility, Athletics, Wits, Presence, Intuition, Knowledge, Resolve, Melee Combat, Ranged Combat, and Lore. Thresholds are 6+, 5+, 4+, 3+, and 2+. | 17–19 / 18–20 |
| Pool fields | Maximum is the upper bound on pool limit; limit is the refill target; current is the number of available dice. A player normally starts with six dice. | 16 / 17 |
| Bonus dice | Explicitly added dice may make current exceed limit and even maximum without changing limit. A refill adds enough dice to reach limit; it does not reduce an already larger current pool. | 16 / 17 |
| Refill timing | Narrative scenes refill at scene start or when the investigator enters that scene. Structured scenes refill at the investigator side's turn start. | 16 / 17; 23 / 24; 25 / 26 |
| Simple actions | Normally cost one pool die in structured scenes. Narrative simple actions normally cost no die; Aid an Ally remains a paid exception. Free actions are a separate category under GM judgment. | 20 / 21; 23 / 24 |
| Complex actions | Spend at least one available pool die, up to the current available dice. Each result meeting the skill threshold is a success, subject to the natural-result rule and applicable effects. | 17 / 18; 21 / 22 |
| Task difficulty | Normal complex tasks require one success, difficult tasks two, and very difficult tasks three. | 21 / 22 |
| Advantage | Add one external die before rolling, then remove one lowest result. Disadvantage adds one external die and removes one highest result. With both, add two and remove a highest and a lowest result. | 34 / 35 |
| Damage | Each damage point reduces pool limit by one. Current dice are removed only if their count exceeds the new limit. Limit zero means wounded. | 31 / 32 |
| Healing damage | Increase pool limit by the amount healed, capped at maximum. Healing does not itself add current dice or refill the pool. | 33 / 34 |
| Horror gained | Increase horror-dice limit by the horror amount, capped at pool maximum. It does not immediately replace current normal dice. | 36 / 37 |
| Horror refill | Fill horror dice first up to the lesser of horror limit and pool limit, then normal dice up to pool limit. Forced discards remove normal dice before horror dice. Damage, healing, and straining do not change horror limit. | 36 / 37 |
| Horror 1 | A horror die showing 1 cannot be rerolled. One or more horror 1s during an action cause a trauma roll, with severity increased by their count. Applicable personality/knack effects must resolve in their documented order. | 37 / 38; 46 / 47 |
| Trauma severity | Roll d6, add one for each horror 1 from the triggering action, then apply relevant existing trauma modifiers. This is not an independent trauma roll for every horror die showing 1. | 37 / 38; 39 / 40 |
| Injury severity | Roll d6 and add one for each other existing injury, plus relevant rule effects. Duplicate injuries do not stack their mechanical effect, but each instance remains until healed. | 32–33 / 33–34 |
| Insight | Refill to limit at session start. Spend one after an already successful complex action to add a success, or before a complex action/reaction for advantage. Clues and narrative elements have GM-set costs. | 38 / 39 |
| Avoiding death | The book permits permanently decreasing Insight limit by two to survive otherwise fatal injury or a trauma that removes the investigator from play. This is distinct from spending current Insight. | 38 / 39 |

## Exceptions and limits on implementation

- **Do not universally clamp current to maximum or limit.** Bonus dice can
  legitimately exceed both. Keep normal/horror labels and their provenance.
- **Do not introduce an independent HP system.** Damage is represented by
  reductions in pool limit. Injuries such as Comatose and Dire also set or
  restrict pool limit (printed 32 / PDF 33), so `maximum - limit` is not
  universally a literal accumulated-damage ledger. Future state design must
  prevent contradictory independently editable values.
- **Persistent data does not mean permanent effects.** Injuries remain until
  healed, including after a short mechanical effect ends (printed 33 / PDF
  34). Traumas have effect durations and cease after those durations (printed
  38–39 / PDF 39–40). Preserve history while expiring effects correctly;
  do not reset injury data at session end or perpetuate every trauma forever.
- **A horror 1 does not prove the final trauma outcome by itself.** Analytical
  can spend Insight after the action to remove a horror 1 before trauma
  resolution, which can prevent or reduce trauma (printed 46 / PDF 47).
  Other personality and knack interactions must be reviewed separately.
- **The baseline is not a complete action resolver.** Post-roll discards,
  additional dice, modifiers, reactions, damage restrictions, and effect
  precedence require full source review of the applicable ability. This
  register does not settle every interaction or tie case.
- **Archetype and personality selections are not cosmetic.** They affect
  future legal purchases and trauma/Insight behavior. A complete investigator
  wizard cannot be declared rule-valid from this general summary alone.

## Remaining source work

| Topic | Reference status | Work needed before implementation |
| --- | --- | --- |
| Individual archetypes | `NEEDS_VERIFICATION` | Extract each eligible skill limit, knack tier, source page, and any exceptions; verify exact canonical IDs. |
| Individual personalities | `NEEDS_VERIFICATION` | Extract positive/negative effects, Insight costs, timing, and duration; integrate with trauma resolution. The Analytical example above is verified only as an exception. |
| Knack effects | `NEEDS_VERIFICATION` | Review costs beyond tier XP, targets, triggers, modifiers, ordering, and restrictions for every supported knack. |
| Equipment catalog | `NEEDS_VERIFICATION` | Verify prices, quantities, weapon/protective-item statistics, purchase restrictions, item effects, and source pages. |
| Full injury/trauma automation | `NEEDS_VERIFICATION` | Verify every table outcome, recovery condition, duration, death exception, and interaction. General table-roll formulas above do not constitute complete outcome data. |
| House rules | `NEEDS_VERIFICATION` | Record only user/GM-authorized changes, label them as house rules, and version them separately from this source. |

Future rule development should use small verified modules with server-side
validation and source-linked acceptance tests. Until those modules are
delivered, the campaign foundation must not advertise official automated
character calculations or a completed rules engine.
