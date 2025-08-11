import { useEffect } from 'react'
import { audio } from '../audio/AudioManager'
import MandalaBackground from './MandalaBackground'

type MainMenuProps = {
  onStart: () => void
}

export default function MainMenu({ onStart }: MainMenuProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        onStart()
      }
      if (e.code === 'KeyM') audio.toggleMute()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onStart])

  return (
    <div
      style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}
      onClick={onStart}
      onMouseDown={() => audio.init()}
    >
      <MandalaBackground />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          zIndex: 2,
        }}
      >
        <div
          style={{
            textAlign: 'center',
            color: '#eaffff',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto',
            background: 'rgba(5, 10, 20, 0.45)',
            border: '1px solid rgba(255,255,255,0.22)',
            borderRadius: 14,
            padding: '22px 26px 18px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          <div
            style={{
              fontSize: 54,
              fontWeight: 800,
              marginBottom: 10,
              textShadow: '0 2px 12px rgba(0,0,0,0.85)',
            }}
          >
            Hyper Wizard
          </div>
          <div
            style={{
              fontSize: 16,
              opacity: 0.95,
              marginBottom: 24,
              textShadow: '0 2px 10px rgba(0,0,0,0.85)',
            }}
          >
            Collect orbs, defeat foes, transcend the level.
          </div>
          <button
            style={{
              fontSize: 18,
              padding: '12px 18px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.12)',
              color: '#eaffff',
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(0,0,0,0.35), 0 0 18px rgba(0, 200, 255, 0.22) inset',
              textShadow: '0 2px 10px rgba(0,0,0,0.7)',
            }}
            onClick={onStart}
          >
            Start Game (Enter)
          </button>
          <div
            style={{
              fontSize: 13,
              opacity: 0.95,
              marginTop: 18,
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            Move: ← →  | Jump: SPACE | Run: SHIFT/X | Dev: T | Mute: M
          </div>
        </div>
      </div>
    </div>
  )
}


