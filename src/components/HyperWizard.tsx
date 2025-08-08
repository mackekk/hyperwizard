import { useEffect, useRef } from 'react'

type KeyboardInputs = {
  moveLeft: boolean
  moveRight: boolean
  jump: boolean
  run: boolean
  attack: boolean
  restart: boolean
}

type PlayerState = {
  positionX: number
  positionY: number
  velocityX: number
  velocityY: number
  width: number
  height: number
  isOnGround: boolean
}

type Level = {
  tiles: number[][]
  tileSize: number
}

// Tile codes and helpers
const T_EMPTY = 0
const T_GROUND = 1 // solid
const T_BLOCK = 2 // solid
const T_SPIKE = 3 // hurts
const T_FLAG = 4 // win portal (non-solid)

function isSolidTile(tile: number): boolean {
  return tile === T_GROUND || tile === T_BLOCK
}

type Orb = { x: number; y: number; radius: number; collected: boolean }
type Enemy = {
  x: number
  y: number
  width: number
  height: number
  velocityX: number
  velocityY: number
  alive: boolean
  phase: number
  type: 'TRICK' | 'HYPER'
}

const TRAIL_MAX = 20

function hsl(h: number, s: number, l: number, a = 1): string {
  const hue = ((h % 360) + 360) % 360
  return `hsla(${hue}, ${s}%, ${l}%, ${a})`
}

const STREAK_COUNT = 30 // Known safe baseline per Instructions.md
const TARGET_FPS = 60
const FRAME_DURATION_MS = 1000 / TARGET_FPS

function createBaselineLevel(): Level {
  const tileSize = 32
  const rows = 16
  const cols = 240

  const tiles: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(T_EMPTY))

  // Base ground with occasional pits
  for (let x = 0; x < cols; x += 1) {
    const pit = (x % 37 === 30 || x % 53 === 45) && x > 15 && x < cols - 20
    if (!pit) {
      tiles[rows - 1][x] = T_GROUND
    }
    if (!pit && (x % 11) < 8) tiles[rows - 2][x] = T_GROUND
  }

  // Helper to fill rectangles
  function rectFill(r0: number, c0: number, r1: number, c1: number, t: number) {
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) tiles[r][c] = t
      }
    }
  }

  // Floating platforms
  rectFill(10, 20, 10, 26, T_BLOCK)
  rectFill(8, 33, 8, 36, T_BLOCK)
  rectFill(11, 45, 11, 60, T_BLOCK)
  rectFill(9, 65, 9, 70, T_BLOCK)
  rectFill(7, 78, 7, 85, T_BLOCK)
  rectFill(12, 96, 12, 110, T_BLOCK)
  rectFill(9, 122, 9, 128, T_BLOCK)
  rectFill(11, 140, 11, 155, T_BLOCK)
  rectFill(8, 168, 8, 174, T_BLOCK)
  rectFill(12, 185, 12, 200, T_BLOCK)
  rectFill(10, 210, 10, 215, T_BLOCK)

  // Spikes
  for (let x = 75; x <= 78; x += 1) tiles[rows - 2][x] = T_SPIKE
  for (let x = 132; x <= 136; x += 1) tiles[rows - 2][x] = T_SPIKE
  for (let x = 188; x <= 190; x += 1) tiles[rows - 2][x] = T_SPIKE

  // Portal at the end
  const flagCol = cols - 6
  tiles[rows - 2][flagCol] = T_FLAG
  tiles[rows - 3][flagCol] = T_FLAG
  tiles[rows - 4][flagCol] = T_FLAG

  return { tiles, tileSize }
}

