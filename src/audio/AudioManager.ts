// AudioManager – central place to manage SFX and music for all scenes/menus
// Quick tweak guide:
// - Overall volumes:
//   - master: overall output trim (init() → master.gain)
//   - SFX bus: sfx loudness (init() → busSfx.gain)
//   - Music bus: music loudness (init() → busMusic.gain)
// - Music color/space:
//   - filter.frequency: brightness of pad (lower = darker)
//   - delay.delayTime, feedback.gain, wet.gain, dry.gain: ambience level
// - Music pace (BPM-ish):
//   - chordIntervalMs in startMusic(): time between chord events
//   - envelope times (attack/hold/release) for pad notes
// - Progression (mood): edit the 'progression' array in startMusic()

export type SfxKind = 'jump' | 'runStep' | 'collect' | 'stomp' | 'death' | 'win' | 'flight'

type AudioNodes = {
  ctx: AudioContext
  master: GainNode
  busSfx: GainNode
  busMusic: GainNode
}

export class AudioManager {
  private nodes: AudioNodes | null = null
  private isMuted = false
  private musicStarted = false
  private musicOscillators: OscillatorNode[] = []
  private musicIntervalId: number | null = null
  // Optional global vibrato for pad oscillators
  private musicVibrLfo: OscillatorNode | null = null
  private musicVibrGain: GainNode | null = null
  // Music FX
  // Keep references to FX nodes to avoid GC churn and allow future control (e.g., scene-based filters)
  private musicDry: GainNode | null = null
  private musicFilter: BiquadFilterNode | null = null
  private musicDelay: DelayNode | null = null
  private musicFeedback: GainNode | null = null
  private musicWet: GainNode | null = null

  init(): void {
    if (this.nodes) {
      // Try resuming if suspended (autoplay policies)
      if (this.nodes.ctx.state === 'suspended') {
        this.nodes.ctx.resume().catch(() => {})
      }
      return
    }
    const AudioCtx: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const master = ctx.createGain()
    // MASTER OUTPUT VOLUME (overall trim)
    master.gain.value = this.isMuted ? 0 : 0.9
    master.connect(ctx.destination)

    const busSfx = ctx.createGain()
    // SFX BUS VOLUME (raise/lower to balance against music)
    busSfx.gain.value = 0.3
    busSfx.connect(master)

    const busMusic = ctx.createGain()
    // MUSIC BUS VOLUME (make music more present vs SFX)
    busMusic.gain.value = 0.48
    // Build subtle FX chain: highpass -> lowpass -> feedback delay (reverb-ish)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 180
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    // MUSIC TONE (brightness). Lower = darker pad.
    filter.frequency.value = 800
    const delay = ctx.createDelay(1.5)
    delay.delayTime.value = 0.32
    const feedback = ctx.createGain()
    feedback.gain.value = 0.3
    const wet = ctx.createGain()
    // WET/DRY MIX. Raise wet for more space, dry for more presence.
    wet.gain.value = 0.5
    const dry = ctx.createGain()
    dry.gain.value = 0.8

    // Dry path
    busMusic.connect(dry)
    dry.connect(master)
    // Wet path with highpass + lowpass + feedback delay
    busMusic.connect(hp)
    hp.connect(filter)
    filter.connect(delay)
    delay.connect(feedback)
    feedback.connect(delay)
    delay.connect(wet)
    wet.connect(master)

    this.musicDry = dry
    this.musicFilter = filter
    this.musicDelay = delay
    this.musicFeedback = feedback
    this.musicWet = wet

    this.nodes = { ctx, master, busSfx, busMusic }
  }

  toggleMute(): void {
    this.setMuted(!this.isMuted)
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted
    if (this.nodes) this.nodes.master.gain.value = muted ? 0 : 0.9
  }

