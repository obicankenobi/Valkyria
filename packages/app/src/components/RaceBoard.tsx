// RaceBoard — P127 (ETAPP9_FORSLAG.md §7.1, §7.3, §9). Kapplöpningstavlan: den enda tavlan i etappen. Två kolumner med blåkopiesiluetter, väst
// och öst, en rad per kategori. Ett fettkritsstreck visar den BEDÖMDA generationen (ett intervall, aldrig sanningen — skyddsräcke 5), och varje
// rad bär en stämpel för säkerheten (CONFIRMED eller ESTIMATE — … CONFIDENCE) ur raceAssessment. Under tavlan ligger nästa kvartals kravkort,
// synliga: vilket block som höjer kraven i vilken kategori, men aldrig generationsnumret (requirementCards). Husets egen bästa konstruktion i
// kategorin är ett litet märke på skalan, så tavlan svarar på frågan "hur ligger jag till?".
import { BLOCS, TECH_CATEGORIES, raceAssessment, requirementCards } from '@seventh-front/core'
import type { Bloc, GameState, TechCategory } from '@seventh-front/core'
import { DrawingSilhouette } from './DrawingBoard.js'
import { Panel, Tag } from './ui.js'
import { CATEGORY_NAME } from '../designSheet.js'

const BLOC_NAME: Record<Bloc, string> = { west: 'WEST', east: 'EAST' }

function ownBestGeneration(state: GameState, category: TechCategory): number | null {
  const gens = (state.house.designs ?? []).filter((d) => d.category === category && d.status === 'active').map((d) => d.generation)
  return gens.length > 0 ? Math.max(...gens) : null
}

// Generationsskalan: 1..scaleMax med ett streck från low till high (fettkrita) och ett ruter-märke för husets egen konstruktion.
function GenerationScale({ low, high, own, scaleMax, bloc }: { low: number; high: number; own: number | null; scaleMax: number; bloc: Bloc }) {
  const x = (g: number) => 8 + ((g - 1) / Math.max(1, scaleMax - 1)) * 84
  return (
    <svg className="race-scale" viewBox="0 0 100 24" aria-hidden="true">
      <line x1="8" y1="14" x2="92" y2="14" className="race-scale-axis" />
      {Array.from({ length: scaleMax }, (_, i) => i + 1).map((g) => (
        <line key={g} x1={x(g)} y1="10" x2={x(g)} y2="18" className="race-scale-tick" />
      ))}
      <line x1={x(low)} y1="14" x2={x(high)} y2="14" className={`race-scale-crayon is-${bloc}`} />
      {own !== null && <path d={`M${x(own)} 3 l3 3 l-3 3 l-3 -3 z`} className="race-scale-own" />}
    </svg>
  )
}

export function RaceBoard({ state }: { state: GameState }) {
  const cards = requirementCards(state)
  const assessments = BLOCS.flatMap((bloc) => TECH_CATEGORIES.map((category) => raceAssessment(state, bloc, category)))
  const own = new Map(TECH_CATEGORIES.map((c) => [c, ownBestGeneration(state, c)] as const))
  const scaleMax = Math.max(4, ...assessments.map((a) => a.high), ...[...own.values()].map((g) => g ?? 0)) + 1

  return (
    <Panel info="How far each bloc has come in each category, as your intelligence estimates it. Deeper intelligence gives a narrower estimate." infoTopic="design" title="The arms race" right={<Tag>assessed by your intelligence</Tag>}>
      <div className="race-board" data-testid="race-board">
        <div className="race-columns">
          {BLOCS.map((bloc) => (
            <section className={`race-column is-${bloc}`} key={bloc} data-testid={`race-column-${bloc}`}>
              <h3 className="race-column-title">{BLOC_NAME[bloc]}</h3>
              {TECH_CATEGORIES.map((category) => {
                const a = raceAssessment(state, bloc, category)
                const gap = state.race.gap?.[category]
                return (
                  <div className="race-row" key={category} data-testid={`race-row-${bloc}-${category}`}>
                    <div className="race-row-head">
                      <DrawingSilhouette category={category} progress={1} className="race-sil" testId={`race-sil-${bloc}-${category}`} />
                      <span className="race-row-name">{CATEGORY_NAME[category]}</span>
                    </div>
                    <GenerationScale low={a.low} high={a.high} own={own.get(category) ?? null} scaleMax={scaleMax} bloc={bloc} />
                    <div className="race-row-text">
                      <span data-testid={`race-gen-${bloc}-${category}`}>{a.low === a.high ? `GEN ${a.low}` : `GEN ${a.low}–${a.high}`}</span>
                      {gap?.leader === bloc && <span className="race-gap">GAP LEADER</span>}
                    </div>
                    <span className={`race-stamp ${a.confidence === 'CONFIRMED' ? 'is-confirmed' : 'is-estimate'}`} data-testid={`race-stamp-${bloc}-${category}`}>
                      {a.stamp}
                    </span>
                  </div>
                )
              })}
            </section>
          ))}
        </div>
        <p className="cf-hint race-legend">◆ marks your best design in the category. The crayon line is what your intelligence believes — never the truth.</p>

        <h3 className="race-cards-title">Requirement cards</h3>
        {cards.length === 0 ? (
          <p className="cf-hint" data-testid="race-no-cards">
            No change in requirements is expected soon.
          </p>
        ) : (
          <div className="race-cards" data-testid="race-cards">
            {cards.map((card) => (
              <div className={`race-card is-${card.bloc}`} key={`${card.bloc}-${card.category}`} data-testid={`race-card-${card.bloc}-${card.category}`}>
                <span className="race-card-when">{card.inTurns === 0 ? 'THIS QUARTER' : card.inTurns === 1 ? 'NEXT QUARTER' : `IN ${card.inTurns} QUARTERS`}</span>
                <span className="race-card-what">
                  {BLOC_NAME[card.bloc]} · {CATEGORY_NAME[card.category]}
                </span>
                <span className="cf-hint">The ministries raise the bar — older designs may be phased out.</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
