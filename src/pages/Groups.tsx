import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Match, StandingRow } from '../types'
import { useI18n } from '../i18n'
import { useAppData, useData } from '../data/DataContext'
import { qualState, sortMatches } from '../utils/helpers'
import { predictedMatchScores, predictedStandings } from '../utils/bracketPredict'
import MatchCard from '../components/MatchCard'
import TeamName from '../components/TeamName'
import Icon from '../components/Icon'
import './groups.css'

function fmtGd(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function rowQualClass(state: ReturnType<typeof qualState>): string {
  if (state === 'through') return ' gp-tr-through'
  if (state === 'third') return ' gp-tr-third'
  if (state === 'out') return ' gp-tr-out'
  return ''
}

/** P W D L GF GA GD Pts header cells (shared by group + thirds tables) */
function NumHeads() {
  const { t } = useI18n()
  return (
    <>
      <th className="tnum">{t('colP')}</th>
      <th className="tnum gp-hxxs">{t('colW')}</th>
      <th className="tnum gp-hxxs">{t('colD')}</th>
      <th className="tnum gp-hxxs">{t('colL')}</th>
      <th className="tnum gp-hxs">{t('colGF')}</th>
      <th className="tnum gp-hxs">{t('colGA')}</th>
      <th className="tnum">{t('colGD')}</th>
      <th className="tnum">{t('colPts')}</th>
    </>
  )
}

function NumCells({ r }: { r: StandingRow }) {
  return (
    <>
      <td className="tnum">{r.p}</td>
      <td className="tnum gp-hxxs">{r.w}</td>
      <td className="tnum gp-hxxs">{r.d}</td>
      <td className="tnum gp-hxxs">{r.l}</td>
      <td className="tnum gp-hxs">{r.gf}</td>
      <td className="tnum gp-hxs">{r.ga}</td>
      <td className="tnum">{fmtGd(r.gd)}</td>
      <td className="tnum gp-pts">{r.pts}</td>
    </>
  )
}

/** render a tie-break string whose link span is delimited by [[...]] as text with
 * that span turned into a link to `to` (a Stats section); plain text if unmarked */
function renderLinked(text: string, to: string): ReactNode {
  const a = text.indexOf('[[')
  const b = text.indexOf(']]')
  if (a === -1 || b === -1 || b < a) return text
  return (
    <>
      {text.slice(0, a)}
      <Link className="gp-tb-link" to={to}>
        {text.slice(a + 2, b)}
      </Link>
      {text.slice(b + 2)}
    </>
  )
}

/** collapsible FIFA tie-breaking rules, shown at the bottom of the page */
function TieBreak() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <section className="gp-tb">
      <h2 className="gp-tb-title">
        <button
          type="button"
          className="gp-tb-btn"
          aria-expanded={open}
          aria-controls="gp-tb-body"
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="info" size={17} />
          <span>{t('tbTitle')}</span>
          <Icon name="back" size={15} className={`gp-chev${open ? ' open' : ''}`} />
        </button>
      </h2>
      {open && (
        <div id="gp-tb-body" className="gp-tb-body">
          <h3 className="gp-tb-h">{t('tbGroupTitle')}</h3>
          <p>{t('tbIntro')}</p>
          <ol className="gp-tb-list" type="a">
            <li>{t('tbA')}</li>
            <li>{t('tbB')}</li>
            <li>{t('tbC')}</li>
          </ol>
          <p>{t('tbReapply')}</p>
          <ol className="gp-tb-list" type="a" start={4}>
            <li>{t('tbD')}</li>
            <li>{t('tbE')}</li>
            <li>
              {renderLinked(t('tbF'), '/stats?fairplay=1')}
              <ul className="gp-tb-sub">
                <li>{t('tbFYellow')}</li>
                <li>{t('tbFIndirectRed')}</li>
                <li>{t('tbFDirectRed')}</li>
                <li>{t('tbFYellowRed')}</li>
              </ul>
            </li>
            <li>{renderLinked(t('tbG'), '/stats?ranking=1')}</li>
            <li>{t('tbH')}</li>
          </ol>
          <h3 className="gp-tb-h">{t('tbThirdsTitle')}</h3>
          <ol className="gp-tb-list">
            <li>{t('tbThirds1')}</li>
            <li>{t('tbThirds2')}</li>
            <li>{t('tbThirds3')}</li>
            <li>{renderLinked(t('tbThirds4'), '/stats?fairplay=1')}</li>
            <li>{renderLinked(t('tbThirds5'), '/stats?ranking=1')}</li>
            <li>{t('tbThirds6')}</li>
          </ol>
        </div>
      )}
    </section>
  )
}

