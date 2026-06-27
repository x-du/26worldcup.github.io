import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Match, MatchSide, Stage } from '../types'
import { useI18n } from '../i18n'
import { useSettings } from '../settings/SettingsContext'
import { useAppData, useData } from '../data/DataContext'
import { displayTz, fmtDate, fmtTime } from '../utils/time'
import { placeholderLabel, STAGE_LABEL_KEY } from '../utils/helpers'
import { resolvedSlots } from '../utils/bracketResolve'
import { predictedBracket } from '../utils/bracketPredict'
import Flag from '../components/Flag'
import Trophy from '../components/Trophy'
import TeamName from '../components/TeamName'
import './bracket.css'

/** rounds of one bracket half, root first: [sf ×1, qf ×2, r16 ×4, r32 ×8] */
type Half = (Match | null)[][]

const HEAD_COLS: { col: number; stage: Stage }[] = [
  { col: 1, stage: 'r32' },
  { col: 2, stage: 'r16' },
  { col: 3, stage: 'qf' },
  { col: 4, stage: 'sf' },
  { col: 5, stage: 'final' },
  { col: 6, stage: 'sf' },
  { col: 7, stage: 'qf' },
  { col: 8, stage: 'r16' },
  { col: 9, stage: 'r32' },
]

/** winner/loser of a side once the match is finished (null while undecided) */
function outcome(
  m: Match,
  side: MatchSide | null,
  other: MatchSide | null,
  predWinner?: string,
): 'w' | 'l' | null {
  if (predWinner && side && other) {
    if (predWinner === side.code) return 'w'
    if (predWinner === other.code) return 'l'
  }
  if (m.status !== 'finished' || !side || !other) return null
  if (m.winner) {
    if (m.winner === side.code) return 'w'
    if (m.winner === other.code) return 'l'
  }
  const s = side.score ?? 0
  const o = other.score ?? 0
  if (s !== o) return s > o ? 'w' : 'l'
  const sp = side.pen ?? 0
  const op = other.pen ?? 0
  if (sp !== op) return sp > op ? 'w' : 'l'
  return null
}

/** compact placeholder label for the tight bracket nodes (full text goes in title=) */
function compactPlaceholder(
  ph: string,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  const win = /^W(\d+)$/.exec(ph)
  if (win) return t('bracketWinnerOf', { n: win[1] })
  const ru = /^RU(\d+)$/.exec(ph)
  if (ru) return t('bracketLoserOf', { n: ru[1] })
  const third = /^3([A-L]+)$/.exec(ph)
  if (third) return t('bracketThird', { x: third[1].split('').join('/') })
  return placeholderLabel(ph, t)
}

function BkRow({
  m,
  side,
  other,
  ph,
  flagSize,
  resolved,
  predWinner,
}: {
  m: Match
  side: MatchSide | null
  other: MatchSide | null
  ph: string | null
  flagSize: number
  resolved?: string
  predWinner?: string
}) {
  const { t, pick } = useI18n()
  const { teams } = useAppData()
  // a slot can be mathematically decided (group complete) before the data
  // feed assigns the team — render the resolved team, scoreless
  const code = side?.code ?? resolved
  const team = code ? (teams[code] ?? null) : null
  const label = team && code ? pick(team.name, code) : ph ? compactPlaceholder(ph, t) : t('tbd')
  const title = team && code ? label : ph ? placeholderLabel(ph, t) : t('tbd')
  const out = outcome(m, side, other, predWinner)
  const cls = out === 'w' ? ' bk-win' : out === 'l' ? ' bk-lose' : ''
  return (
    <div className={`bk-row${cls}`} title={title}>
      <Flag team={team} size={flagSize} />
      <span className={`bk-nm${team ? '' : ' bk-tbd'}`}>{label}</span>
      {team && <span className="bk-code tnum">{code}</span>}
      {(m.status === 'finished' || m.status === 'live') && side && (
        <span className="bk-score tnum">
          {side.score ?? '–'}
          {(m.home?.pen ?? 0) + (m.away?.pen ?? 0) > 0 && (
            <small className="bk-pen"> ({side.pen ?? 0})</small>
          )}
        </span>
      )}
    </div>
  )
}

