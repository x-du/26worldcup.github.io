// Deterministic group standings and knockout bracket from pre-game win
// probabilities: simulate unfinished group matches, rank tables, assign best
// thirds, then walk the knockout tree picking the most likely winner at each node.
import type { Match, MatchProbs, Standings, Team, ThirdRow, Venue } from '../types'
import { assignThirds, pairProbs, predictGroupScoreline, tableFor, type GroupRow, type SimModel } from '../sim/engine'
import type { SlotOverlay } from './bracketResolve'

export interface PredictedBracket {
  overlay: SlotOverlay
  /** match number → predicted winner (for bracket win/lose styling) */
  winners: Map<number, string>
  champion: string | null
  groupTables: Record<string, GroupRow[]>
  standings: Standings
}

function vCountry(m: Match, venues: Record<string, Venue>): string | undefined {
  return m.venueId ? venues[m.venueId]?.country : undefined
}

/** most likely scoreline from model odds (Poisson goals × W/D/L outcome) */
function predictGroupScore(
  probs: MatchProbs | undefined,
  model: SimModel,
  home: string,
  away: string,
  venueCountry: string | undefined,
): { gh: number; ga: number } {
  const score = predictGroupScoreline(model, home, away, venueCountry, probs)
  return { gh: score.h, ga: score.a }
}

/** pick a knockout advancer; uses ah when present, else regulation + rating tiebreak */
function predictKoWinner(
  matchId: string,
  probs: Record<string, MatchProbs>,
  model: SimModel,
  home: string,
  away: string,
  venueCountry: string | undefined,
): string {
  const p = probs[matchId]
  if (p?.ah != null) return p.ah >= 50 ? home : away
  if (p) {
    if (p.h >= p.a && p.h >= p.d) return home
    if (p.a >= p.h && p.a >= p.d) return away
  }
  const { h, d, a, dr } = pairProbs(model, home, away, venueCountry)
  if (d >= h && d >= a) return dr >= 0 ? home : away
  return h >= a ? home : away
}

function realWinner(m: Match): string | null {
  if (m.status !== 'finished' || !m.home || !m.away) return null
  if (m.winner) return m.winner
  if ((m.home.pen ?? 0) !== (m.away.pen ?? 0))
    return (m.home.pen ?? 0) > (m.away.pen ?? 0) ? m.home.code : m.away.code
  if ((m.home.score ?? 0) !== (m.away.score ?? 0))
    return (m.home.score ?? 0) > (m.away.score ?? 0) ? m.home.code : m.away.code
  return null
}

function groupTablesToStandings(
  groupTables: Record<string, GroupRow[]>,
  rankOf: (c: string) => number,
): Standings {
  const groups: Standings['groups'] = {}
  for (const [g, rows] of Object.entries(groupTables)) {
    groups[g] = rows.map((r, i) => ({ ...r, rank: i + 1 }))
  }

  const thirdRows = Object.entries(groupTables).map(([g, t]) => ({ group: g, row: t[2] }))
  thirdRows.sort(
    (x, y) =>
      y.row.pts - x.row.pts ||
      y.row.gd - x.row.gd ||
      y.row.gf - x.row.gf ||
      rankOf(x.row.code) - rankOf(y.row.code) ||
      x.group.localeCompare(y.group),
  )

  const thirds: ThirdRow[] = thirdRows.map((t, i) => ({
    ...t.row,
    rank: 3,
    group: t.group,
    thirdRank: i + 1,
    qualifies: i < 8,
  }))

  const complete: Record<string, boolean> = {}
  for (const g of Object.keys(groups)) complete[g] = true

  return { groups, thirds, complete }
}

/** predicted scores for group fixtures (real results kept for finished matches) */
export function predictedMatchScores(
  matches: Match[],
  _teams: Record<string, Team>,
  venues: Record<string, Venue>,
  model: SimModel,
  probs: Record<string, MatchProbs>,
): Record<string, { h: number; a: number }> {
  const out: Record<string, { h: number; a: number }> = {}
  for (const m of matches) {
    if (m.stage !== 'group' || !m.home || !m.away) continue
    if (m.status === 'finished' && m.home.score != null && m.away.score != null) continue
    const { gh, ga } = predictGroupScore(probs[m.id], model, m.home.code, m.away.code, vCountry(m, venues))
    out[m.id] = { h: gh, a: ga }
  }
  return out
}

