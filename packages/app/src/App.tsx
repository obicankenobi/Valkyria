// THE SEVENTH FRONT — THE WIRE och THE FLOOR (P11). THE HOUSE/THE WORLD och
// IndexedDB-persistens byggs i P12. Se ETAPP1_TEKNISK_SPEC.md avsnitt 8, 10.
import { useState } from 'react'
import { TheFloor } from './components/TheFloor.js'
import { TheWire } from './components/TheWire.js'
import { useGame } from './useGame.js'

type View = 'wire' | 'floor'

function formatMoney(amount: number): string {
  return `£${Math.round(amount).toLocaleString('sv-SE')}`
}

function endingLabel(ending: string): string {
  switch (ending) {
    case 'INSOLVENCY':
      return 'INSOLVENT — huset likviderat'
    case 'BUYOUT':
      return 'UTKÖPT — styrelsemålet missat'
    case 'EXPOSURE':
      return 'AVSLÖJAT — licensen indragen'
    case 'NUCLEAR_EXCHANGE':
      return 'KÄRNVAPENUTVÄXLING'
    case 'SCENARIO_COMPLETE':
      return 'SCENARIOT SLUTFÖRT'
    default:
      return ending
  }
}

export function App() {
  const { state, draft, lastRejected, setBid, removeBid, endTurn, restart } = useGame()
  const [view, setView] = useState<View>('wire')

  const ended = state.status.kind === 'ended'

  function handleEndTurn() {
    endTurn()
    setView('wire') // THE WIRE är startvyn varje tur (avsnitt 8)
  }

  return (
    <main style={{ fontFamily: 'ui-monospace, monospace', padding: '1.5rem', maxWidth: '48rem' }}>
      <h1>THE SEVENTH FRONT</h1>

      <header style={{ marginBottom: '1rem', borderBottom: '1px solid currentColor', paddingBottom: '0.5rem' }}>
        <p>
          {state.house.name} — år {state.meta.year} kv{state.meta.quarter} (tur {state.meta.turn}) — kassa{' '}
          {formatMoney(state.house.treasury)} — doomsday {state.doomsday.toFixed(0)}
        </p>
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={() => setView('wire')} disabled={view === 'wire'}>
            THE WIRE
          </button>
          <button type="button" onClick={() => setView('floor')} disabled={view === 'floor'}>
            THE FLOOR ({state.market.openOrders.length})
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={handleEndTurn} disabled={ended}>
            Avsluta tur ({draft.bids.length} bud)
          </button>
        </nav>
      </header>

      {lastRejected.length > 0 && (
        <div style={{ marginBottom: '1rem', border: '1px solid currentColor', padding: '0.5rem' }}>
          <p>Avvisat förra turen:</p>
          <ul>
            {lastRejected.map((r, i) => (
              <li key={i}>{r.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {ended && state.status.kind === 'ended' && (
        <div style={{ marginBottom: '1rem', border: '1px solid currentColor', padding: '0.5rem' }}>
          <p>
            <strong>PARTIET SLUT: {endingLabel(state.status.ending)}</strong> (tur {state.status.turn})
          </p>
          <button type="button" onClick={restart}>
            Nytt parti
          </button>
        </div>
      )}

      {view === 'wire' ? (
        <TheWire wire={state.wire} />
      ) : (
        <TheFloor state={state} draft={draft} onSubmitBid={setBid} onRemoveBid={removeBid} />
      )}
    </main>
  )
}
