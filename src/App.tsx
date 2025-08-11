import './App.css'
import { useState, useCallback } from 'react'
import HyperWizard from './components/HyperWizard'
import MainMenu from './components/MainMenu'

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'level1'>('menu')

  const startGame = useCallback(() => setScreen('level1'), [])
  const backToMenu = useCallback(() => setScreen('menu'), [])

  if (screen === 'menu') return <MainMenu onStart={startGame} />
  return <HyperWizard key="level1" onExitToMenu={backToMenu} />
}
