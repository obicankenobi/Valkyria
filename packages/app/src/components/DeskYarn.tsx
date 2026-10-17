// DeskYarn.tsx — Paket G2 (ETAPP 12, 12C): ritar den fysiska röda karttråden
// från ett hovrat dokument/kort på skrivbordet till exakt rätt DOM-nod på
// TheatreMap. Använder getBoundingClientRect() + MutationObserver på kartans
// zoom-grupp så att tråden aldrig pekar utanför kartan eller tappar synk vid
// panorering/zoom.
import { useCallback, useEffect, useId, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { DeskYarnContext } from '../deskYarnContext.js'
import type { DeskYarnConnection } from '../deskYarnContext.js'

const COUNTRY_BY_FACTION: Record<string, string> = {
  rvn: 'south-vietnam',
  laos: 'laos',
}

export function resolveMapTargetElement(targetId: string): Element | null {
  if (typeof document === 'undefined' || !targetId) return null
  const selectors = [
    `[data-map-node="${targetId}"]`,
    `[data-testid="map-formation-${targetId}"]`,
    `[data-testid="map-capital-${targetId}"] .map-capital-marker`,
    `[data-testid="map-capital-${targetId}"]`,
    `[data-testid="map-landless-${targetId}"]`,
    `[data-testid="map-sector-${targetId}"]`,
    `[data-testid="map-frontline-marker-${targetId}"]`,
    `[data-testid="map-frontline-${targetId}"]`,
    `[data-testid="map-works-${targetId}"]`,
  ]
  const mappedCountry = COUNTRY_BY_FACTION[targetId]
  if (mappedCountry) {
    selectors.push(`[data-testid="map-country-${mappedCountry}"]`)
  }
  selectors.push(`[data-testid="map-country-${targetId}"]`)

  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el) return el
  }
  return null
}

interface YarnGeometry {
  startX: number
  startY: number
  endX: number
  endY: number
  controlX: number
  controlY: number
  tone: 'red' | 'amber' | 'blue'
}

function computeYarnGeometry(conn: DeskYarnConnection | null): YarnGeometry | null {
  if (!conn || !conn.sourceEl.isConnected) return null
  const targetEl = resolveMapTargetElement(conn.targetId)
  if (!targetEl) return null

  const mapContainer = document.querySelector('[data-testid="theatre-map"] .map-svg')
  const sourceRect = conn.sourceEl.getBoundingClientRect()
  const targetRect = targetEl.getBoundingClientRect()

  if (sourceRect.width === 0 && sourceRect.height === 0) return null
  if (targetRect.width === 0 && targetRect.height === 0) return null

  const endX = targetRect.left + targetRect.width / 2
  const endY = targetRect.top + targetRect.height / 2

  let clampedEndX = endX
  let clampedEndY = endY
  if (mapContainer) {
    const mapRect = mapContainer.getBoundingClientRect()
    clampedEndX = Math.max(mapRect.left + 14, Math.min(mapRect.right - 14, endX))
    clampedEndY = Math.max(mapRect.top + 14, Math.min(mapRect.bottom - 14, endY))
  }

  const startOnLeft = sourceRect.left > clampedEndX
  const startX = startOnLeft ? sourceRect.left + 6 : sourceRect.right - 6
  const startY = sourceRect.top + Math.min(24, sourceRect.height / 2)

  const dist = Math.hypot(clampedEndX - startX, clampedEndY - startY)
  const arcLift = Math.min(68, Math.max(22, dist * 0.14))
  const controlX = (startX + clampedEndX) / 2
  const controlY = Math.min(startY, clampedEndY) - arcLift

  return {
    startX,
    startY,
    endX: clampedEndX,
    endY: clampedEndY,
    controlX,
    controlY,
    tone: conn.tone ?? 'red',
  }
}

export function DeskYarnProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<DeskYarnConnection | null>(null)
  const [geometry, setGeometry] = useState<YarnGeometry | null>(null)
  const filterId = useId()

  const connectYarn = useCallback((sourceEl: HTMLElement, targetId: string, tone?: 'red' | 'amber' | 'blue') => {
    setConnection({ sourceEl, targetId, tone })
  }, [])

  const clearYarn = useCallback(() => {
    setConnection(null)
  }, [])

  useLayoutEffect(() => {
    setGeometry(computeYarnGeometry(connection))
  }, [connection])

  useEffect(() => {
    if (!connection) return
    const update = () => setGeometry(computeYarnGeometry(connection))

    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    const svgGroup = document.querySelector('.map-svg > g')
    let observer: MutationObserver | null = null
    if (svgGroup && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(update)
      observer.observe(svgGroup, { attributes: true, attributeFilter: ['transform'] })
    }

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      observer?.disconnect()
    }
  }, [connection])

  return (
    <DeskYarnContext.Provider value={{ connection, connectYarn, clearYarn }}>
      {children}
      {geometry && (
        <svg className="desk-yarn-overlay" data-testid="desk-yarn-overlay" aria-hidden="true">
          <defs>
            <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow dx="0" dy="4" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.55" />
            </filter>
          </defs>
          <g filter={`url(#${filterId})`} className={`desk-yarn-group is-${geometry.tone}`}>
            <path
              d={`M ${geometry.startX.toFixed(1)} ${geometry.startY.toFixed(1)} Q ${geometry.controlX.toFixed(1)} ${geometry.controlY.toFixed(1)} ${geometry.endX.toFixed(1)} ${geometry.endY.toFixed(1)}`}
              className="desk-yarn-line"
              data-testid="desk-yarn-line"
            />
            <circle cx={geometry.startX} cy={geometry.startY} r={4.5} className="desk-yarn-pin-start" />
            <circle cx={geometry.endX} cy={geometry.endY} r={14} className="desk-yarn-target-halo" />
            <circle cx={geometry.endX} cy={geometry.endY} r={4} className="desk-yarn-pin-end" />
          </g>
        </svg>
      )}
    </DeskYarnContext.Provider>
  )
}