  startMusic(_track: 'pad1' = 'pad1'): void {
    this.init()
    if (!this.nodes || this.musicStarted) return
    this.musicStarted = true

    const { ctx, busMusic } = this.nodes
    const a3 = 320 // A3 in Hz

    const hz = (semitonesFromA3: number) => a3 * Math.pow(2, semitonesFromA3 / 12)
    const triad = (root: number, type: 'minor' | 'major') => {
      const third = type === 'minor' ? 3 : 4
      return [root, root + third, root + 7]
    }
    // Am, F, C, G progression relative to A3
    const progression: Array<{ root: number; type: 'minor' | 'major' }> = [
      { root: 0,  type: 'major' }, // A
      { root: -2, type: 'major' }, // G
      { root: 5,  type: 'major' }, // D
      { root: 7,  type: 'major' }, // E
      { root: 0,  type: 'major' }, // A
      { root: -2, type: 'major' }, // G
      { root: 5,  type: 'major' }, // D
      { root: 7,  type: 'major' }, // E
    ];

    // Global slow vibrato that modulates oscillator detune (spacey motion)
    if (!this.musicVibrLfo || !this.musicVibrGain) {
      this.musicVibrLfo = ctx.createOscillator()
      this.musicVibrLfo.type = 'sine'
      this.musicVibrLfo.frequency.value = 0.28
      this.musicVibrGain = ctx.createGain()
      this.musicVibrGain.gain.value = 6 // cents
      this.musicVibrLfo.connect(this.musicVibrGain)
      this.musicVibrLfo.start()
    }

    const spawnPad = (rootSemis: number, type: 'minor' | 'major') => {
      const notes = triad(rootSemis, type)
      for (const n of notes) {
        // Two slight detuned oscillators per note
        const oscA = ctx.createOscillator()
        const oscB = ctx.createOscillator()
        oscA.type = 'sine'
        oscB.type = 'triangle'
        const baseHz = hz(n)
        oscA.frequency.value = baseHz
        oscB.frequency.value = baseHz
        oscA.detune.value = -4
        oscB.detune.value = 4
        // Attach global vibrato to both oscillators
        if (this.musicVibrGain) {
          this.musicVibrGain.connect(oscA.detune)
          this.musicVibrGain.connect(oscB.detune)
        }
        const g = ctx.createGain()
        g.gain.value = 0
        // gentle panning
        const pan = (ctx as any).createStereoPanner ? (ctx as any).createStereoPanner() : null
        const panNode: StereoPannerNode | GainNode = pan || ctx.createGain()
        if (pan) (pan as StereoPannerNode).pan.value = (Math.random() * 2 - 1) * 0.4

        oscA.connect(g)
        oscB.connect(g)
        g.connect(panNode as any)
        panNode.connect(busMusic)

        const now = ctx.currentTime
        // ENVELOPE SHAPE (faster/slower pad swells)
        const attack = 0.35
        const hold = 0.45
        const release = 0.85
        g.gain.setValueAtTime(0, now)
        g.gain.linearRampToValueAtTime(0.12, now + attack)
        g.gain.linearRampToValueAtTime(0.10, now + attack + hold)
        g.gain.exponentialRampToValueAtTime(0.001, now + attack + hold + release)

        oscA.start(now)
        oscB.start(now)
        oscA.stop(now + attack + hold + release + 0.05)
        oscB.stop(now + attack + hold + release + 0.05)

        this.musicOscillators.push(oscA, oscB)
      }
      // occasional shimmer
      if (Math.random() < 0.5) {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = hz(rootSemis + 12 + 7) // an octave + fifth above
        g.gain.value = 0
        osc.connect(g)
        g.connect(busMusic)
        const now = ctx.currentTime
        g.gain.setValueAtTime(0, now)
        g.gain.linearRampToValueAtTime(0.06, now + 0.2)
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.6)
        osc.start(now)
        osc.stop(now + 1.7)
        this.musicOscillators.push(osc)
      }
    }

    // PACE / TEMPO (BPM-ish): bpm and beats per chord
    const bpm = 120
    const beatsPerChord = 2
    const chordIntervalMs = Math.round((60000 / bpm) * beatsPerChord)
    let step = 0
    // Fire new chord; overlapping envelopes create a continuous pad
    this.musicIntervalId = window.setInterval(() => {
      const ch = progression[step % progression.length]
      spawnPad(ch.root, ch.type)
      step += 1
    }, chordIntervalMs)
  }

  stopMusic(): void {
    if (!this.nodes) return
    if (this.musicIntervalId !== null) {
      window.clearInterval(this.musicIntervalId)
      this.musicIntervalId = null
    }
    for (const o of this.musicOscillators) {
      try { o.stop() } catch {}
    }
    this.musicOscillators = []
    this.musicStarted = false
  }

  playSfx(kind: SfxKind): void {
    this.init()
    if (!this.nodes) return
    switch (kind) {
      case 'jump':
        this.beep(520, 'square', 90, 0.5)
        break
      case 'runStep':
        this.tap(170, 40, 0.35)
        break
      case 'collect':
        this.beep(880, 'sine', 70, 0.4)
        break
      case 'stomp':
        this.beep(180, 'sawtooth', 120, 0.6)
        break
      case 'death':
        this.downSweep(440, 110, 350)
        break
      case 'win':
        this.arpeggio([440, 440 * 1.25, 440 * 1.5, 440 * 2], 90, 0.35)
        break
      case 'flight':
        this.upSweep(160, 520, 280)
        break
      default:
        break
    }
  }

  private beep(freq: number, type: OscillatorType, durationMs: number, gainStart = 0.6): void {
    if (!this.nodes) return
    const { ctx, busSfx } = this.nodes
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.value = 0
    osc.connect(g)
    g.connect(busSfx)
    const t = ctx.currentTime
    const attack = 0.005
    const release = Math.max(0.03, (durationMs / 1000) * 0.5)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gainStart, t + attack)
    g.gain.exponentialRampToValueAtTime(0.001, t + durationMs / 1000 + release)
    osc.start(t)
    osc.stop(t + durationMs / 1000 + release + 0.02)
  }

  private tap(freq: number, durationMs: number, gainStart = 0.3): void {
    if (!this.nodes) return
    const { ctx, busSfx } = this.nodes
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    g.gain.value = 0
    osc.connect(g)
    g.connect(busSfx)
    const t = ctx.currentTime
    const attack = 0.001
    const release = 0.05
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gainStart, t + attack)
    g.gain.exponentialRampToValueAtTime(0.001, t + durationMs / 1000 + release)
    osc.start(t)
    osc.stop(t + durationMs / 1000 + release + 0.02)
  }

  private downSweep(fromHz: number, toHz: number, durationMs: number): void {
    if (!this.nodes) return
    const { ctx, busSfx } = this.nodes
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(fromHz, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(toHz, ctx.currentTime + durationMs / 1000)
    g.gain.value = 0.6
    osc.connect(g)
    g.connect(busSfx)
    osc.start()
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02)
  }

  private upSweep(fromHz: number, toHz: number, durationMs: number): void {
    if (!this.nodes) return
    const { ctx, busSfx } = this.nodes
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(fromHz, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(toHz, ctx.currentTime + durationMs / 1000)
    g.gain.value = 0.55
    osc.connect(g)
    g.connect(busSfx)
    osc.start()
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02)
  }

  private arpeggio(notes: number[], stepMs: number, gainStart = 0.35): void {
    notes.forEach((n, i) => {
      window.setTimeout(() => this.beep(n, 'sine', stepMs, gainStart), i * stepMs)
    })
  }
}

export const audio = new AudioManager()


