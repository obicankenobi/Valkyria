// facilities — testhjälp (P176): ger ett hus alla anläggningar som forskning, konstruktion och provning nu kräver (labb i varje kategori på nivå 3, ritkontor på nivå 3 och en provplats med klimatkammare på nivå 2),
// så att tester av etapp 9:s regler (forskning, konstruktion, provning) kan köra utan att först bygga dem.
import { TECH_CATEGORIES } from '../../src/validateAction.js'
import type { Facility, GameState, TechCategory } from '../../src/types.js'

const CATEGORIES: readonly TechCategory[] = TECH_CATEGORIES as readonly TechCategory[]

export function withKnowledgeWorks<T extends Pick<GameState, 'house'>>(state: T): T {
  const works = state.house.works
  const has = (kind: Facility['kind'], category: TechCategory | null = null): Facility | undefined => works.find((w) => w.kind === kind && (category === null || w.category === category))
  for (const category of CATEGORIES) {
    const lab = has('laboratory', category)
    if (lab) lab.level = 3
    else works.push({ id: `works-lab-${category}`, kind: 'laboratory', level: 3, category, condition: 100, staffing: 100, skill: 50, status: 'operating', lines: [], invested: 0 })
  }
  const office = has('design')
  if (office) office.level = 3
  else works.push({ id: 'works-design-x', kind: 'design', level: 3, category: null, condition: 100, staffing: 100, skill: 50, status: 'operating', lines: [], invested: 0 })
  const ground = has('proving')
  if (ground) ground.level = 2
  else works.push({ id: 'works-proving-x', kind: 'proving', level: 2, category: null, condition: 100, staffing: 100, skill: 50, status: 'operating', lines: [], invested: 0 })
  return state
}
