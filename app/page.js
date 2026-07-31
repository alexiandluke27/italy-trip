'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSharedData, setSharedData } from '../lib/supabase'
import { DAYS, BOOKINGS, PACK, DOLOMITE_DAYS, EUR_USD, getCountdown, getTodayNum, DAY_SECTIONS } from '../lib/tripdata'

export const dynamic = 'force-dynamic'

const HERO_IMG = '/hero.jpg'

// Sunrise/sunset via local astronomy (works for any date, no API). Returns UTC hours.
function sunTimes(lat, lng, year, month, day, isRise, zenith = 90.833) {
  const RAD = Math.PI / 180, DEG = 180 / Math.PI
  const N1 = Math.floor(275 * month / 9), N2 = Math.floor((month + 9) / 12), N3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3)
  const N = N1 - N2 * N3 + day - 30
  const lngHour = lng / 15
  const t = isRise ? N + ((6 - lngHour) / 24) : N + ((18 - lngHour) / 24)
  const M = (0.9856 * t) - 3.289
  let L = M + (1.916 * Math.sin(M * RAD)) + (0.020 * Math.sin(2 * M * RAD)) + 282.634; L = ((L % 360) + 360) % 360
  let RA = DEG * Math.atan(0.91764 * Math.tan(L * RAD)); RA = ((RA % 360) + 360) % 360
  RA = RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90); RA = RA / 15
  const sinDec = 0.39782 * Math.sin(L * RAD), cosDec = Math.cos(Math.asin(sinDec))
  const cosH = (Math.cos(zenith * RAD) - (sinDec * Math.sin(lat * RAD))) / (cosDec * Math.cos(lat * RAD))
  if (cosH > 1 || cosH < -1) return null
  let H = isRise ? 360 - DEG * Math.acos(cosH) : DEG * Math.acos(cosH); H = H / 15
  const T = H + RA - (0.06571 * t) - 6.622
  let UT = T - lngHour
  return ((UT % 24) + 24) % 24
}
function fmtSun(utc, tz) {
  if (utc == null) return '—'
  let h = ((utc + tz) % 24 + 24) % 24
  let hr = Math.floor(h), mn = Math.round((h - hr) * 60)
  if (mn === 60) { mn = 0; hr = (hr + 1) % 24 }
  const ap = hr < 12 ? 'AM' : 'PM'; const h12 = hr % 12 || 12
  return `${h12}:${String(mn).padStart(2, '0')} ${ap}`
}

