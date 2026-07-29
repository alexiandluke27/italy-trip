'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSharedData, setSharedData } from '../lib/supabase'
import { DAYS, BOOKINGS, PACK, DOLOMITE_DAYS, EUR_USD, getCountdown, getTodayNum, DAY_SECTIONS } from '../lib/tripdata'

export const dynamic = 'force-dynamic'

const HERO_IMG = '/hero.jpg'

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
  const dayRefs = useRef({})

  // When a day is opened on the Days tab, scroll its header to the top so you
  // always start reading from the beginning of that day (collapsing the
  // previously-open day above otherwise shifts the list and lands you mid-day).
  function toggleDay(num) {
    const willOpen = openDay !== num
    setOpenDay(willOpen ? num : null)
    if (willOpen) {
      setTimeout(() => {
        dayRefs.current[num]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }

  // Load shared data from Supabase on mount
  useEffect(() => {
    async function load() {
      const [p, c] = await Promise.all([
        getSharedData('passes'),
        getSharedData('checklist'),
      ])
      if (p) setPasses(p)
      if (c) setBookings(BOOKINGS.map((b, i) => ({...b, done: c[i] ?? b.done})))
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

  const todayNum = getTodayNum()
  const today = todayNum ? DAYS.find(d => d.num === todayNum) : null

  function renderStep(s) {
    return (
      <div key={s.time + s.title} className="tl-item">
        <div className={`tl-dot ${s.dot || ''}`}></div>
        <div className="tl-time">{s.time}</div>
        <div className="tl-title">{s.title}</div>
        {s.desc && <div className="tl-desc">{s.desc}</div>}
        {s.map && (
          <div className="tl-links">
            <a className="tl-link" href={s.map} target="_blank" rel="noreferrer">📍 Maps</a>
          </div>
        )}
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
          <div style={{display:'flex',gap:8,margin:'10px 0 14px'}}>
            <div className={`sopt ${v==='V1'?'sel':''}`} style={{flex:1,cursor:'pointer',fontSize:12}}
              onClick={() => saveVersion({...version, [day.num]:'V1'})}>V1</div>
            <div className={`sopt ${v==='V2'?'sel':''}`} style={{flex:1,cursor:'pointer',fontSize:12}}
              onClick={() => saveVersion({...version, [day.num]:'V2'})}>⚡ V2</div>
          </div>
        )}
        {day.cashWarn && <div className="warn-banner" style={{marginBottom:12}}>💵 Bring €100+ cash — Rifugio Locatelli is cash only, no signal.</div>}
        {day.hl && <div className="hl">{day.hl}</div>}
        {isDol && renderElev(day.elev)}
        <div className="card">
          <div className="card-hdr">
            <div className="card-title">Timeline</div>
            {showToggle && !inToday && <span style={{fontSize:11,color:'var(--muted)'}}>{v}</span>}
          </div>
          <div className="card-body">
            <div className="tl">{steps.map(s => renderStep(s))}</div>
          </div>
        </div>
        {day.photos && day.photos.length > 0 && (
          <div className="card" style={{marginTop:10}}>
            <div className="card-hdr"><div className="card-title">📷 Photo spots</div></div>
            <div className="card-body">
              {day.photos.map(p => (
                <div key={p.name} className="photo-spot">
                  <div className="photo-icon">📍</div>
                  <div><div className="photo-name">{p.name}</div><div className="photo-tip">{p.tip}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}
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
                    <div className="pass-open">Open in Google Drive →</div>
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
                  const isOpen = openDay === d.num
                  const tags = d.tags.map(t => (
                    <span key={t.l} className={`dtag dtag-${t.c}`}>{t.l}</span>
                  ))
                  return (
                    <div key={d.num} ref={el => { dayRefs.current[d.num] = el }} style={{borderBottom:'0.5px solid var(--border)',scrollMarginTop:96}}>
                      <div
                        onClick={() => toggleDay(d.num)}
                        style={{display:'flex',gap:14,alignItems:'flex-start',padding:'14px 16px',cursor:'pointer'}}
                      >
                        <div style={{fontSize:15,fontWeight:600,color:'var(--accent)',minWidth:42,lineHeight:1.2,marginTop:2}}>{d.num}</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:500,color:'var(--text)',marginBottom:2}}>{d.name}</div>
                          <div style={{fontSize:12,color:'var(--muted)',marginBottom:6}}>{d.date}</div>
                          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{tags}</div>
                        </div>
                        <div style={{color:'var(--muted)',fontSize:18,marginTop:8,transition:'transform 0.2s',transform:isOpen?'rotate(90deg)':'rotate(0deg)'}}>›</div>
                      </div>
                      {isOpen && (
                        <div style={{borderTop:'0.5px solid var(--border)'}}>
                          <DayContent day={d} inToday={false} />
                        </div>
                      )}
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
                  <div className="pass-open">Open in Google Drive →</div>
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
      <div className="screen" style={{display: screen==='days' ? 'block' : 'none'}}>
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
    </div>
  )
}
