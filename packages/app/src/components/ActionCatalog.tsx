// ActionCatalog.tsx — P81-12 (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten):
// "En tom handlingsplats går att trycka på och öppnar en handlingskatalog:
// alla verb som kostar en plats, grupperade per föremål, var och en med ett
// hopp till föremålet där den utförs." Ren presentation över
// actionCatalog.ts:s statiska data — samma BottomSheet-mönster som
// MapLegend.tsx (P81a).
import { BottomSheet } from './designSystem.js'
import { VerbIcon } from './VerbIcon.js'
import { ACTION_CATALOG } from '../actionCatalog.js'
import type { ActionCatalogEntry, ActionCatalogView } from '../actionCatalog.js'

function groupByObject(entries: readonly ActionCatalogEntry[]): { objectGroup: string; entries: ActionCatalogEntry[] }[] {
  const order: string[] = []
  const map = new Map<string, ActionCatalogEntry[]>()
  for (const entry of entries) {
    const bucket = map.get(entry.objectGroup)
    if (bucket) {
      bucket.push(entry)
    } else {
      map.set(entry.objectGroup, [entry])
      order.push(entry.objectGroup)
    }
  }
  return order.map((objectGroup) => ({ objectGroup, entries: map.get(objectGroup)! }))
}

export function ActionCatalog({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (view: ActionCatalogView) => void
}) {
  const groups = groupByObject(ACTION_CATALOG)

  return (
    <BottomSheet
      open={open}
      title="Actions"
      subtitle="Every verb that costs a slot, and where to use it"
      onClose={onClose}
      testId="action-catalog"
    >
      <div className="action-catalog-list">
        {groups.map((group) => (
          <div key={group.objectGroup} className="action-catalog-group" data-testid={`action-catalog-group-${group.objectGroup}`}>
            <h3 className="action-catalog-group-title">{group.objectGroup}</h3>
            {group.entries.map((entry) => (
              <button
                key={entry.verb}
                type="button"
                className="action-catalog-entry"
                onClick={() => {
                  onNavigate(entry.target)
                  onClose()
                }}
                data-testid={`action-catalog-entry-${entry.verb}`}
              >
                <span className="action-catalog-entry-icon" aria-hidden="true">
                  <VerbIcon verb={entry.verb} />
                </span>
                <span className="action-catalog-entry-label">{entry.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </BottomSheet>
  )
}
