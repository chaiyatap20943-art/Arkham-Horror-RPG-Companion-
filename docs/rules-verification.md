# Corebook verification register

Reviewed on 2026-10-07 against the user-supplied **Arkham Horror — The
Roleplaying Game Core Rulebook**, credited © 2024 Edge Studio. These notes
verify reference facts; **verified does not mean every effect is automated**.
Following the user's request to expand beyond the foundation, a canonical
player-safe catalog is delivered in `src/server/catalog.js`. Application
handlers implement their explicitly supported actions separately; reference
verification alone does not establish those handlers' correctness or live
Google deployment readiness.

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
| `CATALOG_DELIVERED` | Verified structured reference data is present in the repository; automated behavior still depends on the corresponding handler and tests. |
| `MANUAL_GM_ADJUDICATION` | The app can retain the rule, affected state, and audited GM decision, but it must not claim to resolve the complete effect automatically. |

The compiled entities use `verificationStatus: "VERIFIED"` and
`statusSource: "VERIFIED"` to mean `VERIFIED_REFERENCE`. This does not assert
complete effect automation. Every entity includes stable ID, source version,
printed page, zero-based PDF index, and the source checksum. Game actions
need their own domain and acceptance tests. Live Google integration must be
validated independently of local catalog checks.

## Requirements candidates

| ID | Reference status | Verified finding | Printed / PDF pages |
| --- | --- | --- | --- |
| RC-01 | `VERIFIED_REFERENCE` | Background construction is narrative and supplies no direct mechanical bonus. Its story elements can later qualify an investigator for an Insight-limit increase; this is a separate advancement rule. | 42 / 43; 67 / 68 |
| RC-02 | `VERIFIED_REFERENCE` | All skills start at 6+. Choose three distinct skills to improve to 5+ and one additional skill to improve to 4+. These initial improvements cost no XP. | 66 / 67 |
| RC-03 | `VERIFIED_REFERENCE` | Start with one Tier 1 knack from the selected archetype, $50 for gear, and Insight limit 1. The free knack counts toward the Tier 1 maximum. Unspent gear funds remain cash. | 66 / 67 |
| RC-04 | `VERIFIED_REFERENCE` | Choose exactly one additional package: $100 for gear, 5 XP, or Insight limit 2. Unspent money and XP are retained. | 66 / 67 |
| RC-05 | `VERIFIED_REFERENCE` | Starting purchases of relics and tomes require specific GM approval. | 66 / 67 |
| RC-06 | `VERIFIED_REFERENCE` | An archetype provides advancement limits and knack availability by tier. It does not automatically improve skills. The initial archetype cannot be discarded and replaced; later multiclassing is separate. All eight individual archetype catalogs are now checked and compiled. | 49 / 50; 51–65 / 52–66; 67 / 68 |
| RC-07 | `VERIFIED_REFERENCE` | A natural 1 fails and a natural 6 succeeds regardless of modifiers. This applies to each die, not automatically to the entire action. | 17 / 18 |
| RC-08 | `VERIFIED_REFERENCE` | Skill costs, knack tier costs/counts/prerequisites, and general Insight-limit advancement conditions were verified. Knack names, tier availability, explicit prerequisites, and short effect summaries are now compiled; full effect automation remains handler-specific. | 66–79 / 67–80 |

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
one specified skill up to 2+ (printed 49 / PDF 50). The eight individual
archetypes' eligible skills are now verified and compiled.

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

## Delivered source data and remaining interaction work