export default function Groups() {
  const { t } = useI18n()
  const { standings: officialStandings, matches, teams, venues, probs } = useAppData()
  const { simModel, loadSimModel } = useData()
  useEffect(() => {
    loadSimModel()
  })
  const [predictMode, setPredictMode] = useState(false)
  const predicted = useMemo(() => {
    if (!simModel) return null
    return predictedStandings(matches, teams, venues, simModel, probs)
  }, [matches, teams, venues, simModel, probs])
  const predScores = useMemo(() => {
    if (!simModel) return null
    return predictedMatchScores(matches, teams, venues, simModel, probs)
  }, [matches, teams, venues, simModel, probs])
  const standings = predictMode && predicted ? predicted : officialStandings
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const letters = useMemo(() => Object.keys(standings.groups).sort(), [standings.groups])

  const fixturesByGroup = useMemo(() => {
    const map: Record<string, Match[]> = {}
    for (const m of matches) {
      if (m.stage === 'group' && m.group) {
        map[m.group] ??= []
        map[m.group].push(m)
      }
    }
    for (const g of Object.keys(map)) map[g] = sortMatches(map[g])
    return map
  }, [matches])

  const toggle = (g: string) => setOpen((o) => ({ ...o, [g]: !o[g] }))
  const scrollToGroup = (g: string) =>
    document.getElementById(`group-${g}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // deep link from a match/team page: #/groups?g=F scrolls to group F's card and
  // flashes it once the standings have loaded
  const [searchParams] = useSearchParams()
  const groupParam = searchParams.get('g')
  useEffect(() => {
    if (!groupParam || !letters.length) return
    const el = document.getElementById(`group-${groupParam}`)
    if (!el) return
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1800)
    })
    return () => cancelAnimationFrame(id)
  }, [groupParam, letters])

  return (
    <div>
      <div className="page-head gp-head-row">
        <h1>{t('groupsTitle')}</h1>
        <div className="gp-predict-ctrl">
          <button
            type="button"
            className={`btn${predictMode ? ' on' : ''}`}
            disabled={!simModel}
            onClick={() => setPredictMode((v) => !v)}
          >
            {predictMode ? t('bkPredictClear') : t('bkPredictFill')}
          </button>
          {predictMode && <p className="gp-predict-hint">{t('bkPredictHint')}</p>}
        </div>
      </div>

      <div className="gp-grid">
        {letters.map((g) => {
          const rows = standings.groups[g] ?? []
          const fixtures = fixturesByGroup[g] ?? []
          const isOpen = !!open[g]
          return (
            <section key={g} id={`group-${g}`} className={`card gp-card${predictMode ? ' gp-pred' : ''}`}>
              <header className="gp-head">
                <span className="gp-letter" aria-hidden="true">
                  {g}
                </span>
                <h2>{t('groupX', { x: g })}</h2>
              </header>

              <table className="gp-table" aria-label={t('groupX', { x: g })}>
                <thead>
                  <tr>
                    <th className="gp-rank" />
                    <th className="gp-team">{t('filterTeams')}</th>
                    <NumHeads />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.code}
                      className={`gp-tr${rowQualClass(qualState(standings, g, r.rank, r.code))}`}
                    >
                      <td className="gp-rank tnum">{r.rank}</td>
                      <td className="gp-team">
                        <TeamName code={r.code} flagSize={20} />
                      </td>
                      <NumCells r={r} />
                    </tr>
                  ))}
                </tbody>
              </table>

              {fixtures.length > 0 && (
                <>
                  <button
                    type="button"
                    className="gp-fixbtn"
                    aria-expanded={isOpen}
                    aria-controls={`gp-fix-${g}`}
                    onClick={() => toggle(g)}
                  >
                    <Icon name="calendar" size={15} />
                    {t('groupFixtures')}
                    <span className="chip tnum">{fixtures.length}</span>
                    <Icon name="back" size={15} className={`gp-chev${isOpen ? ' open' : ''}`} />
                  </button>
                  {isOpen && (
                    <div id={`gp-fix-${g}`} className="cards-grid gp-fix">
                      {fixtures.map((m) => (
                        <MatchCard
                          key={m.id}
                          match={m}
                          predScore={predictMode ? predScores?.[m.id] : undefined}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )
        })}
      </div>

      <div className="section-title">
        <h2>{t('thirdsTitle')}</h2>
      </div>
      <section className={`card gp-card gp-thirds${predictMode ? ' gp-pred' : ''}`}>
        <table className="gp-table" aria-label={t('thirdsTitle')}>
          <thead>
            <tr>
              <th className="gp-rank" />
              <th className="gp-gcol">{t('group')}</th>
              <th className="gp-team">{t('filterTeams')}</th>
              <NumHeads />
            </tr>
          </thead>
          <tbody>
            {standings.thirds.map((r, i) => (
              <tr
                key={r.code}
                className={
                  'gp-tr' +
                  (r.qualifies === true ? ' gp-tr-through' : r.qualifies === false ? ' gp-tr-out' : '') +
                  (i === 7 ? ' gp-cutline' : '')
                }
              >
                <td className="gp-rank tnum">{r.thirdRank}</td>
                <td className="gp-gcol">
                  <button
                    type="button"
                    className="gp-gbtn"
                    onClick={() => scrollToGroup(r.group)}
                    title={t('groupX', { x: r.group })}
                  >
                    {r.group}
                  </button>
                </td>
                <td className="gp-team">
                  <TeamName code={r.code} flagSize={20} />
                </td>
                <NumCells r={r} />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted gp-info">{t('thirdsInfo')}</p>
      </section>

      <div className="gp-legend small muted">
        <span>
          <i className="gp-dot gp-dot-q" />
          {t('legendQualified')}
        </span>
        <span>
          <i className="gp-dot gp-dot-t" />
          {t('legendThird')}
        </span>
        <span>
          <i className="gp-dot gp-dot-o" />
          {t('legendOut')}
        </span>
      </div>

      <TieBreak />
    </div>
  )
}
