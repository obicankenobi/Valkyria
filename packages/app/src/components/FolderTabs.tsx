// FolderTabs — etapp 13, P199 (förslag 13-3, speltest 2026-10-17 punkt 12): registerflikar överst i en mapp. Ett tryck visar bara den delen av mappen, så att
// en lång mapp (CONTRACTS, CONTACTS, THE COMPANY) inte längre är en enda scroll där allt smälter ihop. Pilarna vänster/höger flyttar mellan flikarna (WAI-ARIA tabs).
import type { KeyboardEvent, ReactNode } from 'react'

export interface FolderTab<T extends string> {
  id: T
  label: ReactNode
  // Ett tal på fliken (t.ex. antalet öppna ordrar); 0 eller utelämnat visar inget.
  count?: number
  // En flik med något som väntar på spelaren (ett larm, en låg stödnivå) får en röd markering.
  alert?: boolean
}

export function FolderTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  testId,
  tabTestId,
}: {
  tabs: readonly FolderTab<T>[]
  value: T
  onChange: (id: T) => void
  label: string
  testId: string
  // Testid per flik; standard `${testId}-${id}`.
  tabTestId?: (id: T) => string
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    if (!next) return
    onChange(next.id)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[tabs.indexOf(next)]?.focus()
  }

  return (
    <div className="drawer-tabs folder-tabs" role="tablist" aria-label={label} data-testid={testId} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`drawer-tab${selected ? ' is-active' : ''}${tab.alert ? ' is-alert' : ''}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            data-testid={tabTestId ? tabTestId(tab.id) : `${testId}-${tab.id}`}
          >
            <span className="folder-tab-label">{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && <span className="folder-tab-count">{tab.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