| Topic | Reference status | Delivered evidence and remaining work |
| --- | --- | --- |
| Skills | `VERIFIED_REFERENCE`, `CATALOG_DELIVERED` | Ten canonical skills, short summaries, and an application Thai glossary. Printed 17–19 / PDF 18–20. Thai labels are app translations, not claims of an official Thai edition. |
| Individual archetypes | `VERIFIED_REFERENCE`, `CATALOG_DELIVERED` | Eight archetypes with every eligible skill limit and tier-specific knack ID. Printed 51, 53, 55, 57, 59, 61, 63, 65 / PDF 52, 54, 56, 58, 60, 62, 64, 66. |
| Individual personalities | `VERIFIED_REFERENCE`, `CATALOG_DELIVERED` | All eleven personalities with original short positive/negative summaries, Insight costs, timing, and durations. Printed 45–48 / PDF 46–49. Unspecified half-pool rounding remains GM adjudication rather than an invented rule. |
| Knacks | `VERIFIED_REFERENCE`, `CATALOG_DELIVERED` | 117 names, source-linked short effect summaries, archetype-specific tiers, keywords where checked, and explicit base-knack prerequisites. Printed 69–79 / PDF 70–80. Generic summaries are reference material; complete effect resolution is not implied. |
| Equipment | `VERIFIED_REFERENCE`, `CATALOG_DELIVERED` | 120 entries: 30 weapon profiles, 7 protective items, 62 useful items including reloads/replenishments, 13 relics, and 8 tomes with 31 short spell summaries. Weapon references printed 82–89, protection 89–90, useful profiles 90–94 plus weapon reload pages, relics 96–100, tomes 101–105. Each entry preserves its specific citation. |
| Injury/trauma tables | `VERIFIED_REFERENCE`, `CATALOG_DELIVERED` | All eleven injury results and six trauma ranges, including pool restrictions, penalties, recovery-success counts, personality triggers, and escalation metadata. Printed 32, 39 / PDF 33, 40. Complete ability interactions, optional death avoidance, and GM-specific outcomes require explicit handler support. |
| Baseline rules search | `VERIFIED_REFERENCE`, `CATALOG_DELIVERED` | Fourteen brief rule entries cover pools, actions, advantage, damage, horror, trauma, Insight, creation, and advancement. They are original summaries with citations rather than a full rulebook export. |
| Cross-ability interactions | `NEEDS_VERIFICATION` where not explicitly covered | Confirm precedence, targets, modifiers, consumed resources, and durations before adding automatic behavior. Otherwise retain the source-linked rule and require an audited GM decision. |
| House rules | `NEEDS_VERIFICATION` | Record only user/GM-authorized changes, label them as house rules, and version them separately from this source. |

Equipment `price` uses 1927 USD; `priceCents` preserves exact integer amounts
for budgeting. Unknown exact prices stay `null`, with official ranges stored
separately where present. An unpriced relic or tome is not a free purchase.
Relics and tomes retain explicit GM-approval flags; non-purchasable items are
marked as such. Split purchasable variants have distinct stable IDs. The
ordinary `gold-pocket-watch` and supernatural `the-gold-pocket-watch` are
separate entities.

`tests/catalog.test.cjs` checks source identity, page-index mapping, canonical
reference integrity, per-archetype tiers, creation/advancement constraints,
important personality exceptions, price precision, complete outcome ranges,
and immutable authoritative data. These checks validate catalog integrity;
they do not constitute live Google verification or exhaustive rules-engine
acceptance tests.

## Campaign-scoped source registration

`Arkham.seedCatalogForCampaign(state, campaign, at)` registers the compiled
reference facts inside the caller's campaign-creation or installation
transaction. The private source-book metadata uses stable ID
`<CampaignID>:corebook`. Each of the 297 player-safe catalog entities uses
`<CampaignID>:catalog:<CanonicalEntityID>`, retaining `canonicalCatalogId`
and `entityId` for lookup and duplicate suppression in rule search.

The book stores source title, edition, and checksum once, with Co-GM/GM
metadata visibility and no attached PDF or Drive file. Entity rows contain
the campaign ID, short English description, source page/index, verified
reference status, and structured canonical properties. Their visibility is
`CAMPAIGN_PLAYERS`; permissions still require active campaign membership.
Stored source references point to that campaign's source book rather than
duplicating full provenance metadata in every entity.

Registration is additive and idempotent: existing books, edited canonical
rows, custom entities, timestamps, and versions are retained. Calling it for
another campaign creates separate IDs and does not change the first
campaign. The corresponding catalog tests exercise these preservation and
isolation guarantees.

These persistent rows are reference/import records. They do not replace
the frozen `Arkham.catalog` used by rule calculations. Importing JSON,
editing a glossary, or marking an imported source as reviewed cannot grant
new authority to engine costs or rules. Complete effects still require
explicit implementation and validation.

## GM reference catalog — checked 2026-10-09

`src/server/gm-catalog.js` adds169 separately protected records:16 NPCs,
19 creatures,15 Ancient Ones and119 locations. Thirty-five profiles retain
the ten exact skill thresholds (a printed dash remains unavailable), with
dice-pool maxima checked visually against the PDF icons. Thirty-eight attack
profiles retain source-linked numeric facts and short original summaries.
Ancient Ones have reference information without invented combat statistics.

GM references use `CO_GM` visibility, frozen facts and the same source
checksum/page mapping. They are seeded idempotently under scoped
`<CampaignID>:catalog:gm:<EntityID>` IDs. Search/translation/AI resolve their
current permission from the frozen source even if a persisted row is edited;
players never receive the GM catalog in their bootstrap payload.
Abilities are `REFERENCE_ONLY` and require GM adjudication rather than
unverified automatic combat resolution. Dedicated source, immutability,
registration and library-permission tests cover these boundaries.