/** predicted group tables + best-thirds ranking (keeps real finished match scores) */
export function predictedStandings(
  matches: Match[],
  teams: Record<string, Team>,
  venues: Record<string, Venue>,
  model: SimModel,
  probs: Record<string, MatchProbs>,
): Standings {
  const rankOf = (c: string) => teams[c]?.ranking ?? Number.POSITIVE_INFINITY
  const groupMatches = matches.filter((m) => m.stage === 'group')
  const predicted = predictedMatchScores(matches, teams, venues, model, probs)
  const groupResults: Record<string, { gh: number; ga: number }> = {}

  for (const m of groupMatches) {
    if (!m.home || !m.away) continue
    if (m.status === 'finished' && m.home.score != null && m.away.score != null) {
      groupResults[m.id] = { gh: m.home.score, ga: m.away.score }
    } else if (predicted[m.id]) {
      groupResults[m.id] = { gh: predicted[m.id].h, ga: predicted[m.id].a }
    }
  }

  const groups: Record<string, string[]> = {}
  for (const t of Object.values(teams)) {
    groups[t.group] ??= []
    groups[t.group].push(t.code)
  }

  const groupTables: Record<string, GroupRow[]> = {}
  for (const [g, codes] of Object.entries(groups)) {
    const rs = groupMatches
      .filter((m) => m.group === g && m.home && m.away && groupResults[m.id])
      .map((m) => {
        const r = groupResults[m.id]
        if (!m.home || !m.away) throw new Error('unreachable')
        return { h: m.home.code, a: m.away.code, gh: r.gh, ga: r.ga }
      })
    groupTables[g] = tableFor(codes, rs, rankOf)
  }

  return groupTablesToStandings(groupTables, rankOf)
}

/** keep finished real results; predict every other match from model odds */
export function predictedBracket(
  matches: Match[],
  teams: Record<string, Team>,
  venues: Record<string, Venue>,
  model: SimModel,
  probs: Record<string, MatchProbs>,
): PredictedBracket {
  const standings = predictedStandings(matches, teams, venues, model, probs)

  const groupTables: Record<string, GroupRow[]> = {}
  for (const [g, rows] of Object.entries(standings.groups)) {
    groupTables[g] = rows.map(({ rank: _rank, ...row }) => row)
  }

  const qualifiedThirds = new Set(standings.thirds.filter((t) => t.qualifies).map((t) => t.group))

  const ko = matches.filter((m) => m.stage !== 'group').sort((a, b) => a.n - b.n)
  const posOf = (g: string, idx: number) => groupTables[g]?.[idx]?.code
  const thirdSlots = ko
    .flatMap((m) => [m.phA, m.phB])
    .filter((ph): ph is string => !!ph && /^3[A-L]{2,}$/.test(ph))
  const assignment = assignThirds(
    thirdSlots.map((ph) => ph.slice(1).split('')),
    [...qualifiedThirds],
  )
  const thirdBySlot = new Map<string, string>()
  thirdSlots.forEach((ph, i) => {
    const g = assignment[i]
    if (g) thirdBySlot.set(ph, g)
  })

  const winners = new Map<number, string>()
  const losers = new Map<number, string>()
  const resolve = (ph: string | null): string | undefined => {
    if (!ph) return undefined
    let m = /^([1-4])([A-L])$/.exec(ph)
    if (m) return posOf(m[2], Number(m[1]) - 1)
    m = /^W(\d+)$/.exec(ph)
    if (m) return winners.get(Number(m[1]))
    m = /^(?:L|RU)(\d+)$/.exec(ph)
    if (m) return losers.get(Number(m[1]))
    if (/^3[A-L]{2,}$/.test(ph)) {
      const g = thirdBySlot.get(ph)
      return g ? posOf(g, 2) : undefined
    }
    return undefined
  }

  let champion: string | null = null
  for (const m of ko) {
    const home = m.home?.code ?? resolve(m.phA)
    const away = m.away?.code ?? resolve(m.phB)
    if (!home || !away) continue

    const official = realWinner(m)
    const win = official ?? predictKoWinner(m.id, probs, model, home, away, vCountry(m, venues))
    winners.set(m.n, win)
    losers.set(m.n, win === home ? away : home)
    if (m.stage === 'final') champion = win
  }

  const overlay: SlotOverlay = {}
  for (const m of ko) {
    const home = m.home?.code ?? resolve(m.phA)
    const away = m.away?.code ?? resolve(m.phB)
    if (home || away) {
      overlay[m.id] = {
        home: m.home ? undefined : home,
        away: m.away ? undefined : away,
      }
    }
  }

  return { overlay, winners, champion, groupTables, standings }
}