function rectVsTiles(
  level: Level,
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number
): { collided: boolean; correctionX: number; correctionY: number } {
  // Axis-aligned collision resolution by sampling overlapped tiles
  const { tileSize, tiles } = level
  const startTileX = Math.max(0, Math.floor(rectX / tileSize))
  const endTileX = Math.min(tiles[0].length - 1, Math.floor((rectX + rectWidth) / tileSize))
  const startTileY = Math.max(0, Math.floor(rectY / tileSize))
  const endTileY = Math.min(tiles.length - 1, Math.floor((rectY + rectHeight) / tileSize))

  let collided = false
  let correctionX = 0
  let correctionY = 0

  for (let ty = startTileY; ty <= endTileY; ty += 1) {
    for (let tx = startTileX; tx <= endTileX; tx += 1) {
      if (isSolidTile(tiles[ty][tx])) {
        const tileLeft = tx * tileSize
        const tileTop = ty * tileSize
        const tileRight = tileLeft + tileSize
        const tileBottom = tileTop + tileSize

        const overlapX = Math.min(rectX + rectWidth, tileRight) - Math.max(rectX, tileLeft)
        const overlapY = Math.min(rectY + rectHeight, tileBottom) - Math.max(rectY, tileTop)
        if (overlapX > 0 && overlapY > 0) {
          collided = true
          // Resolve minimal axis overlap
          if (overlapX < overlapY) {
            correctionX = rectX + rectWidth * 0.5 < tileLeft + tileSize * 0.5 ? -overlapX : overlapX
          } else {
            correctionY = rectY + rectHeight * 0.5 < tileTop + tileSize * 0.5 ? -overlapY : overlapY
          }
        }
      }
    }
  }

  return { collided, correctionX, correctionY }
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  cameraX: number,
  worldWidth: number
) {
  const t = timeMs / 1000
  const h1 = (t * 60) % 360
  const h2 = (h1 + 100) % 360
  const gradient = context.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, hsl(h1, 95, 60))
  gradient.addColorStop(1, hsl(h2, 95, 15))
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)

  // Hyperspace streaks (parallax)
  context.save()
  context.translate(-cameraX * 0.3, 0)
  context.globalAlpha = 0.25
  for (let i = 0; i < STREAK_COUNT; i += 1) {
    const sx = ((i * 200 + t * 500) % (worldWidth + 400)) - 200
    const sy = (Math.sin(i * 0.7 + t * 2) * 0.5 + 0.5) * height
    context.strokeStyle = hsl((h1 + i * 5) % 360, 100, 70)
    context.lineWidth = 2 + 2 * Math.sin(i + t * 4)
    context.beginPath()
    context.moveTo(sx, sy)
    context.lineTo(sx + 60, sy)
    context.stroke()
  }
  context.globalAlpha = 1
  context.restore()
}

