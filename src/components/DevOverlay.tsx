import { useEffect, useRef, useState } from 'react'

type DevActions = {
  toggleFlight: () => void
  grantFlight: () => void
  revokeFlight: () => void
  killAllEnemies: () => void
  collectAllOrbs?: () => void
  restart?: () => void
}

type DevInfo = {
  canFly: boolean
  enemiesAlive: number
  orbsCollected: number
  totalOrbs: number
}

type DevOverlayProps = {
  getInfo: () => DevInfo
  actions: DevActions
}

export default function DevOverlay({ getInfo, actions }: DevOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [tick, setTick] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyT') {
        e.preventDefault()
        setVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Small ticker so info updates even if parent doesn’t re-render often
  useEffect(() => {
    if (!visible) return
    const loop = () => {
      setTick((t) => (t + 1) % 100000)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [visible])

  if (!visible) return null

  const info = getInfo()

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 10000,
        background: 'rgba(10, 10, 20, 0.9)',
        color: '#eaffff',
        padding: '12px 12px 10px 12px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.15)',
        minWidth: 280,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>DEV MODE (press T to close)</div>
      <div style={{ fontSize: 13, lineHeight: '18px', marginBottom: 8 }}>
        <div>Flight: {info.canFly ? 'ON' : 'OFF'}</div>
        <div>Enemies alive: {info.enemiesAlive}</div>
        <div>Orbs: {info.orbsCollected} / {info.totalOrbs}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button onClick={actions.toggleFlight} style={btn}>Toggle Flight</button>
        <button onClick={actions.killAllEnemies} style={btn}>Kill All Foes</button>
        <button onClick={actions.grantFlight} style={btn}>Grant Flight</button>
        <button onClick={actions.revokeFlight} style={btn}>Revoke Flight</button>
        {actions.collectAllOrbs && (
          <button onClick={actions.collectAllOrbs} style={btn}>Collect All Orbs</button>
        )}
        {actions.restart && (
          <button onClick={actions.restart} style={btn}>Restart</button>
        )}
      </div>
    </div>
  )
}

const btn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  color: '#eaffff',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 6,
  padding: '6px 8px',
  cursor: 'pointer',
}