export default function App() {
  const [screen, setScreen] = useState('today')
  const [version, setVersion] = useState({})
  const [passes, setPasses] = useState([])
  const [packState, setPackState] = useState({})
  const [bookings, setBookings] = useState(BOOKINGS.map(b => ({...b})))
  const [openDay, setOpenDay] = useState(null)
  const [addPassOpen, setAddPassOpen] = useState(false)
  const [passLabel, setPassLabel] = useState('')
  const [passUrl, setPassUrl] = useState('')
  const [passDay, setPassDay] = useState('all')
  const [countdown, setCountdown] = useState(getCountdown())
  const [loading, setLoading] = useState(true)
  const daysScreenRef = useRef(null)
  // User-added activities, keyed by day num ({ '8/24': [{id,time,title,desc}] })
  const [activities, setActivities] = useState({})
  const [addActivityDay, setAddActivityDay] = useState(null)
  const [actTime, setActTime] = useState('')
  const [actTitle, setActTitle] = useState('')
  const [actDesc, setActDesc] = useState('')
  // Weather per day num (fetched live from Open-Meteo, °F)
  const [weather, setWeather] = useState({})
  const weatherReq = useRef({})

  // Tapping a day opens it as a full detail "page"; reset scroll to top on any
  // open/back navigation so you always start at the top.
  useEffect(() => {
    if (daysScreenRef.current) daysScreenRef.current.scrollTop = 0
  }, [openDay])

  // Load shared data from Supabase on mount
  useEffect(() => {
    async function load() {
      const [p, c, a] = await Promise.all([
        getSharedData('passes'),
        getSharedData('checklist'),
        getSharedData('activities'),
      ])
      if (p) setPasses(p)
      if (c) setBookings(BOOKINGS.map((b, i) => ({...b, done: c[i] ?? b.done})))
      if (a) setActivities(a)
      // Load local packing state
      try {
        const saved = localStorage.getItem('it_pack')
        if (saved) setPackState(JSON.parse(saved))
        const savedV = localStorage.getItem('it_version')
        if (savedV) setVersion(JSON.parse(savedV))
      } catch(e) {}
      setLoading(false)
    }
    load()
    // Countdown timer
    const timer = setInterval(() => setCountdown(getCountdown()), 60000)
    return () => clearInterval(timer)
  }, [])

  // Save passes to Supabase
  const savePasses = useCallback(async (newPasses) => {
    setPasses(newPasses)
    await setSharedData('passes', newPasses)
  }, [])

  // Save checklist to Supabase
  const saveChecklist = useCallback(async (newBookings) => {
    setBookings(newBookings)
    const state = newBookings.reduce((acc, b, i) => ({...acc, [i]: b.done}), {})
    await setSharedData('checklist', state)
  }, [])

  // Save pack to localStorage (personal)
  const savePack = useCallback((newState) => {
    setPackState(newState)
    try { localStorage.setItem('it_pack', JSON.stringify(newState)) } catch(e) {}
  }, [])

  // Save version to localStorage
  const saveVersion = useCallback((newV) => {
    setVersion(newV)
    try { localStorage.setItem('it_version', JSON.stringify(newV)) } catch(e) {}
  }, [])

  // Save activities to Supabase (shared across phones)
  const saveActivities = useCallback(async (next) => {
    setActivities(next)
    await setSharedData('activities', next)
  }, [])

  function openAddActivity(dayNum) {
    setActTime(''); setActTitle(''); setActDesc('')
    setAddActivityDay(dayNum)
  }

  async function saveActivity() {
    if (!actTitle.trim()) return alert('Add a name for the activity')
    const day = addActivityDay
    const item = { id: Date.now().toString(), time: actTime.trim(), title: actTitle.trim(), desc: actDesc.trim() }
    const next = { ...activities, [day]: [...(activities[day] || []), item] }
    await saveActivities(next)
    setAddActivityDay(null)
  }

  function deleteActivity(dayNum, id) {
    if (!confirm('Remove this activity?')) return
    const next = { ...activities, [dayNum]: (activities[dayNum] || []).filter(x => x.id !== id) }
    saveActivities(next)
  }

  const todayNum = getTodayNum()
  const today = todayNum ? DAYS.find(d => d.num === todayNum) : null

  // Fetch a day's forecast (°F) from Open-Meteo — live when within ~16 days,
  // otherwise marks it unavailable so we show a seasonal note.
  const loadWeather = useCallback((d) => {
    if (!d || !d.coords || weatherReq.current[d.num]) return
    const num = d.num
    weatherReq.current[num] = true
    setWeather(w => ({ ...w, [num]: { status: 'loading' } }))
    const [mm, dd] = num.split('/')
    const iso = `2026-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
    const [lat, lon] = d.coords
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&timezone=Europe%2FBerlin&start_date=${iso}&end_date=${iso}`
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(j => {
        const dl = j.daily
        if (!dl || !dl.time || !dl.time.length || dl.temperature_2m_max[0] == null) throw new Error()
        setWeather(w => ({ ...w, [num]: { status: 'ok', code: dl.weather_code[0], hi: Math.round(dl.temperature_2m_max[0]), lo: Math.round(dl.temperature_2m_min[0]), rain: dl.precipitation_probability_max[0] } }))
      })
      .catch(() => {
        weatherReq.current[num] = false
        setWeather(w => ({ ...w, [num]: { status: 'unavailable' } }))
      })
  }, [])

  useEffect(() => { if (openDay) loadWeather(DAYS.find(x => x.num === openDay)) }, [openDay, loadWeather])
  useEffect(() => { if (today) loadWeather(today) }, [today, loadWeather])

  function renderStep(s) {
    return (
      <div key={s.time + s.title} className="tl-item">
        <div className={`tl-dot ${s.dot || ''}`} style={s.opt ? {background:'transparent',border:'2px solid var(--orange)'} : undefined}></div>
        <div className="tl-time" style={s.opt ? {color:'var(--orange)'} : undefined}>{s.time}</div>
        <div className="tl-title">
          {s.opt && <span style={{fontSize:9.5,fontWeight:700,letterSpacing:'0.06em',color:'var(--orange)',background:'rgba(212,144,90,0.15)',padding:'2px 7px',borderRadius:20,marginRight:8,verticalAlign:'middle',whiteSpace:'nowrap'}}>＋ OPTIONAL</span>}
          {s.title}
          {s.badge && (
            <span style={{marginLeft:8,fontSize:10,fontWeight:600,letterSpacing:'0.04em',color:'var(--orange)',background:'rgba(212,144,90,0.15)',padding:'2px 7px',borderRadius:20,verticalAlign:'middle',whiteSpace:'nowrap'}}>⚡ {s.badge}</span>
          )}
        </div>
        {s.desc && <div className="tl-desc">{s.desc}</div>}
        {(s.map || (s.links && s.links.length > 0)) && (
          <div className="tl-links">
            {s.map && <a className="tl-link" href={s.map} target="_blank" rel="noreferrer">📍 Maps</a>}
            {s.links && s.links.map(l => (
              <a key={l.url} className={`tl-link ${l.kind === 'at' ? 'at' : l.kind === 'photo' ? 'photo' : ''}`} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
            ))}
          </div>
        )}
      </div>
    )
  }

  // A user-added activity — like a timeline step but with a delete button
  function renderCustomStep(s, dayNum) {
    return (
      <div key={s.id} className="tl-item">
        <div className="tl-dot" style={{background:'var(--purple)'}}></div>
        <div className="tl-time">{s.time || 'Anytime'}</div>
        <div className="tl-title" style={{display:'flex',alignItems:'flex-start',gap:8}}>
          <span style={{flex:1}}>{s.title}</span>
          <span onClick={() => deleteActivity(dayNum, s.id)} style={{color:'var(--muted)',cursor:'pointer',fontSize:15,lineHeight:1,padding:'0 2px'}}>✕</span>
        </div>
        {s.desc && <div className="tl-desc">{s.desc}</div>}
      </div>
    )
  }

  function renderElev(e) {
    if (!e) return null
    const max = Math.max(...e.bars)
    return (
      <div className="card" style={{marginBottom:12}}>
        <div className="card-hdr">
          <div className="card-title">Elevation profile</div>
          <span style={{fontSize:10,color:'var(--muted)'}}>{e.lo} → {e.hi}</span>
        </div>
        <div className="card-body">
          <div style={{display:'flex',alignItems:'flex-end',gap:3,height:48,marginBottom:6}}>
            {e.bars.map((v,i) => {
              const h = Math.round((v/max)*44)+4
              const col = v > max*0.75 ? '#e07070' : v > max*0.5 ? '#d4905a' : '#7fb89a'
              return <div key={i} style={{flex:1,height:h,background:col,borderRadius:'3px 3px 0 0',opacity:0.8}}></div>
            })}
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--muted)'}}>
            <span>Start</span><span>End</span>
          </div>
          <div className="elev-note" style={{marginTop:8}}>{e.note}</div>
        </div>
      </div>
    )
  }

  // Embedded route map for a day (no API key — uses Google's classic embed)
  function renderRouteMap(route) {
    if (!route || !route.stops || route.stops.length < 2) return null
    const enc = s => encodeURIComponent(s)
    const [first, ...rest] = route.stops
    const embedSrc = `https://maps.google.com/maps?saddr=${enc(first)}&daddr=${rest.map(enc).join('+to:')}&output=embed`
    const origin = enc(route.stops[0])
    const destination = enc(route.stops[route.stops.length - 1])
    const mid = route.stops.slice(1, -1).map(enc).join('%7C')
    const mode = route.mode || 'driving'
    let dirUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`
    if (mid) dirUrl += `&waypoints=${mid}`
    return (
      <div className="card" style={{marginBottom:12, overflow:'hidden'}}>
        <div className="card-hdr"><div className="card-title">🗺️ Route map</div></div>
        <div style={{width:'100%',height:210,background:'var(--surface2)'}}>
          <iframe title="Route map" src={embedSrc} style={{border:0,width:'100%',height:'100%',display:'block'}} loading="lazy" referrerPolicy="no-referrer-when-downgrade"></iframe>
        </div>
        <div style={{padding:'11px 14px'}}>
          {route.caption && <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.5,marginBottom:9}}>{route.caption}</div>}
          <a className="btn-ghost" href={dirUrl} target="_blank" rel="noreferrer" style={{display:'block',textAlign:'center',textDecoration:'none'}}>Open in Google Maps ↗</a>
        </div>
      </div>
    )
  }

  // "What to wear" card — dress-code level + clothes + shoes
  function renderAttire(a) {
    if (!a) return null
    const styles = {
      Casual:   {c:'var(--blue)',   bg:'rgba(122,171,204,0.15)'},
      Athletic: {c:'var(--orange)', bg:'rgba(212,144,90,0.15)'},
      Hiking:   {c:'var(--red)',    bg:'rgba(224,112,112,0.15)'},
    }
    const st = styles[a.level] || {c:'var(--muted)', bg:'var(--surface2)'}
    return (
      <div className="card" style={{marginBottom:12}}>
        <div className="card-hdr">
          <div className="card-title">👕 What to wear</div>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:st.c,background:st.bg,padding:'3px 9px',borderRadius:20}}>{a.level}</span>
        </div>
        <div className="card-body">
          <div style={{fontSize:12.5,color:'var(--muted)',lineHeight:1.55}}><strong style={{color:'var(--text)'}}>Clothes:</strong> {a.clothes}</div>
          <div style={{fontSize:12.5,color:'var(--muted)',lineHeight:1.55,marginTop:7}}><strong style={{color:'var(--text)'}}>Shoes:</strong> {a.shoes}</div>
        </div>
      </div>
    )
  }

  // Live weather card (°F) for a day, plus computed sunrise/sunset
  function renderWeather(day) {
    const num = day.num
    const w = weather[num]
    const [mm, dd] = num.split('/').map(Number)
    const [lat, lon] = day.coords
    const TZ = 2 // CEST — Italy/Switzerland during the trip
    const sunrise = fmtSun(sunTimes(lat, lon, 2026, mm, dd, true), TZ)
    const sunset = fmtSun(sunTimes(lat, lon, 2026, mm, dd, false), TZ)
    const WMO = {
      0:{i:'☀️',t:'Clear'},1:{i:'🌤️',t:'Mostly clear'},2:{i:'⛅',t:'Partly cloudy'},3:{i:'☁️',t:'Cloudy'},
      45:{i:'🌫️',t:'Fog'},48:{i:'🌫️',t:'Fog'},
      51:{i:'🌦️',t:'Light drizzle'},53:{i:'🌦️',t:'Drizzle'},55:{i:'🌦️',t:'Drizzle'},
      61:{i:'🌧️',t:'Light rain'},63:{i:'🌧️',t:'Rain'},65:{i:'🌧️',t:'Heavy rain'},
      71:{i:'🌨️',t:'Light snow'},73:{i:'🌨️',t:'Snow'},75:{i:'🌨️',t:'Heavy snow'},
      80:{i:'🌦️',t:'Rain showers'},81:{i:'🌦️',t:'Rain showers'},82:{i:'⛈️',t:'Heavy showers'},
      85:{i:'🌨️',t:'Snow showers'},86:{i:'🌨️',t:'Snow showers'},
      95:{i:'⛈️',t:'Thunderstorms'},96:{i:'⛈️',t:'Thunderstorms'},99:{i:'⛈️',t:'Thunderstorms'},
    }
    return (
      <div className="card" style={{marginBottom:12}}>
        <div className="card-hdr"><div className="card-title">🌤 Weather</div></div>
        <div className="card-body">
          {(!w || w.status === 'loading') && <div style={{fontSize:12,color:'var(--muted)'}}>Loading forecast…</div>}
          {w && w.status === 'ok' && (
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <div style={{fontSize:30,lineHeight:1}}>{(WMO[w.code]||{}).i || '🌡️'}</div>
              <div>
                <div style={{fontSize:14,color:'var(--text)'}}>{(WMO[w.code]||{}).t || 'See forecast'}</div>
                <div style={{fontSize:12,color:'var(--muted)',marginTop:3}}>High {w.hi}°F · Low {w.lo}°F · {w.rain}% chance of rain</div>
              </div>
            </div>
          )}
          {w && w.status === 'unavailable' && (
            <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.55}}>Live forecast shows up about 2 weeks before this date. Typical for the Dolomites in late August: mild days in the 60s–70s°F, chilly mornings (colder up high), and afternoon thunderstorms are common — a good reason to start hikes early.</div>
          )}
          <div style={{display:'flex',gap:18,marginTop:12,paddingTop:12,borderTop:'0.5px solid var(--border)',fontSize:12,color:'var(--muted)'}}>
            <span>🌅 Sunrise <strong style={{color:'var(--text)',fontWeight:500}}>{sunrise}</strong></span>
            <span>🌇 Sunset <strong style={{color:'var(--text)',fontWeight:500}}>{sunset}</strong></span>
          </div>
        </div>
      </div>
    )
  }

  function DayContent({day, inToday}) {
    const isDol = DOLOMITE_DAYS.includes(day.num)
    const hasV2 = day.v2 && day.v2.length > 0
    const showToggle = isDol && hasV2
    const v = version[day.num] || 'V1'
    const steps = (v === 'V2' && hasV2) ? day.v2 : day.v1
    const dayPasses = passes.filter(p => p.day === day.num || p.day === 'all')

    return (
      <div style={{padding: inToday ? '0 16px' : '0 16px 16px'}}>
        {!inToday && <div style={{fontSize:12,color:'var(--muted)',margin:'10px 0 4px'}}>📍 {day.hotel}</div>}
        {showToggle && (
          <div style={{margin:'10px 0 14px'}}>
            <div style={{display:'flex',gap:8}}>
              <div className={`sopt ${v==='V1'?'sel':''}`} style={{flex:1,cursor:'pointer',fontSize:12}}
                onClick={() => saveVersion({...version, [day.num]:'V1'})}>V1</div>
              <div className={`sopt ${v==='V2'?'sel':''}`} style={{flex:1,cursor:'pointer',fontSize:12}}
                onClick={() => saveVersion({...version, [day.num]:'V2'})}>⚡ V2</div>
            </div>
            {day.v2note && (
              <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.55,marginTop:8,padding:'9px 11px',background:'var(--surface2)',borderRadius:8}}>
                <strong style={{color:'var(--accent)'}}>V1</strong> is the easy-going plan · <strong style={{color:'var(--orange)'}}>⚡ V2</strong> is the ambitious one — {day.v2note}
              </div>
            )}
          </div>
        )}
        {day.cashWarn && <div className="warn-banner" style={{marginBottom:12}}>💵 Bring €100+ cash — Rifugio Locatelli is cash only, no signal.</div>}
        {day.hl && <div className="hl">{day.hl}</div>}
        {day.attire && renderAttire(day.attire)}
        {day.coords && renderWeather(day)}
        {day.route && renderRouteMap(day.route)}
        {isDol && renderElev(day.elev)}
        {(() => {
          const custom = activities[day.num] || []
          const hasSteps = steps.length > 0 || custom.length > 0
          return (
            <div className="card">
              <div className="card-hdr">
                <div className="card-title">Timeline</div>
                {showToggle && !inToday && <span style={{fontSize:11,color:'var(--muted)'}}>{v}</span>}
              </div>
              <div className="card-body">
                {hasSteps ? (
                  <div className="tl">
                    {steps.map(s => renderStep(s))}
                    {custom.map(s => renderCustomStep(s, day.num))}
                  </div>
                ) : (
                  <div style={{textAlign:'center',padding:'14px 8px 18px'}}>
                    <div style={{fontSize:22,marginBottom:6}}>🗓️</div>
                    <div style={{fontSize:13,color:'var(--text)',marginBottom:4}}>Nothing planned yet</div>
                    <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.5}}>Add your own plans below — they’re shared across all your phones.</div>
                  </div>
                )}
                <button className="btn-ghost" style={{width:'100%',marginTop:14}} onClick={() => openAddActivity(day.num)}>+ Add activity</button>
              </div>
            </div>
          )
        })()}
        {day.alltrails && (
          <div className="card" style={{marginTop:10}}>
            <div className="card-hdr"><div className="card-title">AllTrails</div></div>
            <div className="card-body">
              {day.alltrails.map(a => (
                <div key={a.name} style={{marginBottom:8}}>
                  <a className="tl-link at" href={a.url} target="_blank" rel="noreferrer" style={{display:'inline-flex'}}>🥾 {a.name}</a>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{a.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {dayPasses.length > 0 && (
          <div className="card" style={{marginTop:10}}>
            <div className="card-hdr"><div className="card-title">🎫 Passes for this day</div></div>
            <div className="card-body" style={{padding:'4px 16px'}}>
              {dayPasses.map(p => (
                <div key={p.id} className="pass-row" onClick={() => window.open(p.url,'_blank')} style={{cursor:'pointer'}}>
                  <div className="pass-icon">🎫</div>
                  <div className="pass-info">
                    <div className="pass-label">{p.label}</div>
                    <div className="pass-open">Open pass →</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── TODAY SCREEN ───────────────────────────────────────────────────────────
  function TodayScreen() {
    if (!today) {
      return (
        <div>
          <div style={{position:'relative',height:260,overflow:'hidden'}}>
            <img src={HERO_IMG} alt="Dolomites" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>e.target.style.display='none'} />
            <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(13,14,13,0.15) 0%,rgba(13,14,13,0.9) 100%)'}}></div>
            <div style={{position:'absolute',bottom:0,left:0,right:0,padding:20}}>
              <div style={{fontSize:10,letterSpacing:'0.12em',color:'rgba(237,233,227,0.55)',textTransform:'uppercase',marginBottom:4}}>Italy + Switzerland · Aug 21 – Sep 6</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:'#ede9e3',lineHeight:1.1,marginBottom:14}}>Your <em style={{color:'#c9a96e'}}>adventure</em> awaits</div>
              <div style={{display:'flex',gap:8}}>
                {[{v:countdown.days,l:'Days'},{v:countdown.hours,l:'Hrs'},{v:countdown.mins,l:'Min'}].map(u=>(
                  <div key={u.l} style={{textAlign:'center',background:'rgba(255,255,255,0.1)',border:'0.5px solid rgba(255,255,255,0.15)',borderRadius:10,padding:'8px 12px',minWidth:56,backdropFilter:'blur(8px)'}}>
                    <div style={{fontFamily:"'DM Serif Display',serif",fontSize:26,color:'#ede9e3',lineHeight:1}}>{u.v}</div>
                    <div style={{fontSize:9,color:'rgba(237,233,227,0.5)',letterSpacing:'0.08em',textTransform:'uppercase',marginTop:2}}>{u.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{padding:'16px 16px 0'}}>
            <div className="card" style={{marginBottom:12}}>
              <div className="card-hdr"><div className="card-title">Trip overview</div></div>
              <div className="card-body">
                <div style={{fontSize:13,lineHeight:2.2,color:'var(--muted)'}}>
                  🚗 <strong style={{color:'var(--text)'}}>Aug 21</strong> — Drive Austin → Houston<br/>
                  ✈️ <strong style={{color:'var(--text)'}}>Aug 22</strong> — Fly Houston → Frankfurt<br/>
                  🛬 <strong style={{color:'var(--text)'}}>Aug 23</strong> — 12:00 PM · Land in Milan and head to Como<br/>
                  🌊 <strong style={{color:'var(--text)'}}>Aug 24 & 25</strong> — Chill in Lake Como<br/>
                  🏔 <strong style={{color:'var(--text)'}}>Aug 26</strong> — Head to the Dolomites around noon → Ortisei<br/>
                  🥾 <strong style={{color:'var(--text)'}}>Aug 27</strong> — Ortisei<br/>
                  🚗 <strong style={{color:'var(--text)'}}>Aug 28</strong> — Drive to Cortina<br/>
                  🥾 <strong style={{color:'var(--text)'}}>Aug 29 & 30</strong> — Cortina<br/>
                  🌊 <strong style={{color:'var(--text)'}}>Aug 31</strong> — Drive back to Como · goodbye Dolomites, hello Como!<br/>
                  🇨🇭 <strong style={{color:'var(--text)'}}>Sep 1</strong> — Head to Switzerland. Sabina's in charge.<br/>
                  ⛳ <strong style={{color:'var(--text)'}}>Sep 2–4</strong> — Omega European Masters<br/>
                  ✈️ <strong style={{color:'var(--text)'}}>Sep 5</strong> — Bye Europe! Train to Milan and fly home<br/>
                  🏠 <strong style={{color:'var(--text)'}}>Sep 6</strong> — Drive Houston → Austin
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-body">
                <div style={{fontSize:13,color:'var(--muted)',lineHeight:1.6}}>
                  Use <strong style={{color:'var(--text)'}}>Days</strong> to see the full itinerary · <strong style={{color:'var(--text)'}}>Passes</strong> for tickets · <strong style={{color:'var(--text)'}}>Info</strong> for bookings
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    const isDol = DOLOMITE_DAYS.includes(today.num)
    const hasV2 = today.v2 && today.v2.length > 0
    const v = version[today.num] || 'V1'
    const vbadge = (isDol && hasV2) ? (
      <span style={{fontSize:11,padding:'3px 8px',borderRadius:20,background:v==='V1'?'rgba(127,184,154,0.2)':'rgba(212,144,90,0.2)',color:v==='V1'?'var(--green)':'var(--orange)',marginLeft:8}}>
        {v==='V1'?'V1':'⚡ V2'}
      </span>
    ) : null

    return (
      <div>
        <div style={{position:'relative',height:200,overflow:'hidden'}}>
          <img src={HERO_IMG} alt="Dolomites" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>e.target.style.display='none'} />
          <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(13,14,13,0.15) 0%,rgba(13,14,13,0.9) 100%)'}}></div>
          <div style={{position:'absolute',bottom:0,left:0,right:0,padding:20}}>
            <div style={{fontSize:10,letterSpacing:'0.12em',color:'rgba(237,233,227,0.55)',textTransform:'uppercase',marginBottom:4}}>{today.date}</div>
            <div style={{display:'flex',alignItems:'center'}}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:24,color:'#ede9e3',lineHeight:1.1}}>{today.name}</div>
              {vbadge}
            </div>
          </div>
        </div>
        <div style={{padding:'12px 16px 0',fontSize:12,color:'var(--muted)'}}>📍 {today.hotel}</div>
        <DayContent day={today} inToday={true} />
      </div>
    )
  }

  // ── DAYS SCREEN ────────────────────────────────────────────────────────────
  function DaysScreen() {
    const active = openDay ? DAYS.find(d => d.num === openDay) : null

    // Detail "page" for a single day
    if (active) {
      const idx = DAYS.findIndex(d => d.num === active.num)
      const prevDay = idx > 0 ? DAYS[idx - 1] : null
      const nextDay = idx >= 0 && idx < DAYS.length - 1 ? DAYS[idx + 1] : null
      const navLink = {display:'flex',alignItems:'center',gap:6,fontSize:14,color:'var(--accent)',cursor:'pointer',minWidth:64}
      return (
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'52px 20px 8px'}}>
            {prevDay
              ? <div style={navLink} onClick={() => setOpenDay(prevDay.num)}>‹ {prevDay.num}</div>
              : <div style={{minWidth:64}} />}
            <div style={{fontSize:12,color:'var(--muted)',cursor:'pointer',textAlign:'center'}} onClick={() => setOpenDay(null)}>All days</div>
            {nextDay
              ? <div style={{...navLink, justifyContent:'flex-end'}} onClick={() => setOpenDay(nextDay.num)}>{nextDay.num} ›</div>
              : <div style={{minWidth:64}} />}
          </div>
          <div style={{padding:'0 20px 8px'}}>
            <div style={{fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--muted)',marginBottom:4}}>{active.date}</div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:26,color:'var(--text)',lineHeight:1.15}}>
              <span style={{color:'var(--accent)'}}>{active.num}</span> · {active.name}
            </div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:8}}>
              {active.tags.map(t => <span key={t.l} className={`dtag dtag-${t.c}`}>{t.l}</span>)}
            </div>
          </div>
          <DayContent day={active} inToday={false} />
        </div>
      )
    }

    // List of all days
    return (
      <div>
        <div className="hdr">
          <div className="hdr-eye">Aug 21 – Sep 6, 2026</div>
          <div className="hdr-title">All <em>Days</em></div>
        </div>
        {DAY_SECTIONS.map(section => {
          const sectionDays = DAYS.filter(d => section.nums.includes(d.num))
          if (!sectionDays.length) return null
          return (
            <div key={section.label}>
              <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--muted)',padding:'14px 16px 6px'}}>{section.label}</div>
              <div style={{background:'var(--surface)',borderRadius:16,margin:'0 16px 8px',overflow:'hidden'}}>
                {sectionDays.map(d => {
                  const tags = d.tags.map(t => (
                    <span key={t.l} className={`dtag dtag-${t.c}`}>{t.l}</span>
                  ))
                  return (
                    <div key={d.num} style={{borderBottom:'0.5px solid var(--border)'}}>
                      <div
                        onClick={() => setOpenDay(d.num)}
                        style={{display:'flex',gap:14,alignItems:'flex-start',padding:'14px 16px',cursor:'pointer'}}
                      >
                        <div style={{fontSize:15,fontWeight:600,color:'var(--accent)',minWidth:42,lineHeight:1.2,marginTop:2}}>{d.num}</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:500,color:'var(--text)',marginBottom:2}}>{d.name}</div>
                          <div style={{fontSize:12,color:'var(--muted)',marginBottom:6}}>{d.date}</div>
                          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{tags}</div>
                        </div>
                        <div style={{color:'var(--muted)',fontSize:18,marginTop:8}}>›</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── PASSES SCREEN ──────────────────────────────────────────────────────────
  function PassesScreen() {
    const allDates = ['all','8/21','8/22','8/23','8/24','8/25','8/26','8/27','8/28','8/29','8/30','8/31','9/1','9/2','9/3','9/4','9/5','9/6']
    const dateLabels = ['All','8/21','8/22','8/23','8/24','8/25','8/26','8/27','8/28','8/29','8/30','8/31','9/1','9/2','9/3','9/4','9/5','9/6']
    const [filter, setFilter] = useState('all')
    const filtered = filter === 'all' ? passes : passes.filter(p => p.day === filter || p.day === 'all')

    async function addPass() {
      if (!passLabel) return alert('Add a name for this pass')
      if (!passUrl) return alert('Paste the Google Drive link')
      const newPass = {id: Date.now().toString(), label: passLabel, day: passDay, url: passUrl}
      await savePasses([...passes, newPass])
      setPassLabel(''); setPassUrl(''); setPassDay('all'); setAddPassOpen(false)
    }

    async function deletePass(id) {
      if (!confirm('Remove this pass?')) return
      await savePasses(passes.filter(p => p.id !== id))
    }

    return (
      <div>
        <div className="hdr">
          <div className="hdr-eye">Tickets · passes · confirmations</div>
          <div className="hdr-title"><em>Passes</em> wallet</div>
        </div>
        <div style={{padding:'0 16px 12px',display:'flex',gap:6,flexWrap:'wrap',overflowX:'auto'}}>
          {dateLabels.map((label,i) => {
            const val = allDates[i]
            const sel = filter === val
            return (
              <button key={val} onClick={() => setFilter(val)} style={{padding:'6px 12px',borderRadius:20,border:`0.5px solid ${sel?'var(--accent)':'var(--border)'}`,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-sans)',background:sel?'var(--accent)':'transparent',color:sel?'#1a1410':'var(--muted)'}}>
                {label}
              </button>
            )
          })}
        </div>
        <div className="card">
          <div className="card-body">
            {filtered.length === 0 && <div style={{fontSize:13,color:'var(--muted)',padding:'8px 0'}}>No passes yet — add your first one below</div>}
            {filtered.map(p => (
              <div key={p.id} className="pass-row" style={{cursor:'pointer'}}>
                <div className="pass-icon" onClick={() => window.open(p.url,'_blank')}>🎫</div>
                <div className="pass-info" onClick={() => window.open(p.url,'_blank')}>
                  <div className="pass-label">{p.label}</div>
                  <div className="pass-day">{p.day === 'all' ? 'All days' : p.day}</div>
                  <div className="pass-open">Open pass →</div>
                </div>
                <div className="pass-del-btn" onClick={() => deletePass(p.id)}>✕</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{padding:'0 16px'}}>
          <button className="btn-pri" onClick={() => setAddPassOpen(true)}>+ Add pass or ticket</button>
          <div style={{fontSize:11,color:'var(--muted)',textAlign:'center',marginTop:10,lineHeight:1.5}}>
            Upload tickets to Google Drive, paste the share link here.<br/>Shared across all phones instantly.
          </div>
        </div>

        {addPassOpen && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:400,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&setAddPassOpen(false)}>
            <div style={{background:'var(--surface)',borderRadius:'24px 24px 0 0',width:'100%',maxWidth:430,padding:'24px 20px 40px'}}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:16}}>Add pass</div>
              <div className="fg">
                <label className="fl">Name</label>
                <input className="fi" type="text" placeholder='e.g. "Seceda gondola ticket"' value={passLabel} onChange={e=>setPassLabel(e.target.value)} />
              </div>
              <div className="fg">
                <label className="fl">Google Drive link</label>
                <input className="fi" type="url" placeholder="https://drive.google.com/..." value={passUrl} onChange={e=>setPassUrl(e.target.value)} />
              </div>
              <div className="fg">
                <label className="fl">Which day?</label>
                <select className="fi" value={passDay} onChange={e=>setPassDay(e.target.value)}>
                  <option value="all">All days</option>
                  {['8/21','8/22','8/23','8/24','8/25','8/26','8/27','8/28','8/29','8/30','8/31','9/1','9/2','9/3','9/4','9/5','9/6'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn-ghost" style={{flex:1}} onClick={()=>setAddPassOpen(false)}>Cancel</button>
                <button className="btn-pri" style={{flex:2,marginTop:0}} onClick={addPass}>Save pass</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── INFO SCREEN ────────────────────────────────────────────────────────────
  function InfoScreen() {
    const done = bookings.filter(b=>b.done).length
    const pct = Math.round(done/bookings.length*100)

    return (
      <div>
        <div className="hdr">
          <div className="hdr-eye">Everything you need</div>
          <div className="hdr-title">Trip <em>Info</em></div>
        </div>
        <div style={{padding:'0 16px'}}>
          <span className="slabel">Weather by elevation</span>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
            {[
              {loc:'Valley',elev:'~1,200m',temp:'20–28°C',note:'Warm. Hotel level.'},
              {loc:'Trail mid',elev:'~2,000m',temp:'14–20°C',note:'Cool. Midlayer.'},
              {loc:'Summit',elev:'2,300–2,500m',temp:'8–14°C',note:'Cold + wind.'},
            ].map(w => (
              <div key={w.loc} style={{background:'var(--surface2)',borderRadius:12,padding:'11px 9px'}}>
                <div style={{fontSize:10,color:'var(--muted)'}}>{w.loc}</div>
                <div style={{fontSize:10,color:'var(--accent)',marginBottom:5}}>{w.elev}</div>
                <div style={{fontSize:15,fontWeight:600}}>{w.temp}</div>
                <div style={{fontSize:10,color:'var(--muted)',lineHeight:1.4,marginTop:3}}>{w.note}</div>
              </div>
            ))}
          </div>
          <div className="warn-banner" style={{margin:'0 0 12px'}}>⚡ Thunderstorms 2–5pm daily in August. Start every hike by 8am. Off exposed ridges by 1pm.</div>

          <span className="slabel">Booking checklist</span>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div style={{flex:1,height:3,background:'var(--surface2)',borderRadius:3,overflow:'hidden'}}>
              <div style={{height:'100%',background:'var(--green)',borderRadius:3,width:`${pct}%`,transition:'width 0.3s'}}></div>
            </div>
            <span style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap'}}>{done}/{bookings.length} done</span>
          </div>
          <div className="card" style={{marginBottom:4}}>
            <div className="card-body">
              {bookings.map((b,i) => (
                <div key={i} className="chk-item" onClick={() => {
                  const updated = bookings.map((x,j) => j===i ? {...x,done:!x.done} : x)
                  saveChecklist(updated)
                }}>
                  <div className={`chk-box ${b.done?'chkd':''}`}></div>
                  <div>
                    <div className={`chk-ttl ${b.done?'done':''}`}>{b.t}</div>
                    <div className="chk-due">{b.due} · {b.s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <span className="slabel">Key contacts</span>
          <div className="card">
            <div className="card-body">
              {[
                ['Casa al Sole (nights 1–2)','tel:+390471796437','+39 0471 796437'],
                ['Hotel Tofana (nights 3–5)','tel:+390436808030','+39 0436 808030'],
                ['Seceda cable car','tel:+390471796531','+39 0471 796531'],
                ['Snow Service e-bikes','tel:+390436862467','+39 0436 862467'],
                ['Emergency (Italy)','tel:112','112'],
                ['Mountain rescue','tel:118','118'],
              ].map(([label, href, display]) => (
                <div key={label} className="info-row">
                  <div className="info-lbl">{label}</div>
                  <div className="info-val"><a href={href} style={{color:'var(--blue)'}}>{display}</a></div>
                </div>
              ))}
            </div>
          </div>

          <span className="slabel">Reminders</span>
          <div className="card">
            <div className="card-body">
              {[
                ['Cash','€150+ always. Rifugios cash only.'],
                ['AllTrails','Download on WiFi. No signal above 2,000m.'],
                ['Trekking poles','Rent Day 1 evening — Intersport Ortisei ~€12/day'],
                ['EUR/USD today',`€1 = $${EUR_USD}`],
              ].map(([label, val]) => (
                <div key={label} className="info-row">
                  <div className="info-lbl">{label}</div>
                  <div className="info-val">{val}</div>
                </div>
              ))}
            </div>
          </div>

          <span className="slabel">Packing list</span>
          {PACK.map(cat => (
            <div key={cat.cat}>
              <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--muted)',margin:'10px 0 4px'}}>{cat.cat}</div>
              <div className="card" style={{marginBottom:8}}>
                <div className="card-body">
                  {cat.items.map(item => (
                    <div key={item} className="pack-item" onClick={() => {
                      const newState = {...packState, [item]: !packState[item]}
                      savePack(newState)
                    }}>
                      <div className={`pack-box ${packState[item]?'chk':''}`}></div>
                      <div className={`pack-txt ${packState[item]?'done':''}`}>{item}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:24,color:'var(--accent)'}}>✦</div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="screen" style={{display: screen==='today' ? 'block' : 'none'}}>
        <TodayScreen />
      </div>
      <div ref={daysScreenRef} className="screen" style={{display: screen==='days' ? 'block' : 'none'}}>
        <DaysScreen />
      </div>
      <div className="screen" style={{display: screen==='passes' ? 'block' : 'none'}}>
        <PassesScreen />
      </div>
      <div className="screen" style={{display: screen==='info' ? 'block' : 'none'}}>
        <InfoScreen />
      </div>

      <nav className="nav">
        {[
          {id:'today', icon:'◈', label:'TODAY'},
          {id:'days', icon:'☷', label:'DAYS'},
          {id:'passes', icon:'🎫', label:'PASSES'},
          {id:'info', icon:'◎', label:'INFO'},
        ].map(item => (
          <div key={item.id} className={`nav-item ${screen===item.id?'active':''}`} onClick={() => setScreen(item.id)}>
            <div className="nav-icon">{item.icon}</div>
            {item.label}
          </div>
        ))}
      </nav>

      {addActivityDay && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:400,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={e=>e.target===e.currentTarget&&setAddActivityDay(null)}>
          <div style={{background:'var(--surface)',borderRadius:'24px 24px 0 0',width:'100%',maxWidth:430,padding:'24px 20px 40px'}}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:16}}>Add activity · {addActivityDay}</div>
            <div className="fg">
              <label className="fl">Time (optional)</label>
              <input className="fi" type="text" placeholder="e.g. 2:00 PM or Afternoon" value={actTime} onChange={e=>setActTime(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Activity</label>
              <input className="fi" type="text" placeholder="e.g. Ferry to Bellagio" value={actTitle} onChange={e=>setActTitle(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Notes (optional)</label>
              <input className="fi" type="text" placeholder="Any details" value={actDesc} onChange={e=>setActDesc(e.target.value)} />
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn-ghost" style={{flex:1}} onClick={()=>setAddActivityDay(null)}>Cancel</button>
              <button className="btn-pri" style={{flex:2,marginTop:0}} onClick={saveActivity}>Save activity</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