function drawTilesAndObjects(
  context: CanvasRenderingContext2D,
  level: Level,
  cameraX: number,
  cameraY: number,
  viewportWidth: number,
  viewportHeight: number,
  timeSeconds: number,
  orbs: Orb[],
  enemies: Enemy[]
) {
  const { tiles, tileSize } = level
  const rows = tiles.length
  const cols = tiles[0].length
  const startX = Math.max(0, Math.floor(cameraX / tileSize) - 1)
  const endX = Math.min(cols - 1, Math.floor((cameraX + viewportWidth) / tileSize) + 1)
  const startY = Math.max(0, Math.floor(cameraY / tileSize) - 1)
  const endY = Math.min(rows - 1, Math.floor((cameraY + viewportHeight) / tileSize) + 1)

  context.save()
  context.translate(-cameraX, -cameraY)

  // Tiles
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const tt = tiles[y][x]
      const left = x * tileSize
      const top = y * tileSize
      if (tt === T_GROUND) {
        context.fillStyle = hsl(200 + Math.sin((left + timeSeconds * 200) * 0.002) * 60, 80, 20)
        context.fillRect(left, top, tileSize, tileSize)
        context.fillStyle = hsl(160, 90, 55)
        context.fillRect(left, top, tileSize, 5)
      } else if (tt === T_BLOCK) {
        context.strokeStyle = hsl(300, 100, 70)
        context.lineWidth = 2
        context.strokeRect(left + 4, top + 4, tileSize - 8, tileSize - 8)
      } else if (tt === T_SPIKE) {
        context.fillStyle = hsl(0, 100, 55)
        context.beginPath()
        context.moveTo(left, top + tileSize)
        context.lineTo(left + tileSize / 2, top + tileSize - 18)
        context.lineTo(left + tileSize, top + tileSize)
        context.closePath()
        context.fill()
      } else if (tt === T_FLAG) {
        const k = (Math.sin(timeSeconds * 3 + y + x) * 0.5 + 0.5) * 8 + 10
        context.strokeStyle = hsl((timeSeconds * 120 + left) * 0.1, 100, 60)
        context.lineWidth = 3
        context.beginPath()
        context.arc(left + tileSize / 2, top + tileSize / 2, k, 0, Math.PI * 2)
        context.stroke()
      }
    }
  }

  // Orbs
  for (let i = 0; i < orbs.length; i += 1) {
    const orb = orbs[i]
    if (orb.collected) continue
    context.save()
    context.shadowColor = hsl((timeSeconds * 200 + orb.x) * 0.1, 100, 60)
    context.shadowBlur = 15
    context.fillStyle = hsl((timeSeconds * 200 + orb.x) * 0.1, 100, 70)
    context.beginPath()
    context.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  // Enemies
  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i]
    if (!e.alive) continue
    context.save()
    context.translate(e.x, e.y)
    const hue = (timeSeconds * 120 + e.x * 0.2 + e.y * 0.1) % 360
    context.shadowColor = hsl(hue, 100, 60)
    context.shadowBlur = 20
    if (e.type === 'TRICK') {
      // Trickster: rotating diamond
      context.rotate(Math.sin(e.phase) * 0.6)
      context.fillStyle = hsl(hue, 100, 60)
      context.beginPath()
      context.moveTo(0, e.height / 2)
      context.lineTo(e.width / 2, 0)
      context.lineTo(e.width, e.height / 2)
      context.lineTo(e.width / 2, e.height)
      context.closePath()
      context.fill()
    } else {
      // Hyper-dimensional: starburst
      context.rotate(e.phase * 0.7)
      context.strokeStyle = hsl(hue + 80, 100, 70)
      context.lineWidth = 3
      context.beginPath()
      for (let k = 0; k < 7; k += 1) {
        const ang = (k / 7) * Math.PI * 2
        const r1 = 8 + 6 * Math.sin(e.phase + k)
        context.moveTo(e.width / 2, e.height / 2)
        context.lineTo(
          e.width / 2 + Math.cos(ang) * (10 + r1),
          e.height / 2 + Math.sin(ang) * (10 + r1)
        )
      }
      context.stroke()
    }
    context.restore()
  }

  context.restore()
}

function drawPlayer(
  context: CanvasRenderingContext2D,
  player: PlayerState,
  cameraX: number,
  cameraY: number,
  timeSeconds: number,
  trail: { x: number; y: number }[]
) {
  context.save()
  context.translate(-cameraX, -cameraY)

  // Trail blocks
  for (let i = 0; i < trail.length; i += 1) {
    const p = trail[i]
    const alpha = (i / trail.length) * 0.5
    context.fillStyle = hsl((timeSeconds * 150 + i * 10) % 360, 100, 70, alpha)
    context.fillRect(p.x + 6, p.y + 10, 12, 10)
  }

  // Wizard body with hat
  const wizHue = (timeSeconds * 200 + player.positionX * 0.1) % 360
  context.save()
  context.translate(player.positionX, player.positionY)
  context.shadowColor = hsl(wizHue, 100, 60)
  context.shadowBlur = 25
  // Robe (triangle)
  context.fillStyle = hsl(wizHue, 100, 65)
  context.beginPath()
  context.moveTo(12, 0)
  context.lineTo(0, player.height)
  context.lineTo(24, player.height)
  context.closePath()
  context.fill()
  // Hat
  context.fillStyle = hsl((wizHue + 120) % 360, 100, 60)
  context.beginPath()
  context.moveTo(12, -8)
  context.lineTo(6, 6)
  context.lineTo(18, 6)
  context.closePath()
  context.fill()
  // Eyes
  context.fillStyle = '#fff'
  context.fillRect(6, 8, 3, 3)
  context.fillRect(15, 8, 3, 3)
  context.restore()

  context.restore()
}