function BkNode({
  m,
  big = false,
  overlay,
  predWinner,
  predicted = false,
}: {
  m: Match
  big?: boolean
  overlay?: { home?: string; away?: string }
  predWinner?: string
  predicted?: boolean
}) {
  const { t, locale } = useI18n()
  const { settings } = useSettings()
  const { venues } = useAppData()
  const venue = m.venueId ? (venues[m.venueId] ?? null) : null
  const tz = displayTz(settings, venue)
  return (
    <Link
      to={`/match/${m.id}`}
      className={`bk-node${big ? ' bk-big' : ''}${m.status === 'live' ? ' bk-on' : ''}${predicted ? ' bk-pred' : ''}`}
    >
      {big && (
        <div className="bk-final-head">
          <span className="bk-cup" aria-hidden="true">
            <Trophy size={16} />
          </span>
          {t(STAGE_LABEL_KEY.final)}
        </div>
      )}
      <div className="bk-meta">
        <span className="bk-n tnum" title={t('matchN', { n: m.n })}>
          {m.n}
        </span>
        {m.status === 'live' ? (
          <span className="bk-live-tag">{t('statusLive')}</span>
        ) : m.status === 'finished' ? (
          <span className="bk-when">{t('statusFinished')}</span>
        ) : m.status === 'postponed' ? (
          <span className="bk-when">{t('statusPostponed')}</span>
        ) : (
          <span className="bk-when tnum">
            {fmtDate(m.date, locale, tz)} · {fmtTime(m.date, locale, tz)}
          </span>
        )}
      </div>
      <BkRow
        m={m}
        side={m.home}
        other={m.away}
        ph={m.phA}
        flagSize={big ? 22 : 18}
        resolved={overlay?.home}
        predWinner={predWinner}
      />
      <BkRow
        m={m}
        side={m.away}
        other={m.home}
        ph={m.phB}
        flagSize={big ? 22 : 18}
        resolved={overlay?.away}
        predWinner={predWinner}
      />
    </Link>
  )
}

