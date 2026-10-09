var Arkham = typeof Arkham === 'undefined' ? {} : Arkham;

// GM reference is deliberately separate from the player catalog. These are
// checked facts and short original summaries, not copied descriptions or art.
// Reference verification does not imply that creature abilities are automated.
Arkham.gmCatalog = (function () {
  'use strict';
  var checksum = '7901c7c8cf0657d6cc2f65104ad6c7b46077cc489f653c6310897d5f2cd86d7a';
  var sourceVersion = 'corebook-2024-7901c7c8cf06';
  var provenance = { bookId: 'arkham-rpg-corebook-2024', title: 'Arkham Horror — The Roleplaying Game Core Rulebook',
    filename: 'Arkham-Horror-RPG-Corebook.pdf', edition: '2024', sha256: checksum,
    reviewedAt: '2026-10-09', pdfIndexBase: 0, pdfPageOffset: 1, distribution: 'FACTS_AND_ORIGINAL_SUMMARIES' };
  var skills = ['agility', 'athletics', 'wits', 'presence', 'intuition', 'knowledge', 'resolve', 'melee-combat', 'ranged-combat', 'lore'];
  function entry(id, name, type, page, summary, facts) {
    return { id: id, name: name, type: type, summary: summary, description: summary,
      statFacts: facts || {}, visibility: 'CO_GM', status: 'VERIFIED', statusSource: 'VERIFIED', verificationStatus: 'VERIFIED',
      automation: 'REFERENCE_ONLY', printedPage: page, pdfPageIndex: page, sourceVersion: sourceVersion,
      source: { bookId: provenance.bookId, printedPage: page, pdfPageIndex: page, sha256: checksum } };
  }
  function profile(id, name, type, page, poolMaximum, thresholds, npcClass, kind, summary, tags) {
    var stats = {};
    skills.forEach(function (skill, index) { stats[skill] = thresholds[index]; });
    return entry(id, name, type, page, summary, { poolMaximum: poolMaximum, skills: stats,
      npcClass: npcClass, profileKind: kind, tags: tags || [], skillDashMeaning: 'UNAVAILABLE',
      poolVerification: 'PROFILE_DICE_ICONS_VISUALLY_CHECKED', abilityResolution: 'GM_ADJUDICATION' });
  }
  var npcs = [
    profile('arcane-initiate', 'Arcane Initiate', 'NPC', 188, 5, [5,5,5,6,5,4,4,6,6,4], 'MINOR', 'GENERIC', 'A novice practitioner whose spells can harm their caster. Lightning, counterspells, and a protective mantle support an occult encounter.', ['spellcasting', 'protection']),
    profile('cultist', 'Cultist', 'NPC', 189, 3, [5,5,5,6,5,6,4,4,5,5], 'MINOR', 'GENERIC', 'A secretive human follower of an Ancient One. Nearby fellow cultists strengthen their combat resolve; the profile begins with horror limit three.', ['cult', 'fanaticism']),
    profile('cult-leader', 'Cult Leader', 'NPC', 190, 6, [5,5,5,4,5,4,3,5,5,3], 'MAJOR', 'GENERIC', 'An influential occult priest who directs followers, redirects attacks onto an ally, and steals life through magic. Initial horror limit is three.', ['cult', 'spellcasting']),
    profile('drifter', 'Drifter', 'NPC', 191, 4, [5,5,4,4,4,6,5,5,6,6], 'MINOR', 'GENERIC', 'A self-sufficient traveler who notices events overlooked by settled citizens. Roadside stories and an evasive knack make this a useful witness or guide.', ['travel', 'witness']),
    profile('gangster', 'Gangster', 'NPC', 192, 3, [5,4,5,6,5,6,5,5,4,6], 'MINOR', 'GENERIC', 'A criminal enforcer suitable for bootlegging gangs and organized crime. Carries a revolver and concealed switchblade and punishes opponents who disengage.', ['crime', 'firearm']),
    profile('healer', 'Healer', 'NPC', 193, 3, [5,6,5,4,5,3,5,6,6,6], 'MINOR', 'GENERIC', 'A medical professional supporting recovery from physical harm and horror. A supply bag complements healing and counseling abilities.', ['medicine', 'counseling']),
    profile('law-enforcement', 'Law Enforcement', 'NPC', 194, 4, [5,5,5,5,4,6,6,4,4,6], 'MINOR', 'GENERIC', 'A police officer or government investigator working amid Prohibition crime and competing jurisdictions. Uses a police revolver and baton.', ['police', 'investigation']),
    profile('mafia-leader', 'Mafia Leader', 'NPC', 195, 6, [5,5,4,4,4,5,3,5,3,6], 'MAJOR', 'GENERIC', 'A wealthy crime boss with armed followers and influential connections. Leadership steadies allies while a pistol, automatic weapon, and protective vest support violence.', ['crime', 'leadership']),
    profile('professor', 'Professor', 'NPC', 196, 3, [6,6,5,5,5,3,4,6,6,4], 'MINOR', 'GENERIC', 'A scholarly contact specializing in research and explanation. Can assist another character with Knowledge or Lore; possession of a tome is a GM choice.', ['research', 'academic']),
    profile('reporter', 'Reporter', 'NPC', 197, 4, [5,6,5,5,4,5,5,6,6,5], 'MINOR', 'GENERIC', 'A journalist who gathers evidence through interviews and observation. Questioning expertise may help or complicate an investigation.', ['press', 'interview']),
    profile('townsperson', 'Townsperson', 'NPC', 198, 3, [6,5,5,5,5,5,5,6,6,6], 'MINOR', 'GENERIC', 'An ordinary resident adapted to a chosen profession. Professional actions gain a benefit; equipment should reflect the resident’s job.', ['civilian', 'profession']),
    profile('agatha-crane', 'Agatha Crane', 'NPC', 201, 6, [6,5,4,5,4,3,3,6,6,4], 'NAMED', 'NAMED_CHARACTER', 'A parapsychology scholar who investigates supernatural phenomena through controlled observation and scientific evidence.', ['parapsychology', 'miskatonic-university']),
    profile('carl-sanford', 'Carl Sanford', 'NPC', 202, 6, [5,5,3,4,3,3,4,4,5,3], 'NAMED', 'NAMED_CHARACTER', 'The polished leader of the Order of the Silver Twilight, concealing dangerous occult expertise behind public respectability.', ['silver-twilight', 'occult']),
    profile('doctor-henry-armitage', 'Doctor Henry Armitage', 'NPC', 203, 6, [5,6,4,4,5,3,4,6,5,3], 'NAMED', 'NAMED_CHARACTER', 'An experienced scholar of forbidden literature and supernatural threats who can advise investigators and coordinate academic help.', ['occult', 'mentor']),
    profile('calvin-wright', 'Calvin Wright', 'NPC', 204, 6, [5,4,3,6,4,6,3,4,5,6], 'NAMED', 'NAMED_CHARACTER', 'A determined protector carrying an otherworldly presence within himself. His profile emphasizes enduring danger and defending nearby allies.', ['protector', 'supernatural']),
    profile('father-mateo-castile', 'Father Mateo Castile', 'NPC', 205, 6, [5,6,4,3,4,4,3,6,6,3], 'NAMED', 'NAMED_CHARACTER', 'A priest whose investigation of missing people led him to supernatural evil. Faith-based abilities heal, oppose entities, and support companions.', ['faith', 'healing'])
  ];
  var creatures = [
    profile('vermin-swarm', 'Vermin Swarm', 'CREATURE', 199, 5, [3,5,null,null,5,null,6,4,null,null], 'MINOR', 'GENERIC_ANIMAL', 'A mass of biting or stinging vermin. Swarm defenses make ordinary attacks inefficient, and wounds can cause sickness.', ['swarm', 'poison']),
    profile('wild-or-guard-dog', 'Wild or Guard Dog', 'CREATURE', 200, 2, [5,4,5,6,5,null,4,4,null,null], 'MINOR', 'GENERIC_ANIMAL', 'A wild pack animal or trained guardian. Speed and pack tactics improve its ability to threaten a target; effective bites may knock a human-sized opponent down.', ['animal', 'pack']),
    profile('children-of-yig', 'Children of Yig', 'CREATURE', 206, 5, [3,5,5,6,5,4,4,3,5,3], 'MINOR', 'SUPERNATURAL', 'Serpent people serving Yig who can conceal themselves in human appearance. Venom and resilient skin support their attacks; extreme cold hinders them.', ['yig', 'venom', 'cold-weakness']),
    profile('comets', 'Comets', 'CREATURE', 207, 6, [4,3,5,6,6,5,5,5,5,4], 'MINOR', 'SUPERNATURAL', 'Duplicates created through Asterias’s amulets and saltwater. They preserve a victim’s memories while serving Asterias, but require saltwater and react badly to acidity.', ['asterias', 'duplicate', 'acid-weakness']),
    profile('deep-one', 'Deep One', 'CREATURE', 208, 3, [4,3,5,6,4,6,3,4,5,5], 'MINOR', 'SUPERNATURAL', 'An amphibious humanoid from the sea, sometimes created through a human transformation curse. Groups intimidate opponents, and the creature can operate underwater.', ['aquatic', 'hydra', 'dagon']),
    profile('formless-spawn', 'Formless Spawn', 'CREATURE', 209, 5, [5,5,6,6,6,6,6,5,6,4], 'MINOR', 'SUPERNATURAL', 'An amorphous creature associated with Tsathoggua that slips through confined spaces and resists harm. Magic and alkaline substances can exploit its defenses.', ['amorphous', 'tsathoggua', 'alkaline-weakness']),
    profile('ghoul', 'Ghoul', 'CREATURE', 210, 3, [4,4,6,6,6,6,5,4,6,6], 'MINOR', 'SUPERNATURAL', 'A flesh-eating humanoid dwelling near graves and underground passages. Corpses drive its frenzy and hunger; sunlight interferes with its actions.', ['ghoul', 'corpse', 'sunlight-weakness']),
    profile('ghoul-priest', 'Ghoul Priest', 'CREATURE', 211, 5, [5,5,5,4,5,4,4,4,6,4], 'MAJOR', 'SUPERNATURAL', 'A more intelligent ghoul who guides lesser ghouls and often serves Umôrdhoth. Its abilities manipulate hunger and support a ghoul pack.', ['umordhoth', 'ghoul', 'sunlight-weakness']),
    profile('hound-of-tindalos', 'Hound of Tindalos', 'CREATURE', 212, 4, [2,5,6,6,4,5,5,3,null,6], 'MAJOR', 'SUPERNATURAL', 'A persistent hunter that enters through angular intersections in space. Rounded barriers obstruct it; a vaporous entrance and evasive reactions help it pursue prey.', ['tindalos', 'angles', 'rounded-space-weakness']),
    profile('nightgaunt', 'Nightgaunt', 'CREATURE', 213, 4, [3,4,6,6,5,6,5,4,null,null], 'MINOR', 'SUPERNATURAL', 'A silent, faceless flyer from the Dreamlands. It grapples victims, attacks with a trident or barbed tail, and is disadvantaged in sunlight.', ['dreamlands', 'flying', 'sunlight-weakness']),
    profile('poltergeist', 'Poltergeist', 'CREATURE', 214, 3, [3,5,5,5,5,5,5,5,5,5], 'MINOR', 'SUPERNATURAL', 'A restless spirit tied to unresolved business. It passes through solid obstacles and manipulates objects; enchantments and spells can harm its ethereal form.', ['spirit', 'ethereal', 'unfinished-task']),
    profile('zombie', 'Zombie', 'CREATURE', 215, 2, [6,4,6,null,6,null,2,5,null,null], 'MINOR', 'SUPERNATURAL', 'A slow, mindless reanimated corpse. Its undead defense blocks ordinary harm unless an attack exploits the profile’s headshot weakness.', ['undead', 'headshot-weakness']),
    profile('byakhee', 'Byakhee', 'CREATURE', 217, 7, [3,3,5,5,4,5,4,2,6,5], 'MAJOR', 'ELDRITCH_MONSTROSITY', 'An intelligent winged predator that travels between worlds. It can carry riders and inspire terror; its summoned nature creates a magical vulnerability.', ['flying', 'summoned', 'interworld']),
    profile('elder-thing', 'Elder Thing', 'CREATURE', 218, 8, [4,2,3,6,5,2,2,2,6,3], 'MAJOR', 'ELDRITCH_MONSTROSITY', 'A highly intelligent ancient being with scientific abilities, flight, and formidable physical defenses. Its knowledge can alter biology, atmosphere, or supernatural effects.', ['ancient-science', 'flying', 'countermagic']),
    profile('hune-mist', 'Hune-Mist', 'CREATURE', 219, 7, [3,4,6,6,4,5,4,4,null,6], 'MINOR', 'ELDRITCH_MONSTROSITY', 'A winged servant of Silenus formed from cold mist and shadow. It passes through objects and drains nearby life; heat counters its icy nature.', ['silenus', 'flying', 'heat-weakness']),
    profile('hunting-deep-one', 'Hunting Deep One', 'CREATURE', 220, 8, [4,3,5,6,4,6,4,3,6,5], 'MAJOR', 'ELDRITCH_MONSTROSITY', 'A large elder Deep One leading lesser aquatic servants. It can spread the transformation curse and threaten vehicles as well as individual opponents.', ['aquatic', 'large', 'curse']),
    profile('shoggoth', 'Shoggoth', 'CREATURE', 221, 10, [5,2,5,6,5,5,4,3,6,4], 'MAJOR', 'ELDRITCH_MONSTROSITY', 'A huge shapeless organism that can create appendages and crush multiple victims. Its body resists damage; explosives and its hatred of Elder Things can be exploited.', ['amorphous', 'huge', 'explosive-weakness']),
    profile('star-spawn', 'Star Spawn', 'CREATURE', 222, 12, [4,2,3,5,4,3,3,3,5,2], 'MAJOR', 'ELDRITCH_MONSTROSITY', 'A titanic relative of Cthulhu that can seize, throw, or swallow a victim. Extreme terror and very thick hide make a direct confrontation exceptionally dangerous.', ['cthulhu', 'titanic', 'terror']),
    profile('trylogog-swarm', 'Trylogog Swarm', 'CREATURE', 223, 9, [3,3,null,null,6,null,4,4,null,null], 'MAJOR', 'ELDRITCH_MONSTROSITY', 'A titanic flying swarm associated with Ezel-zen-rezl that converts consumed organic matter into more insects. Loud sound disrupts its activity.', ['ezel-zen-rezl', 'swarm', 'titanic', 'sonic-weakness'])
  ];
  // Profile-specific equipment values can differ from purchasable player gear.
  // Each tuple is [name, skill, damage, injury rating, range, ammunition, summary].
  // A null injury rating is the source's dash; it must not become zero or four.
  var attackFacts = {
    'cultist': [['Ritual Knife','melee-combat',2,3,'ENGAGED',null,''], ['.32 ACP Pistol','ranged-combat',2,4,30,2,'']],
    'cult-leader': [['Enchanted Dagger','melee-combat',2,2,'ENGAGED',null,'']],
    'drifter': [['Pocketknife','melee-combat',1,4,'ENGAGED',null,'Very difficult to detect on the carrier.']],
    'gangster': [['Colt Police Revolver','ranged-combat',2,4,75,2,'A simple reload restores one ammunition circle.'], ['Pearl-Handled Switchblade','melee-combat',2,4,'ENGAGED',null,'Difficult to detect on the carrier.']],
    'law-enforcement': [['Colt Police Revolver','ranged-combat',2,4,75,2,'A simple reload restores one ammunition circle.'], ['Police Baton','melee-combat',2,4,'ENGAGED',null,'At least two successes also knock the target prone.']],
    'mafia-leader': [['Gold-Plated Colt 1911 Pistol','ranged-combat',2,3,75,2,''], ['Pearl-Handled Tommy Gun','ranged-combat',2,3,75,5,'Each generated success adds one damage.']],
    'townsperson': [['Unarmed','melee-combat',1,null,'ENGAGED',null,'']],
    'carl-sanford': [['Enchanted Dagger','melee-combat',2,2,'ENGAGED',null,'']],
    'calvin-wright': [['Colt 1911 Pistol','ranged-combat',2,3,75,2,''], ['Bowie Knife','melee-combat',2,3,'ENGAGED',null,'Add two to the injury roll when this attack inflicts an injury.']],
    'vermin-swarm': [['Bite/Sting','melee-combat',1,3,'ENGAGED',null,'Mundane protection cannot reduce this damage.']],
    'wild-or-guard-dog': [['Bite/Claw','melee-combat',2,3,'ENGAGED',null,'At least two successes knock a human-sized target prone.']],
    'children-of-yig': [['Fangs and Claws','melee-combat',2,3,'ENGAGED',null,''], ['Blowgun','ranged-combat',1,3,20,null,'Inflicted injuries are Sickened; the weapon is difficult to detect.']],
    'comets': [['Powerful Strike','athletics',3,4,'ENGAGED',null,'At least three successes throw the target five feet and knock it prone.']],
    'deep-one': [['Teeth and Claws','athletics',2,4,'ENGAGED',null,''], ['Harpoon','melee-combat',3,3,10,null,''], ['Harpoon (Thrown)','ranged-combat',3,3,30,'SINGLE_SHOT','']],
    'formless-spawn': [['Tendril Slam','melee-combat',3,3,10,null,'']],
    'ghoul': [['Teeth and Claws','melee-combat',2,3,'ENGAGED',null,'']],
    'ghoul-priest': [['Teeth and Claws','melee-combat',2,3,'ENGAGED',null,'']],
    'hound-of-tindalos': [['Teeth and Claws','melee-combat',3,3,'ENGAGED',null,'At least two successes also knock the target prone.'], ['Tongue Lash','melee-combat',1,2,10,null,'Requires a prone or incapacitated target; add three to an inflicted injury roll.']],
    'nightgaunt': [['Trident','melee-combat',3,3,'ENGAGED',null,'At least three successes force the target to drop one held weapon.'], ['Barbed Tail','melee-combat',1,4,10,null,'At least three successes also knock the target prone.']],
    'poltergeist': [['Thrown Items','ranged-combat',1,4,20,null,'']],
    'zombie': [['Rotting Teeth','melee-combat',2,null,'ENGAGED',null,'A damaged target must pass an Athletics action next turn to avoid Sickened.']],
    'byakhee': [['Rending Claws','melee-combat',4,4,'ENGAGED',null,'Add two to the injury roll when this attack inflicts an injury.']],
    'elder-thing': [['Tentacle Strike','melee-combat',2,3,10,null,'Extra successes add damage; at least three successes also throw and knock the target prone.']],
    'hune-mist': [['Ethereal Talons','melee-combat',2,3,'ENGAGED',null,'Nonmagical means cannot prevent or reduce its damage and injuries.']],
    'hunting-deep-one': [['Bite/Claw','melee-combat',3,4,5,null,'Maximum reach is ten feet.']],
    'shoggoth': [['Tendril Strike','melee-combat',4,3,20,null,'']],
    'star-spawn': [['Titanic Talons','melee-combat',6,3,10,null,'Three successes can also hit nearby characters other than the attacker for six damage.']],
    'trylogog-swarm': [['Many Chewing Mandibles','melee-combat',1,3,'ENGAGED',null,'Each success adds one damage; mundane protection cannot reduce it.']]
  };
  npcs.concat(creatures).forEach(function (record) {
    record.statFacts.attackProfiles = (attackFacts[record.id] || []).map(function (attack) {
      return { name: attack[0], skillId: attack[1], damage: attack[2], injuryRating: attack[3],
        rangeKind: attack[4] === 'ENGAGED' ? 'ENGAGED' : 'FEET', rangeFeet: attack[4] === 'ENGAGED' ? null : attack[4],
        ammunition: attack[5], summary: attack[6], automation: 'REFERENCE_ONLY' };
    });
  });
  var ancientOnes = [
    entry('cthulhu', 'Cthulhu', 'ANCIENT_ONE', 156, 'An ocean-bound cosmic entity whose dreams reach human minds while it lies dormant. Cults seek the celestial conditions that permit its return.', { aliases: ['Great Cthulhu'], themes: ['dreams', 'ocean', 'awakening'], sourcePages: [156,157,158], combatProfile: 'NOT_PROVIDED' }),
    entry('hastur', 'Hastur', 'ANCIENT_ONE', 159, 'An entity associated with Carcosa, the Yellow Sign, and a dangerous theatrical work. Its influence spreads through minds and art rather than a single fixed physical presence.', { aliases: ['King in Yellow', 'Man in the Pallid Mask', 'Stranger'], themes: ['carcosa', 'art', 'yellow-sign'], combatProfile: 'NOT_PROVIDED' }),
    entry('nyarlathotep', 'Nyarlathotep', 'ANCIENT_ONE', 160, 'A manipulative shapeshifter who approaches humanity in many guises and offers knowledge at a terrible price. The Bloodless Man is one appearance linked to New England society.', { aliases: ['Crawling Chaos', 'Bloodless Man'], themes: ['deception', 'avatars', 'bargains'], sourcePages: [160,161], combatProfile: 'NOT_PROVIDED' }),
    entry('yog-sothoth', 'Yog-Sothoth', 'ANCIENT_ONE', 163, 'A cosmic power existing across time and space whose reach into our reality is constrained. Its followers seek ways to open the barrier that excludes it.', { aliases: ['One-in-All', 'Key and the Gate'], themes: ['time', 'space', 'gates'], sourcePages: [163,164,165], combatProfile: 'NOT_PROVIDED' }),
    entry('asterias', 'Asterias', 'ANCIENT_ONE', 166, 'A vast starfish-like consumer that can regrow from surviving fragments. Amulets and duplicates allow its influence to persist despite an ancient defeat by the Deep Ones.', { aliases: ['Star of the Dark', 'Ravening Deep'], themes: ['regeneration', 'duplicates', 'consumption'], sourcePages: [166,167], combatProfile: 'NOT_PROVIDED' }),
    entry('crothoaka', 'Crothoaka', 'ANCIENT_ONE', 168, 'A being whose coiled body forms a mental and physical Labyrinth. It draws willing victims into contradictions and false enlightenment, seeking enough discord to rupture reality.', { themes: ['labyrinth', 'contradictions', 'false-revelation'], sourcePages: [168,169], combatProfile: 'NOT_PROVIDED' }),
    entry('ezel-zen-rezl', 'Ezel-zen-rezl', 'ANCIENT_ONE', 170, 'A distributed consciousness made of countless trylogogs. The swarm’s Reaping consumes a world’s life and transforms organic matter into new members of the hive.', { aliases: ['Lord of Swarms'], themes: ['swarm', 'reaping', 'assimilation'], sourcePages: [170,171], combatProfile: 'NOT_PROVIDED' }),
    entry('maghan-arkat', 'Magh’an Ark’at', 'ANCIENT_ONE', 172, 'A gigantic egg hidden in the forests near Montreal. Its heat and presence mutate nearby life while the Caretakers anticipate a hatching they believe will restore a primordial paradise.', { aliases: ['Ark’at', 'Child of Paradise'], themes: ['egg', 'mutation', 'primordial-jungle'], sourcePages: [172,173,174], combatProfile: 'NOT_PROVIDED' }),
    entry('mother-hydra', 'Mother Hydra', 'ANCIENT_ONE', 175, 'An immense aquatic progenitor worshipped alongside Father Dagon. Her high temple lies in the Deep One city below Devil Reef, and coastal cults serve her through dreams and rituals.', { aliases: ['Queen of the Deep'], themes: ['deep-ones', 'ocean', 'innsmouth'], pairedEntityId: 'father-dagon', combatProfile: 'NOT_PROVIDED' }),
    entry('father-dagon', 'Father Dagon', 'ANCIENT_ONE', 175, 'A colossal ocean entity associated with Mother Hydra and the Deep Ones. His lair lies beneath the Esoteric Order’s former Masonic Hall in Innsmouth.', { themes: ['deep-ones', 'ocean', 'innsmouth'], pairedEntityId: 'mother-hydra', combatProfile: 'NOT_PROVIDED' }),
    entry('silenus', 'Silenus', 'ANCIENT_ONE', 176, 'A formless cosmic presence that strips atmospheres and life from worlds. Its cold, stagnant domain and servants threaten to spread that lifeless condition into other universes.', { themes: ['cold', 'void', 'heat-death'], sourcePages: [176,177,178], combatProfile: 'NOT_PROVIDED' }),
    entry('syrx-crugoth', 'Syrx-Crugoth', 'ANCIENT_ONE', 179, 'A vindictive entity formed from reflective fragments and imprisoned beneath Arkham. It manipulates dreams and broadcasts, reanimates victims, and seeks release to spread destruction.', { aliases: ['Cruelest One'], themes: ['shards', 'revenge', 'reanimation'], sourcePages: [179,180], combatProfile: 'NOT_PROVIDED' }),
    entry('tsocathra', 'Tsocathra', 'ANCIENT_ONE', 180, 'A being of body and thought bound within the wording of an ancient incantation. Understanding and spreading that wording can reverse its confinement and unleash disease and suffering.', { aliases: ['Thousandfold Dream'], themes: ['incantation', 'disease', 'binding'], sourcePages: [180,181], combatProfile: 'NOT_PROVIDED' }),
    entry('umordhoth', 'Umôrdhoth', 'ANCIENT_ONE', 182, 'A consumer of the dead sustained by ghoul worship and offerings. If its hunger is not satisfied, it emerges from below to claim the living.', { aliases: ['Devourer Below'], themes: ['death', 'ghouls', 'hunger'], sourcePages: [182,183,184], combatProfile: 'NOT_PROVIDED' }),
    entry('yig', 'Yig', 'ANCIENT_ONE', 184, 'A serpent deity protective of its offspring, snakes, and faithful followers. Respect and placatory rites can matter as much as confrontation with its dangerous servants.', { aliases: ['Father of Serpents'], themes: ['serpents', 'protection', 'retribution'], sourcePages: [184,185], combatProfile: 'NOT_PROVIDED' })
  ];
  function location(id, name, page, region, summary, parentId) {
    return entry(id, name, 'LOCATION', page, summary, { region: region, parentLocationId: parentId || null, detailKind: 'SETTING_REFERENCE' });
  }
  var locations = [
    location('arkham', 'Arkham', 108, 'ARKHAM', 'A Massachusetts river city centered on Miskatonic University, occult societies, and Prohibition crime.'),
    location('downtown-arkham', 'Downtown Arkham', 109, 'ARKHAM', 'Arkham’s civic and commercial center mixes fashionable entertainment with old institutions.', 'arkham'),
    location('independence-square-and-city-hall', 'Independence Square and City Hall', 109, 'ARKHAM', 'A public commons and government complex used for leisure, performances, and political gatherings.', 'downtown-arkham'),
    location('arkham-sanatorium', 'Arkham Sanatorium', 109, 'ARKHAM', 'An overcrowded psychiatric institution with uneven treatment and many patients whose symptoms defy ordinary explanations.', 'downtown-arkham'),
    location('excelsior-hotel', 'Excelsior Hotel', 109, 'ARKHAM', 'An extravagant art deco hotel concealing the aftermath of a recent murder and a room kept vacant.', 'downtown-arkham'),
    location('la-bella-luna-and-the-clover-club', 'La Bella Luna and The Clover Club', 112, 'ARKHAM', 'An Italian restaurant stands above an O’Bannion-controlled speakeasy and gambling venue.', 'downtown-arkham'),
    location('easttown', 'Easttown', 112, 'ARKHAM', 'A disordered district of modest homes and failing businesses where Sheldon gang influence reaches into the countryside.', 'arkham'),
    location('arkham-police-station', 'Arkham Police Station', 112, 'ARKHAM', 'City police and the county sheriff share a redbrick station while disagreeing about responsibility and methods.', 'easttown'),
    location('velmas-diner', 'Velma’s Diner', 112, 'ARKHAM', 'A welcoming diner whose food, proprietor, and regular customers make it a dependable source of local gossip.', 'easttown'),
    location('hibbs-roadhouse', 'Hibb’s Roadhouse', 113, 'ARKHAM', 'A rough roadside tavern secretly selling Sheldon moonshine and connecting criminals, fences, and travelers.', 'arkham'),
    location('french-hill', 'French Hill', 113, 'ARKHAM', 'An old affluent neighborhood of colonial and Victorian houses, many showing declining fortunes.', 'arkham'),
    location('silver-twilight-lodge', 'Silver Twilight Lodge', 113, 'ARKHAM', 'A respectable social club’s manor conceals an inner circle devoted to dangerous occult secrets.', 'french-hill'),
    location('duterte-funeral-home', 'Duterte Funeral Home', 113, 'ARKHAM', 'Madeline Duterte conducts empathetic funeral services in a restored manor rumored to contain ghosts.', 'french-hill'),
    location('bayfriar-gardens', 'Bayfriar Gardens', 113, 'ARKHAM', 'A public park with church ruins and a hedge maze whose central statue unsettles visitors.', 'french-hill'),
    location('witch-house', 'The Witch House', 113, 'ARKHAM', 'The former Mason residence now houses poor students among disturbing angles, vermin, and unexplained disappearances.', 'french-hill'),
    location('merchant-district', 'Merchant District', 114, 'ARKHAM', 'Busy river docks and converted storefronts become furtive and dangerous after dark.', 'arkham'),
    location('tick-tock-club', 'The Tick-Tock Club', 114, 'ARKHAM', 'An independent jazz speakeasy hidden behind a clock entrance; its ownership and timepiece-filled interior invite questions.', 'merchant-district'),
    location('unnamable', 'The Unnamable', 114, 'ARKHAM', 'An abandoned mansion above the district has no reliable ownership record and a strangely intact cupola.', 'merchant-district'),
    location('unvisited-isle', 'The Unvisited Isle', 114, 'ARKHAM', 'A densely wooded river island where explorers lose their bearings and report stone rows and an altar.', 'merchant-district'),
    location('northside', 'Northside', 115, 'ARKHAM', 'Rail yards, industry, and cramped worker housing form a poor district with hazardous nighttime streets.', 'arkham'),
    location('arkham-advertiser', 'Arkham Advertiser', 115, 'ARKHAM', 'The city newspaper investigates local wrongdoing and purchases useful information when it comes with evidence.', 'northside'),
    location('curiositie-shoppe', 'Curiositie Shoppe', 115, 'ARKHAM', 'Oliver Thomas sells unusual antiques and occult knowledge, charging for both goods and information.', 'northside'),
    location('arkham-train-station', 'Train Station — Arkham', 115, 'ARKHAM', 'A rail hub linking Arkham’s industry and travelers with Boston, Providence, and Kingsport.', 'northside'),
    location('rivertown', 'Rivertown', 116, 'ARKHAM', 'A declining riverside district of aging warehouses, rotten docks, and industrial waste.', 'arkham'),
    location('arkham-graveyard', 'Graveyard — Christchurch Cemetery', 116, 'ARKHAM', 'Arkham’s oldest cemetery contains crypts, neglected family memorials, strange carvings, and disturbed graves.', 'rivertown'),
    location('black-cave', 'Black Cave', 116, 'ARKHAM', 'Dangerous riverbank tunnels shelter bootleggers and secretive groups; deep explorers often fail to return.', 'rivertown'),
    location('schoffners-general-store', 'The General Store — Schoffner’s', 116, 'ARKHAM', 'A persistent local store sells household goods, sporting supplies, and weapons, with room for bargaining.', 'rivertown'),
    location('southside-arkham', 'Southside — Arkham', 116, 'ARKHAM', 'An aging residential area where abandoned or converted houses sit beside immigrant and longtime families.', 'arkham'),
    location('arkham-historical-society', 'Arkham Historical Society', 116, 'ARKHAM', 'A museum and library of local history with overseas collections and rumors of concealed arcane volumes.', 'southside-arkham'),
    location('mas-boarding-house', 'Ma’s Boarding House', 117, 'ARKHAM', 'An affordable boarding house celebrated for its meals, colorful residents, and proprietor’s firm rules.', 'southside-arkham'),
    location('south-church', 'South Church', 117, 'ARKHAM', 'Arkham’s principal Catholic church is shaken by strange events and the desecration of stolen sacred vessels.', 'southside-arkham'),
    location('uptown', 'Uptown', 117, 'ARKHAM', 'A relatively new and fashionable district bordering Hangman’s Brook and Arkham Woods.', 'arkham'),
    location('nightingale-club', 'The Nightingale Club', 117, 'ARKHAM', 'A celebrated jazz venue supplied by Johnny Valone, placing it in the path of rival gangs and police.', 'uptown'),
    location('st-marys-hospital', 'St. Mary’s Hospital', 118, 'ARKHAM', 'Arkham’s modern hospital treats the wider valley and researches unusual injuries with Miskatonic University.', 'uptown'),
    location('ye-olde-magick-shoppe', 'Ye Olde Magick Shoppe', 118, 'ARKHAM', 'Miriam Beecher supplies divination tools, occult books, and components for customers interested in actual magic.', 'uptown'),
    location('arkham-woods', 'Arkham Woods', 118, 'ARKHAM', 'Forests around western and southern Arkham contain old stonework, dangerous wildlife, and Sheldon bootlegging operations.', 'arkham'),
    location('miskatonic-university', 'Miskatonic University', 119, 'ARKHAM', 'A coeducational research campus whose academic reputation is accompanied by persistent legends and mysteries.', 'arkham'),
    location('orne-library', 'Orne Library', 119, 'ARKHAM', 'A prominent campus library with a locked rare-book collection that includes a Latin Necronomicon.', 'miskatonic-university'),
    location('warren-observatory', 'Warren Observatory', 119, 'ARKHAM', 'A modern observatory on Crane Hill containing a large telescope and radio equipment.', 'miskatonic-university'),
    location('miskatonic-science-building', 'Science Building', 119, 'ARKHAM', 'The university’s science and medicine departments share teaching facilities and research laboratories.', 'miskatonic-university'),
    location('dunwich', 'Dunwich', 120, 'DUNWICH', 'A declining rural settlement still suffering the consequences of a destructive supernatural Horror.'),
    location('dunwich-village', 'Dunwich Village', 120, 'DUNWICH', 'The surviving village stands near the junction of Bishop’s Brook and the Miskatonic amid abandoned buildings.', 'dunwich'),
    location('dunwich-village-commons', 'Village Commons', 120, 'DUNWICH', 'A former civic green is now so overgrown that it resembles neglected woodland.', 'dunwich-village'),
    location('dunwich-congregational-church', 'Congregational Church — Dunwich', 120, 'DUNWICH', 'A seventeenth-century church lies abandoned after a minister’s disappearance and the congregation’s decline.', 'dunwich-village'),
    location('osborns-general-store', 'Osborn’s General Store', 121, 'DUNWICH', 'The village’s only operating shop also holds its working telephone and serves as a gossip gathering point.', 'dunwich-village'),
    location('dunwich-schoolhouse', 'Schoolhouse — Dunwich', 121, 'DUNWICH', 'A closed schoolhouse reflects the loss of families following the Horror; its former teacher has withdrawn.', 'dunwich-village'),
    location('dunwich-station-and-bishops-brook-bridge', 'Dunwich Train Station and Bishop’s Brook Bridge', 121, 'DUNWICH', 'A fragile bridge and dilapidated station still carry occasional trains despite alarming disrepair.', 'dunwich-village'),
    location('dunwich-backwoods-country', 'Backwoods Country', 121, 'DUNWICH', 'Forests, rough roads, isolated farms, and hidden communities surround the declining village.', 'dunwich'),
    location('cold-spring-glen', 'Cold Spring Glen', 121, 'DUNWICH', 'A scenic sequence of falls and old mill ruins also provides meeting places and hiding spots for bootleggers.', 'dunwich-backwoods-country'),
    location('whateley-farm-ruins', 'Whateley Farm Ruins', 121, 'DUNWICH', 'The destroyed farm associated with the Horror attracts only reckless investigators and seekers of rumored gold.', 'dunwich-backwoods-country'),
    location('ten-acre-meadow', 'Ten-Acre Meadow', 122, 'DUNWICH', 'Former Whateley land is now a dense, foggy tangle rumored to conceal bootlegging routes and cargo.', 'dunwich-backwoods-country'),
    location('blasted-heath', 'Blasted Heath', 122, 'DUNWICH', 'Former orchard country remains barren after an unnatural blight, despite a few families staying on their land.', 'dunwich-backwoods-country'),
    location('devils-hop-yard', 'Devil’s Hop Yard', 122, 'DUNWICH', 'A barren, unnaturally cold hillock repels animals and people but sometimes receives mutilated cattle remains.', 'blasted-heath'),
    location('gardners-place', 'Gardner’s Place', 122, 'DUNWICH', 'A ruined orchard property suffered catastrophe after a meteorite fell; occasional glows and sickness persist.', 'blasted-heath'),
    location('harney-jones-shack', 'Harney Jones’ Shack', 122, 'DUNWICH', 'A retired handyman offers conversation and stew at a home crowded with stray cats near the Blasted Heath.', 'blasted-heath'),
    location('sentinel-hill', 'Sentinel Hill', 123, 'DUNWICH', 'A difficult summit holds a ritual table rock and undeciphered standing stones linked to the Whateleys and the Horror.', 'dunwich-backwoods-country'),
    location('innsmouth', 'Innsmouth', 124, 'INNSMOUTH', 'An isolated, decaying coastal town at the Manuxet’s mouth whose inhabitants and remaining industry conceal profound strangeness.'),
    location('innsmouth-midtown', 'Midtown — Innsmouth', 125, 'INNSMOUTH', 'Quiet cobblestone streets contain the town’s sparse shops and public buildings amid abandoned structures.', 'innsmouth'),
    location('innsmouth-square', 'Innsmouth Square', 125, 'INNSMOUTH', 'A neglected cobblestone square connects dark streets, sparse businesses, and the twice-daily bus route.', 'innsmouth-midtown'),
    location('first-national-grocery', 'First National Grocery', 125, 'INNSMOUTH', 'A chain grocery managed by Brian Burnham offers supplies and a newcomer’s practical advice about the town.', 'innsmouth-midtown'),
    location('innsmouth-tribune', 'Innsmouth Tribune', 125, 'INNSMOUTH', 'A small newspaper and jobbing printer relies on old Arkham news and a press rumored to be dangerously bloodthirsty.', 'innsmouth-midtown'),
    location('little-bookshop', 'The Little Bookshop', 125, 'INNSMOUTH', 'Joyce Little maintains a warm, cluttered shop and can procure rare macabre volumes for local customers.', 'innsmouth-midtown'),
    location('new-church-green', 'The New Church Green', 125, 'INNSMOUTH', 'A deteriorating church site was rebuilt after the original building burned in 1846.', 'innsmouth-midtown'),
    location('esoteric-order-of-dagon', 'Esoteric Order of Dagon', 125, 'INNSMOUTH', 'A former Masonic Hall limits visitors to its entrance while guarded interior rooms contain marine relics and ritual spaces.', 'innsmouth-midtown'),
    location('innsmouth-jail', 'Innsmouth Jail', 126, 'INNSMOUTH', 'A heavily secured jail houses the town’s two constables and was repaired unusually well after a federal raid.', 'innsmouth'),
    location('sawbone-alley', 'Sawbone Alley', 126, 'INNSMOUTH', 'A wet, dangerous lane behind the jail hosts illicit goods, gambling, and violent recreation.', 'innsmouth'),
    location('innsmouth-factory-district', 'Factory District — Innsmouth', 126, 'INNSMOUTH', 'Most industrial buildings are abandoned; surviving factories use unsafe equipment and harsh working conditions.', 'innsmouth'),
    location('gilman-house-hotel', 'Gilman House Hotel', 126, 'INNSMOUTH', 'The town’s sole hotel offers insecure rooms and unsettling nighttime visitors under Othera Gilman’s management.', 'innsmouth'),
    location('innsmouth-harbor', 'Innsmouth Harbor', 126, 'INNSMOUTH', 'Silted and rotting wharves support only a few fishing boats; Zadok Allen may recount the town’s past here.', 'innsmouth'),
    location('marsh-refinery', 'Marsh Refinery', 126, 'INNSMOUTH', 'A guarded family refinery exports precious metals despite the town having no known local source.', 'innsmouth-factory-district'),
    location('innsmouth-shore', 'Innsmouth Shore', 127, 'INNSMOUTH', 'A sparsely inhabited coastline follows hazardous Cliff Road with Devil Reef visible offshore.', 'innsmouth'),
    location('devil-reef', 'Devil Reef', 127, 'INNSMOUTH', 'Black volcanic shoals attract local fishers and wreck unwary ships as tides expose and conceal them.', 'innsmouth-shore'),
    location('falcon-point-lighthouse', 'Falcon Point Lighthouse', 127, 'INNSMOUTH', 'The last functioning structure above a deserted fishing hamlet guides ships around the reef and is kept by Oceiros Marsh.', 'innsmouth-shore'),
    location('tidal-tunnels-bootleggers-hideaway', 'Tidal Tunnels/Bootlegger’s Hideaway', 127, 'INNSMOUTH', 'Interconnected coastal tunnels exposed at low tide conceal illicit cargo and may reach beneath Innsmouth.', 'innsmouth-shore'),
    location('kingsport', 'Kingsport', 128, 'KINGSPORT', 'A coastal town of steep streets and persistent mists where forgotten streets can seem to appear and disappear.'),
    location('kingsport-central-hill', 'Central Hill', 128, 'KINGSPORT', 'Kingsport’s largest neighborhood climbs toward the hospital on the site of its original church.', 'kingsport'),
    location('seventh-house-on-the-left', '7th House on the Left', 128, 'KINGSPORT', 'A seventeenth-century house on Green Lane holds Gladys Pickman’s historical curios and rare books.', 'kingsport-central-hill'),
    location('kingsport-congregational-hospital', 'Congregational Hospital', 129, 'KINGSPORT', 'A hilltop hospital with a surviving chapel and cemetery works to recover from a cadaver-theft scandal.', 'kingsport-central-hill'),
    location('st-erasmus-home-for-mariners', 'St. Erasmus’s Home for Mariners', 129, 'KINGSPORT', 'A former town hall now shelters elderly sailors whose storytelling can reveal disturbing maritime experiences.', 'kingsport-central-hill'),
    location('kingsport-harborside', 'Harborside', 129, 'KINGSPORT', 'An active shipping and fishing port supports shops, travelers, and the homes of maritime families.', 'kingsport'),
    location('north-point-lighthouse', 'North Point Lighthouse', 129, 'KINGSPORT', 'A modernized lighthouse kept by Basil Elton, who tells of a voyage aboard an uncanny white ship.', 'kingsport-harborside'),
    location('rope-and-anchor', 'The Rope and Anchor', 129, 'KINGSPORT', 'Jonas Rigg’s dockside tavern gathers sailors around nautical stories, puzzles, and openly served illicit drinks.', 'kingsport-harborside'),
    location('607-water-street', '607 Water Street', 130, 'KINGSPORT', 'A reclusive former mariner’s old manor is guarded by unsettling carved and painted stones in an overgrown yard.', 'kingsport-harborside'),
    location('kingsport-ferry-terminal', 'Ferry Terminal — Kingsport', 130, 'KINGSPORT', 'A busy passenger terminal links regional towns and offers currency exchange and smaller fishing charters.', 'kingsport-harborside'),
    location('kingsport-train-station', 'Kingsport Train Station', 130, 'KINGSPORT', 'A modest station links the town to Arkham and Boston while most local traffic travels by water.', 'kingsport-harborside'),
    location('kingsport-head', 'Kingsport Head', 130, 'KINGSPORT', 'High, sheer coastal promontories offer only a few rough paths above the Atlantic.', 'kingsport'),
    location('strange-high-house', 'Strange High House', 130, 'KINGSPORT', 'An ancient, ownerless-looking cliff house has an inaccessible front door and whispers that may follow visitors home.', 'kingsport-head'),
    location('kingsport-causeway', 'The Causeway', 130, 'KINGSPORT', 'A cliffside route links the headland to town above a tidal rock formation resembling a sea god’s face.', 'kingsport-head'),
    location('kingsport-wireless-station', 'Wireless Station', 130, 'KINGSPORT', 'A delayed communications project with four towers is plagued by accidents and concern about what its signals might reach.', 'kingsport-head'),
    location('kingsport-south-shore', 'South Shore', 131, 'KINGSPORT', 'A residential and tourist coast grows busy in summer and becomes desolate in winter.', 'kingsport'),
    location('kingsport-artists-colony', 'Artists’ Colony', 131, 'KINGSPORT', 'Beach shacks and cottages house Bohemian artists, workshops, galleries, and unsettling creative works.', 'kingsport-south-shore'),
    location('hall-school', 'Hall School', 131, 'KINGSPORT', 'A prestigious boarding school hosts community organizations, including a social club rumored to meet clandestinely.', 'kingsport-south-shore'),
    location('neils-curiosity-shop', 'Neil’s Curiosity Shop', 131, 'KINGSPORT', 'A waterfront curios seller displays souvenirs, strange carvings, and preserved specimens difficult to classify.', 'kingsport-south-shore'),
    location('providence', 'Providence', 132, 'PROVIDENCE', 'A prosperous Rhode Island city whose trade, industry, and society maintain subtle ties to the Miskatonic Valley.'),
    location('downtown-providence', 'Downtown — Providence', 132, 'PROVIDENCE', 'Government buildings and upscale commercial establishments cluster around City Hall Park.', 'providence'),
    location('providence-city-hall-park', 'City Hall Park', 132, 'PROVIDENCE', 'A trolley-connected civic park stands beside City Hall and the federal building.', 'downtown-providence'),
    location('biltmore-hotel', 'Biltmore Hotel', 133, 'PROVIDENCE', 'A luxurious hotel shelters a speakeasy and rumors that donor stipulations shaped its architecture for occult purposes.', 'downtown-providence'),
    location('knutsens-auction-house', 'Knutsen’s Auction House', 133, 'PROVIDENCE', 'Oline Knutsen specializes in rare objects with occult, cursed, or arcane significance.', 'downtown-providence'),
    location('ross-cavallo-and-terzi', 'Ross, Cavallo, and Terzi', 133, 'PROVIDENCE', 'A longstanding law firm manages estates and unusual acquisitions while its third partner remains elusive.', 'downtown-providence'),
    location('providence-federal-hill', 'Federal Hill', 133, 'PROVIDENCE', 'An Italian immigrant neighborhood stretches from old tenements up a hill of newer low-income buildings.', 'providence'),
    location('haunted-steeple', 'The Haunted Steeple', 133, 'PROVIDENCE', 'A fenced, derelict church once associated with Starry Wisdom stands as an avoided landmark.', 'providence-federal-hill'),
    location('blackwood-detective-agency', 'Blackwood Detective Agency', 133, 'PROVIDENCE', 'A private investigator with experience of unusual cases seeks contacts for an expanding Arkham branch.', 'providence-federal-hill'),
    location('providence-college-hill', 'College Hill', 134, 'PROVIDENCE', 'A university and residential district has many old houses with reputations for haunting.', 'providence'),
    location('providence-sixth-district-court-house', 'Providence Sixth District Court House', 134, 'PROVIDENCE', 'The renovated Old State House now serves as a courthouse after more than a century of legislative use.', 'providence-college-hill'),
    location('ward-house', 'Ward House', 134, 'PROVIDENCE', 'An old family manor lies sparsely occupied amid rumors about Charles Dexter Ward’s institutional confinement.', 'providence-college-hill'),
    location('shunned-house', 'The Shunned House', 134, 'PROVIDENCE', 'A vacant Benefit Street house draws Dr. Whipple’s investigation after repeated deaths and disappearances among residents.', 'providence-college-hill'),
    location('194-angell-street', '194 Angell Street', 134, 'PROVIDENCE', 'A convalescent home’s patients read an unusual library whose books can appear unreadable to outsiders.', 'providence-college-hill'),
    location('providence-south-side', 'South Side — Providence', 134, 'PROVIDENCE', 'Wealthy industrialists’ mansions coexist with factories and working-class neighborhoods.', 'providence'),
    location('roger-williams-park', 'Roger Williams Park', 134, 'PROVIDENCE', 'A large public park contains historic sites, attractions, and a mastiff statue with a curious history.', 'providence-south-side'),
    location('providence-museum-of-natural-history', 'Museum of Natural History', 135, 'PROVIDENCE', 'A park museum and planetarium investigate damage left by an astronomer who vanished after a lecture.', 'roger-williams-park'),
    location('narragansett-bay', 'Narragansett Bay', 135, 'PROVIDENCE', 'A broad estuary of islands, fishing, wildlife, and active harbors extends south from Providence.', 'providence'),
    location('richmond-paper-company-mill-complex', 'Richmond Paper Company Mill Complex', 135, 'PROVIDENCE', 'An old paper mill was converted to electrical works, yet its obsolete boiling-vat structures remain unexplained.', 'providence'),
    location('fox-point-and-india-point', 'Fox Point and India Point', 135, 'PROVIDENCE', 'A thriving Cape Verdean community adjoins busy docks preparing an unusually secretive cold-weather expedition.', 'providence'),
    location('salvation-society', 'Salvation Society', 135, 'PROVIDENCE', 'An elite riverside social club venerates a legend of rescue by a benevolent sea creature.', 'fox-point-and-india-point'),
    location('dreamlands', 'The Dreamlands', 162, 'OTHERWORLD', 'A realm reached through dreaming contains lands, inhabitants, and dangers with consequences for travelers.'),
    location('crothoakas-labyrinth', 'The Labyrinth', 169, 'OTHERWORLD', 'Crothoaka’s shifting bodily domain draws victims through contradictions and deceptive promises of enlightenment.'),
    location('yha-nthlei', 'Y’ha-nthlei', 175, 'OTHERWORLD', 'A Deep One city beneath Devil Reef houses Mother Hydra’s temple, brooding grottoes, and treasure vaults.'),
    location('vault-of-earthly-demise', 'The Vault of Earthly Demise', 183, 'OTHERWORLD', 'An otherworldly death realm contains decaying remains, ghoul inhabitants, and dangerous artifacts.'),
    location('chamber-of-desolation', 'The Chamber of Desolation', 184, 'OTHERWORLD', 'Deep within the Vault, a bone-and-sinew altar and a pool tied to Umôrdhoth tempt visitors with perilous power.', 'vault-of-earthly-demise')
  ];
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  return freeze({ schemaVersion: 1, sourceVersion: sourceVersion, provenance: provenance, source: provenance,
    npcs: npcs, creatures: creatures, ancientOnes: ancientOnes, locations: locations });
}());

