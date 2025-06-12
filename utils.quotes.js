const tyranidQuotes = [
  "We are the swarm.",
  "There is only the Hive.",
  "Biomass will be consumed.",
  "The flesh is weak. Feed it.",
  "Worlds are but nutrients.",
  "Assimilation is survival.",
  "Your fate is digestion.",
  "The Hive Mind watches.",
  "Evolve or perish.",
  "We devour stars.",
  "Silence the prey.",
  "Your end is inevitable.",
  "We are many. You are one.",
  "Flesh and bone, fuel alone.",
  "The swarm hungers."
];

function getRandomTyranidQuote() {
  return tyranidQuotes[Math.floor(Math.random() * tyranidQuotes.length)];
}

module.exports = { tyranidQuotes, getRandomTyranidQuote };
