// actionCatalog.ts — P81-12 (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten):
// "En tom handlingsplats går att trycka på och öppnar en handlingskatalog:
// alla verb som kostar en plats, grupperade per föremål, var och en med ett
// hopp till föremålet där den utförs. Verb som ännu inte går att nå visas
// inte, så katalogen växer i P84–P86."
//
// Statisk data, inte härledd ur state — "går att nå" avgörs av om en riktig
// FORM finns byggd någonstans i appen (CountryFile.tsx, TheHouse.tsx), inte
// av något GameState kan uttrycka (validateAction vet om en handling är
// GILTIG, aldrig om ett gränssnitt för den finns). Listan underhålls för
// hand, en rad per redan byggd form — samma princip som mapLegend.ts:s
// MAP_LEGEND (en post per symbol som redan finns, aldrig en som inte gör
// det).
//
// §7.1:s tabell delar upp bud (inget verb, kostar ingen plats — §7.2) från
// resten — den här katalogen listar bara handlingar som FAKTISKT kostar en
// handlingsplats, ordagrant vad P81-12 ber om.
export type ActionCatalogView = 'operations' | 'company' | 'contacts'

export interface ActionCatalogEntry {
  verb: string
  label: string
  objectGroup: string
  target: ActionCatalogView
}

// Grupperna följer §7.1:s tabell ("Föremål | Verb | Mål väljs ur"), i den
// ordning tabellen listar dem. Jämför mot Shell.tsx:s VERB_ICON för ikonen —
// en delad källa, upprepas aldrig här.
export const ACTION_CATALOG: readonly ActionCatalogEntry[] = [
  // Land med egen station (CountryFile.tsx, P79) — underrättelseverben.
  { verb: 'EXPAND', label: 'Expand a station', objectGroup: 'Country with a station', target: 'operations' },
  { verb: 'WITHDRAW', label: 'Withdraw a station', objectGroup: 'Country with a station', target: 'operations' },
  { verb: 'LEAK', label: 'Leak against a rival', objectGroup: 'Country with a station', target: 'operations' },
  { verb: 'SABOTAGE', label: 'Sabotage a rival', objectGroup: 'Country with a station', target: 'operations' },
  { verb: 'TURN', label: 'Turn an official', objectGroup: 'Country with a station', target: 'operations' },
  // Land utan station.
  { verb: 'RECRUIT', label: 'Recruit a new station', objectGroup: 'Country without a station', target: 'operations' },
  // Faktion / huvudstad. INFLUENCE byggd i CountryFile.tsx (P79); STAGE_
  // INCIDENT/BACK_CHANNEL/FUND_COUP/BROKER i ThePolitics.tsx (CONTACTS, P86).
  { verb: 'INFLUENCE', label: 'Influence public support or relations', objectGroup: 'Faction / capital', target: 'operations' },
  { verb: 'STAGE_INCIDENT', label: 'Stage an incident', objectGroup: 'Faction / capital', target: 'contacts' },
  { verb: 'BACK_CHANNEL', label: 'Open a back channel', objectGroup: 'Faction / capital', target: 'contacts' },
  { verb: 'FUND_COUP', label: 'Fund a coup', objectGroup: 'Faction / capital', target: 'contacts' },
  { verb: 'BROKER', label: 'Broker a direct deal', objectGroup: 'Faction / capital', target: 'contacts' },
  // Tjänsteman (ThePolitics.tsx, CONTACTS, P86).
  { verb: 'BRIBE', label: 'Bribe an official', objectGroup: 'Official', target: 'contacts' },
  { verb: 'FUND_CAMPAIGN', label: "Fund an official's campaign", objectGroup: 'Official', target: 'contacts' },
  { verb: 'FAVOUR', label: 'Do an official a favour', objectGroup: 'Official', target: 'contacts' },
  { verb: 'ASSASSINATE', label: 'Assassinate an official', objectGroup: 'Official', target: 'contacts' },
  // THE COMPANY (TheHouse.tsx).
  { verb: 'TAKE_LOAN', label: 'Take a loan', objectGroup: 'THE COMPANY', target: 'company' },
  { verb: 'REPAY', label: 'Repay debt', objectGroup: 'THE COMPANY', target: 'company' },
  { verb: 'BUILD_LINE', label: 'Build a production line', objectGroup: 'THE COMPANY', target: 'company' },
  { verb: 'HIRE', label: 'Hire staff', objectGroup: 'THE COMPANY', target: 'company' },
  { verb: 'REPRIORITISE_RND', label: 'Reprioritise R&D', objectGroup: 'THE COMPANY', target: 'company' },
  // Råvarupanel i THE COMPANY (§7.1:s egen rad) — P85, CompanyActions.tsx.
  { verb: 'BUY_FORWARD', label: 'Reserve a commodity', objectGroup: 'Raw materials panel', target: 'company' },
  { verb: 'RELEASE', label: 'Release a commodity reserve', objectGroup: 'Raw materials panel', target: 'company' },
] as const
