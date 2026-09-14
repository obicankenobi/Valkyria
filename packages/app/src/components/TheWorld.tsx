// THE WORLD — läsvy: fronter, faktioner, heat, DOOMSDAY, stationer. Se
// ETAPP1_TEKNISK_SPEC.md avsnitt 8, DESIGN.md avsnitt 18. Ingen karta —
// fronten visas som en linje med en position, exakt vad simuleringen
// modellerar (DESIGN.md: "en karta som är mer detaljerad än modellen är ett
// löfte spelet inte kan hålla").
import type { GameState } from '@seventh-front/core'

export function TheWorld({ state }: { state: GameState }) {
  return (
    <section>
      <h2>THE WORLD</h2>

      <h3>DOOMSDAY</h3>
      <p>
        {state.doomsday.toFixed(0)} / 100 (högsta hittills: {state.doomsdayPeak.toFixed(0)})
      </p>

      <h3>Teatrar</h3>
      <table>
        <thead>
          <tr>
            <th>Teater</th>
            <th>Heat</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(state.theatres).map((theatre) => (
            <tr key={theatre.id}>
              <td>{theatre.name}</td>
              <td>{theatre.heat.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Fronter</h3>
      {Object.values(state.fronts).map((front) => {
        const sideA = state.factions[front.sideA]
        const sideB = state.factions[front.sideB]
        return (
          <div key={front.id} style={{ marginBottom: '0.75rem' }}>
            <p>
              {front.id}: {sideA ? sideA.name : front.sideA} ↔ {sideB ? sideB.name : front.sideB} — position{' '}
              {front.position.toFixed(0)} (−100 = {sideA ? sideA.name : front.sideA} vunnit, +100 ={' '}
              {sideB ? sideB.name : front.sideB} vunnit)
            </p>
            <p>
              Moral {front.morale.a.toFixed(0)}/{front.morale.b.toFixed(0)} — styrka {front.strength.a.toFixed(0)}/
              {front.strength.b.toFixed(0)} — förluster totalt {front.casualtiesTotal.a}/{front.casualtiesTotal.b}
            </p>
          </div>
        )
      })}

      <h3>Faktioner</h3>
      <table>
        <thead>
          <tr>
            <th>Faktion</th>
            <th>Relation</th>
            <th>Alignment</th>
            <th>Public support</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(state.factions).map((faction) => (
            <tr key={faction.id}>
              <td>{faction.name}</td>
              <td>{faction.relationToPlayer.toFixed(0)}</td>
              <td>{faction.alignment.toFixed(0)}</td>
              <td>{faction.publicSupport.toFixed(0)}</td>
              <td>
                {faction.bankrupt ? 'BANKRUTT ' : ''}
                {faction.embargoed ? 'EMBARGO' : ''}
                {!faction.bankrupt && !faction.embargoed ? '—' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Stationer</h3>
      <table>
        <thead>
          <tr>
            <th>Station</th>
            <th>Djup</th>
            <th>Exponering</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {state.house.stations.map((station) => (
            <tr key={station.id}>
              <td>
                {station.city} ({state.factions[station.nation]?.name ?? station.nation})
              </td>
              <td>{station.depth}</td>
              <td>{station.exposure.toFixed(0)}</td>
              <td>{station.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