function drawHUD(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  orbsCollected: number,
  dead: boolean,
  won: boolean,
  timeSeconds: number
) {
  context.save()
  context.fillStyle = '#0b0b0b'
  context.globalAlpha = 0.8
  context.fillRect(8, 8, 460, 56)
  context.globalAlpha = 1
  context.fillStyle = '#eaffff'
  context.font = '16px system-ui, -apple-system, Segoe UI, Roboto'
  context.fillText(`Orbs: ${orbsCollected}`, 16, 30)
  context.fillText('Move: ← →  | Jump: SPACE  | Run: SHIFT/X  | Restart: R', 16, 52)

  if (dead || won) {
    context.fillStyle = 'rgba(0,0,0,0.55)'
    context.fillRect(0, 0, canvasWidth, canvasHeight)
    context.fillStyle = '#fff'
    context.font = '28px system-ui, -apple-system, Segoe UI, Roboto'
    context.fillText(won ? 'You transcended!' : 'Lost in hyperspace!', canvasWidth / 2 - 150, canvasHeight / 2 - 10)
    context.font = '18px system-ui, -apple-system, Segoe UI, Roboto'
    context.fillText('Press R to play again', canvasWidth / 2 - 110, canvasHeight / 2 + 20)
  }

  // Tiny draw time indicator shimmer
  context.fillStyle = hsl(timeSeconds * 200, 100, 70)
  context.fillRect(canvasWidth - 24, 16, 8, 8)
  context.restore()
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export default function HyperWizard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const inputsRef = useRef<KeyboardInputs>({
    moveLeft: false,
    moveRight: false,
    jump: false,
    run: false,
    attack: false,
    restart: false,
  })

  // Keep state inside refs to avoid React re-renders each frame
  const playerRef = useRef<PlayerState | null>(null)
  const levelRef = useRef<Level | null>(null)
  const cameraRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const lastFrameTimeRef = useRef<number>(performance.now())
  const accumulatorRef = useRef<number>(0)
  const orbsRef = useRef<Orb[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const trailRef = useRef<{ x: number; y: number }[]>([])
  const deadRef = useRef<boolean>(false)
  const wonRef = useRef<boolean>(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    ctxRef.current = context

    // Initialize level and player
    levelRef.current = createBaselineLevel()
    playerRef.current = {
      positionX: 64,
      positionY: 64,
      velocityX: 0,
      velocityY: 0,
      width: 20,
      height: 28,
      isOnGround: false,
    }

    // Initialize orbs
    orbsRef.current = []
    function addOrb(px: number, py: number) {
      orbsRef.current.push({ x: px, y: py, radius: 10, collected: false })
    }
    for (let x = 24; x <= 26; x += 1) addOrb(x * 32 + 16, 9 * 32 + 12)
    for (let x = 46; x <= 58; x += 2) addOrb(x * 32 + 16, 10 * 32 - 16)
    for (let x = 66; x <= 70; x += 1) addOrb(x * 32 + 16, 8 * 32 - 8)
    for (let x = 78; x <= 85; x += 1) addOrb(x * 32 + 16, 7 * 32 - 12)
    for (let x = 122; x <= 128; x += 1) addOrb(x * 32 + 16, 8 * 32 - 16)
    for (let x = 140; x <= 155; x += 3) addOrb(x * 32 + 16, 10 * 32 - 20)
    for (let x = 168; x <= 174; x += 1) addOrb(x * 32 + 16, 7 * 32 - 16)
    for (let x = 185; x <= 200; x += 2) addOrb(x * 32 + 16, 12 * 32 - 20)

    // Initialize enemies
    enemiesRef.current = []
    function spawnEnemy(tileCol: number, tileRow: number, type: Enemy['type']) {
      const x = tileCol * 32 + 4
      const y = tileRow * 32 - 28
      enemiesRef.current.push({
        x,
        y,
        width: 24,
        height: 28,
        velocityX: Math.random() < 0.5 ? -70 : 70,
        velocityY: 0,
        alive: true,
        phase: Math.random() * Math.PI * 2,
        type,
      })
    }
    const levelTiles = levelRef.current.tiles
    const rows = levelTiles.length
    spawnEnemy(52, rows - 2, 'TRICK')
    spawnEnemy(88, rows - 2, 'HYPER')
    spawnEnemy(107, 12, 'TRICK')
    spawnEnemy(147, 10, 'HYPER')
    spawnEnemy(172, 8, 'TRICK')
    spawnEnemy(196, 12, 'HYPER')

    // Resize canvas to fit window
    const handleResize = () => {
      const scale = window.devicePixelRatio || 1
      canvas.width = Math.floor(window.innerWidth * scale)
      canvas.height = Math.floor(window.innerHeight * scale)
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      context.setTransform(scale, 0, 0, scale, 0, 0)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    // Lock focus and page scroll for game controls
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    canvas.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      const code = event.code
      if (
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'Space'
      ) {
        event.preventDefault()
      }
      if (code === 'ArrowLeft' || code === 'KeyA') inputsRef.current.moveLeft = true
      if (code === 'ArrowRight' || code === 'KeyD') inputsRef.current.moveRight = true
      if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyX') inputsRef.current.run = true
      if (code === 'KeyS') inputsRef.current.attack = true
      if (code === 'KeyR') {
        inputsRef.current.restart = true
        event.preventDefault()
      }
      if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') inputsRef.current.jump = true
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const code = event.code
      if (
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'Space'
      ) {
        event.preventDefault()
      }
      if (code === 'ArrowLeft' || code === 'KeyA') inputsRef.current.moveLeft = false
      if (code === 'ArrowRight' || code === 'KeyD') inputsRef.current.moveRight = false
      if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyX') inputsRef.current.run = false
      if (code === 'KeyS') inputsRef.current.attack = false
      if (code === 'KeyR') inputsRef.current.restart = false
      if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') inputsRef.current.jump = false
    }

    window.addEventListener('keydown', handleKeyDown, { passive: false })
    window.addEventListener('keyup', handleKeyUp, { passive: false })

    const physicsConstants = {
      gravity: 2200, // px/s^2
      baseMoveSpeed: 240, // px/s
      runMultiplier: 1.6,
      jumpBase: -640, // px/s upward
      jumpRunBoost: -140,
      maxFallSpeed: 1200,
      groundAcceleration: 2600,
      airAcceleration: 1600,
      frictionGround: 0.86,
      frictionAir: 0.92,
    }

    function tileAt(px: number, py: number): number {
      const level = levelRef.current
      if (!level) return T_EMPTY
      const cols = level.tiles[0].length
      const rowsCount = level.tiles.length
      const c = Math.floor(px / level.tileSize)
      const r = Math.floor(py / level.tileSize)
      if (c < 0 || c >= cols || r < 0 || r >= rowsCount) return T_EMPTY
      return level.tiles[r][c]
    }

    function restartPlayer(): void {
      const player = playerRef.current
      if (!player) return
      player.positionX = 64
      player.positionY = 64
      player.velocityX = 0
      player.velocityY = 0
      player.isOnGround = false
      cameraRef.current.x = 0
      cameraRef.current.y = 0
    }

    function stepSimulation(fixedDeltaSeconds: number): void {
      const player = playerRef.current
      const level = levelRef.current
      if (!player || !level) return

      const inputs = inputsRef.current
      if (inputs.restart) {
        restartPlayer()
        // Clear game over/win state when restarting
        deadRef.current = false
        wonRef.current = false
      }

      // If dead or won, freeze gameplay
      if (deadRef.current || wonRef.current) return

      // Horizontal input with acceleration
      const running = inputs.run
      const baseSpeed = physicsConstants.baseMoveSpeed * (running ? physicsConstants.runMultiplier : 1)
      const targetVX = (inputs.moveLeft ? -baseSpeed : 0) + (inputs.moveRight ? baseSpeed : 0)
      const accel = player.isOnGround ? physicsConstants.groundAcceleration : physicsConstants.airAcceleration
      const dv = clamp(targetVX - player.velocityX, -accel * fixedDeltaSeconds, accel * fixedDeltaSeconds)
      player.velocityX += dv

      // Jump
      if (inputs.jump && player.isOnGround) {
        player.velocityY = physicsConstants.jumpBase + (running ? physicsConstants.jumpRunBoost : 0)
        player.isOnGround = false
      }

      // Gravity
      player.velocityY += physicsConstants.gravity * fixedDeltaSeconds
      player.velocityY = clamp(player.velocityY, -Infinity, physicsConstants.maxFallSpeed)

      // Integrate and collide X axis
      const nextX = player.positionX + player.velocityX * fixedDeltaSeconds
      const resultX = rectVsTiles(level, nextX, player.positionY, player.width, player.height)
      if (resultX.collided && resultX.correctionX !== 0) {
        player.positionX = nextX + resultX.correctionX
        player.velocityX = 0
      } else {
        player.positionX = nextX
      }

      // Integrate and collide Y axis
      const nextY = player.positionY + player.velocityY * fixedDeltaSeconds
      const resultY = rectVsTiles(level, player.positionX, nextY, player.width, player.height)
      if (resultY.collided && resultY.correctionY !== 0) {
        player.positionY = nextY + resultY.correctionY
        // If correction upwards, we landed
        if (resultY.correctionY < 0) {
          player.isOnGround = true
        }
        player.velocityY = 0
      } else {
        player.positionY = nextY
        player.isOnGround = false
      }

      // World bounds death
      const worldHeight = level.tiles.length * level.tileSize
      if (player.positionY > worldHeight + 200) {
        deadRef.current = true
      }

      // Spike check near feet
      const feetRow = Math.floor((player.positionY + player.height - 1) / level.tileSize)
      const midCol = Math.floor((player.positionX + player.width / 2) / level.tileSize)
      if (feetRow >= 0 && feetRow < level.tiles.length && midCol >= 0 && midCol < level.tiles[0].length) {
        let spikeHere = level.tiles[feetRow][midCol] === T_SPIKE
        if (!spikeHere && feetRow - 1 >= 0) spikeHere = level.tiles[feetRow - 1][midCol] === T_SPIKE
        if (spikeHere) deadRef.current = true
      }

      // Orbs collection
      const orbs = orbsRef.current
      for (let i = 0; i < orbs.length; i += 1) {
        const c = orbs[i]
        if (c.collected) continue
        const dx = player.positionX + player.width / 2 - c.x
        const dy = player.positionY + player.height / 2 - c.y
        if (dx * dx + dy * dy < (c.radius + 12) * (c.radius + 12)) {
          c.collected = true
        }
      }

      // Enemies update and collisions
      const enemies = enemiesRef.current
      for (let i = 0; i < enemies.length; i += 1) {
        const e = enemies[i]
        if (!e.alive) continue
        e.phase += fixedDeltaSeconds * 2
        e.velocityY = clamp(e.velocityY + physicsConstants.gravity * fixedDeltaSeconds, -9999, physicsConstants.maxFallSpeed)
        // Move X with collisions
        const exNext = e.x + e.velocityX * fixedDeltaSeconds
        const exCol = rectVsTiles(level, exNext, e.y, e.width, e.height)
        if (exCol.collided && exCol.correctionX !== 0) {
          e.x = exNext + exCol.correctionX
          e.velocityX *= -1
        } else {
          e.x = exNext
        }
        // Move Y with collisions
        const eyNext = e.y + e.velocityY * fixedDeltaSeconds
        const eyCol = rectVsTiles(level, e.x, eyNext, e.width, e.height)
        if (eyCol.collided && eyCol.correctionY !== 0) {
          e.y = eyNext + eyCol.correctionY
          e.velocityY = 0
        } else {
          e.y = eyNext
        }

        // Edge detection ahead -> flip
        const aheadX = e.x + (e.velocityX > 0 ? e.width + 1 : -1)
        const tileBelow = tileAt(aheadX, e.y + e.height + 1)
        if (!isSolidTile(tileBelow)) e.velocityX *= -1

        // Player vs enemy
        const overlap =
          player.positionX < e.x + e.width &&
          player.positionX + player.width > e.x &&
          player.positionY < e.y + e.height &&
          player.positionY + player.height > e.y
        if (overlap) {
          const playerBottomPrev = player.positionY - player.velocityY * fixedDeltaSeconds + player.height
          const enemyTop = e.y
          if (player.velocityY > 50 && playerBottomPrev <= enemyTop + 6) {
            // Stomp
            e.alive = false
            player.velocityY = physicsConstants.jumpBase * 0.55
          } else {
            deadRef.current = true
          }
        }
      }

      // Win detection by touching flag
      const playerTileC = Math.floor((player.positionX + player.width / 2) / level.tileSize)
      const playerTileR = Math.floor((player.positionY + player.height / 2) / level.tileSize)
      if (
        playerTileR >= 0 && playerTileR < level.tiles.length &&
        playerTileC >= 0 && playerTileC < level.tiles[0].length &&
        level.tiles[playerTileR][playerTileC] === T_FLAG
      ) {
        wonRef.current = true
      }

      // Camera follows player with slight lead horizontally
      const canvasEl = ctxRef.current ? (ctxRef.current.canvas as HTMLCanvasElement) : null
      const viewportWidth = canvasEl ? canvasEl.clientWidth : 0
      const viewportHeight = canvasEl ? canvasEl.clientHeight : 0
      const lead = 80
      cameraRef.current.x = clamp(player.positionX - viewportWidth / 2 + lead * Math.sign(player.velocityX), 0, Infinity)
      cameraRef.current.y = clamp(player.positionY - viewportHeight / 2, 0, Infinity)

      // Trail
      const trail = trailRef.current
      trail.push({ x: player.positionX, y: player.positionY })
      if (trail.length > TRAIL_MAX) trail.shift()
    }

    function renderFrame(nowMs: number): void {
      const player = playerRef.current
      const level = levelRef.current
      const ctx = ctxRef.current
      if (!player || !level || !ctx) return

      const canvasEl = ctx.canvas as HTMLCanvasElement
      const width = canvasEl.clientWidth
      const height = canvasEl.clientHeight

      const worldWidth = level.tiles[0].length * level.tileSize
      const timeSeconds = nowMs / 1000
      drawBackground(ctx, width, height, nowMs, cameraRef.current.x, worldWidth)
      drawTilesAndObjects(
        ctx,
        level,
        cameraRef.current.x,
        cameraRef.current.y,
        width,
        height,
        timeSeconds,
        orbsRef.current,
        enemiesRef.current
      )
      const trail = trailRef.current
      drawPlayer(ctx, player, cameraRef.current.x, cameraRef.current.y, timeSeconds, trail)
      const collected = orbsRef.current.reduce((acc, o) => acc + (o.collected ? 1 : 0), 0)
      drawHUD(ctx, width, height, collected, deadRef.current, wonRef.current, timeSeconds)
    }

    let isRunning = true
    function gameLoop(nowMs: number): void {
      if (!isRunning) return
      const last = lastFrameTimeRef.current
      const delta = nowMs - last
      lastFrameTimeRef.current = nowMs
      accumulatorRef.current += delta

      // Fixed-timestep simulation for stable physics
      while (accumulatorRef.current >= FRAME_DURATION_MS) {
        stepSimulation(FRAME_DURATION_MS / 1000)
        accumulatorRef.current -= FRAME_DURATION_MS
      }

      renderFrame(nowMs)
      requestAnimationFrame(gameLoop)
    }

    const raf = requestAnimationFrame(gameLoop)

    return () => {
      isRunning = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100vw',
        height: '100vh',
        display: 'block',
        background: '#0b1020',
        outline: 'none',
      }}
      tabIndex={0}
    />
  )
}


