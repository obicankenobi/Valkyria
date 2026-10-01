// verbIcons — verb → SVG-ikon (public/art/icons/<VERB>.svg, genererade av tillgångsfabriken,
// scripts/art/icons.mjs). Ersätter de Unicode-tecken som tidigare stod i Shell.tsx:s VERB_ICON (✎ stod
// för tre olika verb, ☠ för två, £ för två — fabrikens 22 ikoner är alla olika, artFactory.test.ts).
// Nyckellistan är de 22 verben (+ etapp 9:s FIELD_TRIAL och REVERSE_ENGINEER); värdet är URL:en VerbIcon maskar ut med currentColor.
const VERBS = [
  'EXPAND',
  'WITHDRAW',
  'LEAK',
  'SABOTAGE',
  'TURN',
  'RECRUIT',
  'INFLUENCE',
  'STAGE_INCIDENT',
  'BACK_CHANNEL',
  'BRIBE',
  'FUND_CAMPAIGN',
  'FAVOUR',
  'FUND_COUP',
  'ASSASSINATE',
  'BROKER',
  'BUY_FORWARD',
  'RELEASE',
  'TAKE_LOAN',
  'REPAY',
  'BUILD_LINE',
  'HIRE',
  'REPRIORITISE_RND',
  'FIELD_TRIAL', // P126
  'REVERSE_ENGINEER', // P126
] as const

export const VERB_ICON: Record<string, string> = Object.fromEntries(VERBS.map((verb) => [verb, `/art/icons/${verb}.svg`]))