export default function Bracket() {
  const { t, locale } = useI18n()
  const { settings } = useSettings()
  const { matches, venues, teams, standings, probs } = useAppData()
  const { simModel, loadSimModel } = useData()
  useEffect(() => {
    loadSimModel()
  })
  const [predictMode, setPredictMode] = useState(false)
  const officialOverlay = useMemo(() => resolvedSlots(matches, standings), [matches, standings])
  const predicted = useMemo(() => {
    if (!simModel) return null
    return predictedBracket(matches, teams, venues, simModel, probs)
  }, [matches, teams, venues, simModel, probs])
  const overlay = predictMode && predicted ? predicted.overlay : officialOverlay
  const predWinners = predictMode && predicted ? predicted.winners : undefined
  // remembered across visits (narrow-screen half-tree view)
  const [half, setHalfState] = useState<'l' | 'r'>(() => {
    try {
      return localStorage.getItem('wc2026-bracket-half') === 'r' ? 'r' : 'l'
    } catch {
      return 'l'
    }
  })
  const setHalf = (h: 'l' | 'r') => {
    setHalfState(h)
    try {
      localStorage.setItem('wc2026-bracket-half', h)
    } catch {
      /* blocked storage */
    }
  }

  const bk = useMemo(() => {
    const ko = matches.filter((m) => m.stage !== 'group')
    const byN = new Map<number, Match>()
    for (const m of ko) byN.set(m.n, m)
    const stageOf = (s: Stage) => ko.filter((m) => m.stage === s).sort((a, b) => a.n - b.n)

    const final = stageOf('final')[0] ?? null
    const third = stageOf('third')[0] ?? null

    /** resolve a 'W89'-style placeholder to the match it points at */
    const feeder = (m: Match | null, ph: 'phA' | 'phB'): Match | null => {
      const p = m ? m[ph] : null
      if (p && /^W\d+$/.test(p)) return byN.get(Number(p.slice(1))) ?? null
      return null
    }
    /** walk the W-links downward from a semi-final root */
    const expand = (root: Match | null): Half => {
      const rounds: Half = [[root]]
      for (let i = 0; i < 3; i++) {
        rounds.push(rounds[i].flatMap((m) => [feeder(m, 'phA'), feeder(m, 'phB')]))
      }
      return rounds
    }
    let left = expand(feeder(final, 'phA'))
    let right = expand(feeder(final, 'phB'))

    // positional fallback if any W-link cannot be resolved from the data
    const complete = (h: Half) => h.every((round) => round.every(Boolean))
    if (!complete(left) || !complete(right)) {
      const sf = stageOf('sf')
      const qf = stageOf('qf')
      const r16 = stageOf('r16')
      const r32 = stageOf('r32')
      const pad = (a: Match[], from: number, len: number): (Match | null)[] =>
        Array.from({ length: len }, (_, i) => a[from + i] ?? null)
      left = [pad(sf, 0, 1), pad(qf, 0, 2), pad(r16, 0, 4), pad(r32, 0, 8)]
      right = [pad(sf, 1, 1), pad(qf, 2, 2), pad(r16, 4, 4), pad(r32, 8, 8)]
    }

    const ranges: Partial<Record<Stage, [Match, Match]>> = {}
    for (const s of ['r32', 'r16', 'qf', 'sf', 'third', 'final'] as Stage[]) {
      const ms = stageOf(s).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      if (ms.length) ranges[s] = [ms[0], ms[ms.length - 1]]
    }

    return { left, right, final, third, ranges }
  }, [matches])

  const championCode = useMemo(() => {
    const f = bk.final
    if (predictMode && predicted?.champion) return predicted.champion
    if (f?.status !== 'finished') return null
    if (f.winner) return f.winner
    const o = outcome(f, f.home, f.away)
    if (o === 'w' && f.home) return f.home.code
    if (o === 'l' && f.away) return f.away.code
    return null
  }, [bk.final, predictMode, predicted])

  const fmtRange = (r?: [Match, Match]): string => {
    if (!r) return t('none')
    const f = (m: Match) =>
      fmtDate(m.date, locale, displayTz(settings, m.venueId ? (venues[m.venueId] ?? null) : null))
    const a = f(r[0])
    const b = f(r[1])
    return a === b ? a : `${a} – ${b}`
  }

  /** grid cells of one half; columns converge toward the centre (col 5) */
  const halfCells = (rounds: Half, side: 'l' | 'r'): ReactNode[] => {
    const cols = side === 'l' ? [4, 3, 2, 1] : [6, 7, 8, 9]
    const roundCls = ['bk-rd-sf', 'bk-rd-qf', 'bk-rd-r16', 'bk-rd-r32'] // root first
    const cells: ReactNode[] = []
    rounds.forEach((round, ri) => {
      const span = 8 / round.length
      round.forEach((m, i) => {
        const feed = round.length === 1 ? 'bk-mid' : i % 2 === 0 ? 'bk-top' : 'bk-bot'
        const join = ri < 3 ? ' bk-join' : ''
        cells.push(
          <div
            key={`${side}${ri}-${i}`}
            className={`bk-cell bk-${side} ${roundCls[ri]} ${feed}${join}`}
            style={{ gridColumn: cols[ri], gridRow: `${2 + i * span} / span ${span}` }}
          >
            {m ? (
              <BkNode
                m={m}
                overlay={overlay[m.id]}
                predWinner={predWinners?.get(m.n)}
                predicted={predictMode}
              />
            ) : (
              <div className="bk-ghost" />
            )}
          </div>,
        )
      })
    })
    return cells
  }

  return (
    <div className="bk-page">
      <div className="page-head bk-head-row">
        <h1>{t('bracketTitle')}</h1>
        <div className="bk-predict-ctrl">
          <button
            type="button"
            className={`btn${predictMode ? ' on' : ''}`}
            disabled={!simModel}
            onClick={() => setPredictMode((v) => !v)}
          >
            {predictMode ? t('bkPredictClear') : t('bkPredictFill')}
          </button>
          {predictMode && <p className="bk-predict-hint">{t('bkPredictHint')}</p>}
        </div>
      </div>

      <div className="bk-wrap">
        {/* narrow screens show one half of the tree at a time */}
        <div className="seg bk-half-seg">
          <button type="button" className={half === 'l' ? 'on' : ''} onClick={() => setHalf('l')}>
            {t('bkHalfL')}
          </button>
          <button type="button" className={half === 'r' ? 'on' : ''} onClick={() => setHalf('r')}>
            {t('bkHalfR')}
          </button>
        </div>
        <div className={`bk-grid bk-m-${half}`}>
          {HEAD_COLS.map(({ col, stage }) => (
            <div key={col} className="bk-head" style={{ gridColumn: col, gridRow: 1 }}>
              <div className="bk-head-stage">{t(STAGE_LABEL_KEY[stage])}</div>
              <div className="bk-head-dates tnum">{fmtRange(bk.ranges[stage])}</div>
            </div>
          ))}

          {/* narrow screens stack the rounds vertically under these headings */}
          {(['r32', 'r16', 'qf', 'sf'] as Stage[]).map((s) => (
            <div key={`mh-${s}`} className={`bk-mhead bk-mhead-${s}`}>
              <span className="bk-head-stage">{t(STAGE_LABEL_KEY[s])}</span>
              <span className="bk-head-dates tnum">{fmtRange(bk.ranges[s])}</span>
            </div>
          ))}

          {halfCells(bk.left, 'l')}
          {halfCells(bk.right, 'r')}

          <div className="bk-cell bk-center" style={{ gridColumn: 5, gridRow: '2 / span 8' }}>
            <div className="bk-center-top">
              {championCode && (
                <div className="bk-champion">
                  <span className="bk-champ-cup" aria-hidden="true">
                    <Trophy size={26} />
                  </span>
                  <span className="bk-champ-label">{t('champion')}</span>
                  <TeamName code={championCode} bold flagSize={26} />
                </div>
              )}
            </div>
            <div className="bk-center-mid">
              {bk.final ? (
                <BkNode
                  m={bk.final}
                  big
                  overlay={overlay[bk.final.id]}
                  predWinner={predWinners?.get(bk.final.n)}
                  predicted={predictMode}
                />
              ) : (
                <div className="bk-ghost" />
              )}
            </div>
            <div className="bk-center-bottom">
              {bk.third && (
                <div className="bk-third">
                  <div className="bk-third-label">{t(STAGE_LABEL_KEY.third)}</div>
                  <BkNode
                    m={bk.third}
                    overlay={overlay[bk.third.id]}
                    predWinner={predWinners?.get(bk.third.n)}
                    predicted={predictMode}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bk-mobile-center">
          {championCode && (
            <div className="bk-champion">
              <span className="bk-champ-cup" aria-hidden="true">
                <Trophy size={26} />
              </span>
              <span className="bk-champ-label">{t('champion')}</span>
              <TeamName code={championCode} bold flagSize={26} />
            </div>
          )}
          {bk.final && (
            <BkNode
              m={bk.final}
              big
              overlay={overlay[bk.final.id]}
              predWinner={predWinners?.get(bk.final.n)}
              predicted={predictMode}
            />
          )}
          {bk.third && (
            <div className="bk-third">
              <div className="bk-third-label">{t(STAGE_LABEL_KEY.third)}</div>
              <BkNode
                m={bk.third}
                overlay={overlay[bk.third.id]}
                predWinner={predWinners?.get(bk.third.n)}
                predicted={predictMode}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
