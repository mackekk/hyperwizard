import { useEffect, useRef } from 'react'

export default function MandalaBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const drawAvgMsRef = useRef<number>(0)
  const frameCountRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function resize(): void {
      const scale = window.devicePixelRatio || 1
      ;(canvas as HTMLCanvasElement).width = Math.floor(window.innerWidth * scale)
      ;(canvas as HTMLCanvasElement).height = Math.floor(window.innerHeight * scale)
      ;(canvas as HTMLCanvasElement).style.width = `${window.innerWidth}px`
      ;(canvas as HTMLCanvasElement).style.height = `${window.innerHeight}px`
      ;(ctx as CanvasRenderingContext2D).setTransform(scale, 0, 0, scale, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    const t0 = performance.now()
    const draw = (now: number) => {
      const t = (now - t0) / 1000
      const width = (canvas as HTMLCanvasElement).clientWidth
      const height = (canvas as HTMLCanvasElement).clientHeight
      const cxFloat = width / 2 + (mouseRef.current.x - width / 2) * 0.02
      const cyFloat = height / 2 + (mouseRef.current.y - height / 2) * 0.02
      // Snap center to half pixels to reduce subpixel shimmering
      const cx = Math.round(cxFloat) + 0.5
      const cy = Math.round(cyFloat) + 0.5

      // Background gradient
      const h1 = (t * 40) % 360
      const h2 = (h1 + 120) % 360
      const g = (ctx as CanvasRenderingContext2D).createLinearGradient(0, 0, 0, height)
      g.addColorStop(0, `hsl(${h1},95%,55%)`)
      g.addColorStop(1, `hsl(${h2},95%,12%)`)
      ;(ctx as CanvasRenderingContext2D).fillStyle = g
      ;(ctx as CanvasRenderingContext2D).fillRect(0, 0, width, height)

      // Morphing mandala (adaptive quality to avoid jank)
      const avg = drawAvgMsRef.current || 0
      // Target ~60fps: lower quality if we go above ~11 ms
      const quality = avg > 12 ? 0.7 : avg > 9 ? 0.85 : 1
      ;(ctx as CanvasRenderingContext2D).save()
      ;(ctx as CanvasRenderingContext2D).globalCompositeOperation = 'lighter'
      ;(ctx as CanvasRenderingContext2D).globalAlpha = 0.95
      const baseR = Math.min(width, height) * 0.12
      const layerBase = 7
      const layers = Math.max(4, Math.round(layerBase * quality))
      for (let i = 0; i < layers; i += 1) {
        const layerT = t * (0.5 + i * 0.08)
        // Keep petal count stable per layer to avoid popping/flicker
        const petals = 8 + i * 2
        const rotation = layerT * 0.2 * (i % 2 === 0 ? 1 : -1)
        const r1 = baseR + i * baseR * 0.55
        const r2 = r1 + baseR * (0.35 + 0.15 * Math.sin(layerT + i))
        const hue = (h1 + i * 20 + Math.sin(layerT * 1.3) * 30) % 360
        ;(ctx as CanvasRenderingContext2D).strokeStyle = `hsla(${hue},100%,65%,0.65)`
        const depth = layers > 1 ? i / (layers - 1) : 1
        ;(ctx as CanvasRenderingContext2D).fillStyle = `hsla(${(hue + 40) % 360},100%,60%,${0.16 * quality * depth})`
        ;(ctx as CanvasRenderingContext2D).lineWidth = 1.5
        for (let p = 0; p < petals; p += 1) {
          const a0 = (p / petals) * Math.PI * 2 + rotation
          const a1 = a0 + (Math.PI * 2) / petals / 2
          const a2 = a0 + (Math.PI * 2) / petals
          const x0 = cx + Math.cos(a0) * r1
          const y0 = cy + Math.sin(a0) * r1
          const x1 = cx + Math.cos(a1) * r2
          const y1 = cy + Math.sin(a1) * r2
          const x2 = cx + Math.cos(a2) * r1
          const y2 = cy + Math.sin(a2) * r1
          ;(ctx as CanvasRenderingContext2D).beginPath()
          ;(ctx as CanvasRenderingContext2D).moveTo(x0, y0)
          ;(ctx as CanvasRenderingContext2D).lineTo(x1, y1)
          ;(ctx as CanvasRenderingContext2D).lineTo(x2, y2)
          ;(ctx as CanvasRenderingContext2D).closePath()
          ;(ctx as CanvasRenderingContext2D).fill()
          ;(ctx as CanvasRenderingContext2D).stroke()
        }
        // Accent ring
        ;(ctx as CanvasRenderingContext2D).beginPath()
        ;(ctx as CanvasRenderingContext2D).arc(cx, cy, r2 + 6, 0, Math.PI * 2)
        ;(ctx as CanvasRenderingContext2D).stroke()
      }
      ;(ctx as CanvasRenderingContext2D).restore()

      // Update draw-time EMA for adaptive quality
      const end = performance.now()
      const frameMs = end - now
      const fc = (frameCountRef.current = (frameCountRef.current + 1) % 100000)
      if (fc === 1) {
        drawAvgMsRef.current = frameMs
      } else {
        drawAvgMsRef.current = drawAvgMsRef.current * 0.9 + frameMs * 0.1
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    // Throttle mouse updates to once per animation frame to avoid GC churn
    let mouseQueued = false
    const onMove = (e: MouseEvent) => {
      if (mouseQueued) return
      mouseQueued = true
      requestAnimationFrame(() => {
        mouseRef.current.x = e.clientX
        mouseRef.current.y = e.clientY
        mouseQueued = false
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove as any)
    }
  }, [])

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
}