// Trusted transaction hook: never returns these rows as a player catalog.
Arkham.seedGMCatalogForCampaign = function (state, campaign, at) {
  if (!state || typeof state !== 'object' || !campaign || typeof campaign.id !== 'string' || !campaign.id || typeof at !== 'string' || !at) {
    throw new TypeError('GM catalog registration requires state, campaign ID, and timestamp.');
  }
  if ((state.books && (typeof state.books !== 'object' || Array.isArray(state.books))) ||
      (state.entities && (typeof state.entities !== 'object' || Array.isArray(state.entities)))) {
    throw new TypeError('GM catalog registration requires dictionary tables.');
  }
  var catalog = Arkham.gmCatalog;
  var provenance = catalog.provenance;
  var bookId = campaign.id + ':corebook';
  var pending = {};
  ['npcs', 'creatures', 'ancientOnes', 'locations'].forEach(function (group) {
    catalog[group].forEach(function (record) {
      var canonicalId = 'gm:' + record.id;
      var id = campaign.id + ':catalog:' + canonicalId;
      if (Object.prototype.hasOwnProperty.call(pending, id)) throw new Error('Canonical GM catalog IDs must be unique.');
      pending[id] = { id: id, campaignId: campaign.id, bookId: bookId, ownerUserId: campaign.ownerUserId || null,
        canonicalCatalogId: canonicalId, entityId: canonicalId, type: record.type, name: record.name,
        englishDescription: record.description, canonicalProperties: JSON.parse(JSON.stringify(record.statFacts)),
        statFacts: JSON.parse(JSON.stringify(record.statFacts)), printedPage: record.printedPage, pdfPageIndex: record.pdfPageIndex,
        source: { bookId: bookId, printedPage: record.printedPage, pdfPageIndex: record.pdfPageIndex, sha256: provenance.sha256 },
        sourceVersion: catalog.sourceVersion, sourceChecksum: provenance.sha256,
        verificationStatus: 'VERIFIED', statusSource: 'VERIFIED', extractionStatus: 'COMPILED_GM_REFERENCE_FACTS',
        automation: 'REFERENCE_ONLY', visibility: 'CO_GM', selectedUserIds: [], createdAt: at, updatedAt: at, version: 1 };
    });
  });
  state.books = state.books || {};
  state.entities = state.entities || {};
  var result = { bookId: bookId, booksCreated: 0, entitiesCreated: 0, entitiesPreserved: 0 };
  if (!Object.prototype.hasOwnProperty.call(state.books, bookId)) {
    state.books[bookId] = { id: bookId, campaignId: campaign.id, ownerUserId: campaign.ownerUserId || null,
      title: provenance.title, edition: provenance.edition, checksum: provenance.sha256, sourceVersion: catalog.sourceVersion,
      visibility: 'CO_GM', driveFileId: null, verificationStatus: 'VERIFIED', importStatus: 'CANONICAL_CATALOG',
      extractionStatus: 'FACTS_AND_ORIGINAL_SUMMARIES', importedAt: at, createdAt: at, updatedAt: at, version: 1 };
    result.booksCreated = 1;
  }
  Object.keys(pending).forEach(function (id) {
    if (Object.prototype.hasOwnProperty.call(state.entities, id)) result.entitiesPreserved += 1;
    else { state.entities[id] = pending[id]; result.entitiesCreated += 1; }
  });
  return result;
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { gmCatalog: Arkham.gmCatalog, seedGMCatalogForCampaign: Arkham.seedGMCatalogForCampaign };
}
