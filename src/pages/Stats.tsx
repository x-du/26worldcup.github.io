import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { fmtCalendarDate } from '../utils/time'
import TeamName from '../components/TeamName'
import Flag from '../components/Flag'
import './stats.css'

// official FIFA ranking the app freezes to (see scripts/curated/fifa-ranking.json)
const RANKING_DATE = '2026-06-11'

export default function Stats() {
  const { t, locale } = useI18n()
  const { matches, teams, stats } = useAppData()

  // deep links from the group-stage tie-breaking criteria: ?ranking=1 / ?fairplay=1
  // scroll to the matching section and flash it once
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const target = searchParams.get('ranking')
      ? 'sx-fifa-ranking'
      : searchParams.get('fairplay')
        ? 'sx-fair-play'
        : null
    if (!target) return
    const el = document.getElementById(target)
    if (!el) return
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1800)
    })
    return () => cancelAnimationFrame(id)
  }, [searchParams])

  // fair-play (team conduct) score table: group-stage by default, toggleable to all
  const [fpMode, setFpMode] = useState<'group' | 'all'>('group')
  const fpScores = stats.fairPlay?.[fpMode] ?? {}
  // most deductions first (most negative), like the cards table; cleanest teams last
  const fairPlayRows = Object.values(teams)
    .map((tm) => ({ code: tm.code, group: tm.group, score: fpScores[tm.code] ?? 0 }))
    .sort((a, b) => a.score - b.score || a.code.localeCompare(b.code))

  const finished = matches.filter((m) => m.status === 'finished')
  const liveCount = matches.filter((m) => m.status === 'live').length
  const goals = finished.reduce((sum, m) => sum + (m.home?.score ?? 0) + (m.away?.score ?? 0), 0)
  // average goals per finished match, 1 decimal, Latin digits in every locale
  const goalsAvg = finished.length > 0 ? (goals / finished.length).toFixed(1) : null

  // top scorers with tie-aware ranks
  const scorers = stats.scorers.slice().sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
  let prevGoals = -1
  let prevRank = 0
  const rankedScorers = scorers.map((s, i) => {
    const rank = s.goals === prevGoals ? prevRank : i + 1
    prevGoals = s.goals
    prevRank = rank
    return { ...s, rank }
  })

  // all 48 teams by FIFA ranking, unranked last
  const ranked = Object.values(teams)
    .slice()
    .sort(
      (a, b) =>
        (a.ranking ?? Number.MAX_SAFE_INTEGER) - (b.ranking ?? Number.MAX_SAFE_INTEGER) ||
        a.code.localeCompare(b.code),
    )

  return (
    <div>
      <div className="page-head">
        <h1>{t('statsTitle')}</h1>
      </div>

      <div className="sx-summary">
        <div className="card sx-stat">
          <div className="sx-num tnum">{finished.length}</div>
          <div className="sx-lbl">{t('matchesPlayed')}</div>
        </div>
        <div className="card sx-stat">
          <div className="sx-num tnum">{goals}</div>
          <div className="sx-lbl">{t('statGoals')}</div>
        </div>
        {goalsAvg !== null && (
          <div className="card sx-stat">
            <div className="sx-num tnum">{goalsAvg}</div>
            <div className="sx-lbl">{t('statGoalsAvg')}</div>
          </div>
        )}
        {(stats.cards?.yellow ?? 0) > 0 && (
          <div className="card sx-stat">
            <div className="sx-num tnum">🟨 {stats.cards?.yellow}</div>
            <div className="sx-lbl">{t('statYellowCards')}</div>
          </div>
        )}
        {(stats.cards?.red ?? 0) > 0 && (
          <div className="card sx-stat">
            <div className="sx-num tnum">🟥 {stats.cards?.red}</div>
            <div className="sx-lbl">{t('statRedCards')}</div>
          </div>
        )}
        {stats.biggestWin && (
          <Link
            to={stats.biggestWin.id ? `/match/${stats.biggestWin.id}` : '/'}
            className="card sx-stat sx-stat-link"
          >
            <div className="sx-num tnum sx-num-sm">
              <Flag team={teams[stats.biggestWin.h]} size={22} /> {stats.biggestWin.hs}–{stats.biggestWin.as}{' '}
              <Flag team={teams[stats.biggestWin.a]} size={22} />
            </div>
            <div className="sx-lbl">{t('statBiggestWin')}</div>
          </Link>
        )}
        {stats.fastestGoal && (
          <Link
            to={stats.fastestGoal.id ? `/match/${stats.fastestGoal.id}` : '/'}
            className="card sx-stat sx-stat-link"
          >
            <div className="sx-num tnum sx-num-sm">
              {stats.fastestGoal.sec != null
                ? `${Math.floor(stats.fastestGoal.sec / 60)}:${String(stats.fastestGoal.sec % 60).padStart(2, '0')}`
                : stats.fastestGoal.minute}{' '}
              {stats.fastestGoal.name}
            </div>
            <div className="sx-lbl">{t('statFastestGoal')}</div>
          </Link>
        )}
        {stats.upset && (
          <Link to={`/match/${stats.upset.id}`} className="card sx-stat sx-stat-link">
            <div className="sx-num tnum sx-num-sm">
              <Flag team={teams[stats.upset.h]} size={22} /> {stats.upset.hs}–{stats.upset.as}{' '}
              <Flag team={teams[stats.upset.a]} size={22} />{' '}
              <span title={t('upsetFavOdds')}>
                (<s>{stats.upset.p}%</s>)
              </span>
            </div>
            <div className="sx-lbl">{t('statUpset')}</div>
          </Link>
        )}
        {liveCount > 0 && (
          <div className="card sx-stat sx-live">
            <div className="sx-num tnum">{liveCount}</div>
            <div className="sx-lbl">
              <span className="sx-live-dot" />
              {t('liveNow')}
            </div>
          </div>
        )}
      </div>

      <div className="sx-cols">
        <section className="card card-pad sx-card">
          <h2>{t('topScorers')}</h2>
          {rankedScorers.length === 0 ? (
            <div className="empty">{t('noStatsYet')}</div>
          ) : (
            <table className="sx-table">
              <thead>
                <tr>
                  <th />
                  <th />
                  <th />
                  <th className="sx-goals-h">{t('goals')}</th>
                </tr>
              </thead>
              <tbody>
                {rankedScorers.map((s) => {
                  const team = teams[s.code]
                  return (
                    <tr key={s.id}>
                      <td className="sx-pos tnum">{s.rank}</td>
                      <td className="sx-player">
                        {team && s.no != null ? (
                          <Link className="sx-pname" to={`/team/${s.code}?p=${s.no}`}>
                            {s.name}
                          </Link>
                        ) : (
                          s.name
                        )}
                      </td>
                      <td className="sx-team-cell">
                        {team ? (
                          <Link to={`/team/${s.code}`} className="team-inline sx-team">
                            <Flag team={team} size={20} />
                            <span className="nm">{s.code}</span>
                          </Link>
                        ) : (
                          <span className="muted small">{s.code}</span>
                        )}
                      </td>
                      <td className="sx-goals tnum">{s.goals}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {(stats.cards?.players.length ?? 0) > 0 && (
          <section className="card card-pad sx-card">
            <h2>{t('statCards')}</h2>
            <table className="sx-table">
              <thead>
                <tr>
                  <th />
                  <th />
                  <th className="sx-goals-h">🟨</th>
                  <th className="sx-goals-h">🟥</th>
                </tr>
              </thead>
              <tbody>
                {(stats.cards?.players ?? []).map((c) => {
                  const team = teams[c.code]
                  const label = c.staff ? t('statTeamOfficial') : c.name
                  return (
                    <tr key={c.staff ? `staff-${c.code}` : c.id}>
                      <td className="sx-player">
                        {team && c.no != null && !c.staff ? (
                          <Link className="sx-pname" to={`/team/${c.code}?p=${c.no}`}>
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                      </td>
                      <td className="sx-team-cell">
                        {team ? (
                          <Link to={`/team/${c.code}`} className="team-inline sx-team">
                            <Flag team={team} size={20} />
                            <span className="nm">{c.code}</span>
                          </Link>
                        ) : (
                          <span className="muted small">{c.code}</span>
                        )}
                      </td>
                      <td className="sx-goals tnum">{c.y || ''}</td>
                      <td className="sx-goals tnum">{c.r || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {(stats.cards?.playerCount ?? stats.cards?.players.length ?? 0) > 20 && (
              <p className="small muted sx-cards-note">
                {t('statCardsNote', {
                  shown: stats.cards?.players.length ?? 20,
                  total: stats.cards?.playerCount ?? stats.cards?.players.length ?? 20,
                })}
              </p>
            )}
          </section>
        )}

        <section id="sx-fifa-ranking" className="card card-pad sx-card">
          <h2>
            {t('fifaRanking')} <span className="sx-rank-date">({fmtCalendarDate(RANKING_DATE, locale)})</span>
          </h2>
          <div className="sx-rank-list">
            {ranked.map((team) => (
              <div key={team.code} className="sx-rank-row">
                <span className="sx-rank-no tnum">{team.ranking ?? t('none')}</span>
                <TeamName code={team.code} flagSize={20} className="sx-rank-team" />
                <span className="chip" title={t('groupX', { x: team.group })}>
                  {team.group}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section id="sx-fair-play" className="card card-pad sx-card">
          <div className="sx-fp-head">
            <h2>{t('fairPlay')}</h2>
            <div className="sx-fp-toggle" role="group" aria-label={t('fairPlay')}>
              <button
                type="button"
                className={fpMode === 'group' ? 'on' : ''}
                aria-pressed={fpMode === 'group'}
                onClick={() => setFpMode('group')}
              >
                {t('stageGroup')}
              </button>
              <button
                type="button"
                className={fpMode === 'all' ? 'on' : ''}
                aria-pressed={fpMode === 'all'}
                onClick={() => setFpMode('all')}
              >
                {t('all')}
              </button>
            </div>
          </div>
          <div className="sx-rank-list">
            {fairPlayRows.map((row) => (
              <div key={row.code} className="sx-rank-row">
                <span className="sx-rank-no tnum">{row.score}</span>
                <TeamName code={row.code} flagSize={20} className="sx-rank-team" />
                <span className="chip" title={t('groupX', { x: row.group })}>
                  {row.group}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
