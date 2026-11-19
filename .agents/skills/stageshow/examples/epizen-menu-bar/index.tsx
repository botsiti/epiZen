import { useLayoutEffect, useRef } from 'react'
import { Bar, Stage, Window, type Act } from '../../kit'
import { TrayPanel } from '../../../../../src/tray/TrayPanel'
import { parseDay } from '../../../../../src/lib/day'
import { initialTimer, pause, start } from '../../../../../src/lib/timer'
import { panelView } from '../../../../../src/lib/tray'
import '../../../../../src/styles.css'
import '../../../../../src/tray/tray.css'
import './panel.css'

const now = new Date(2026, 10, 18, 12, 34).getTime()
const path = '18.11.2026.md'
const text = [
  '### Tasks',
  '- [ ] #daily/study — Review the weekly plan [minutes::48]',
  '- [ ] #daily/code — Draft release notes [minutes::25]',
  '- [x] #daily/dog — Morning walk [minutes::30]',
].join('\n')
const timer = start(initialTimer(), now - 11 * 60_000 - 18_000, {
  id: 'demo',
  task: { path, day: '2026-11-18', line: 1, label: 'Review the weekly plan', category: 'study' },
  mode: 'stopwatch',
})
type Scene = { paused: boolean }
const cursorHome = { x: -14, y: 168 }

async function script(a: Act<Scene>) {
  await a.wait(800)
  a.mark('pause')
  await a.click({ at: 'timer-toggle', x: 0.92, y: 0.78 })
  await a.set({ paused: true })
  await a.wait(1900)
  a.mark('resume')
  await a.click({ at: 'timer-toggle', x: 0.92, y: 0.78 })
  await a.set({ paused: false })
  await a.move(cursorHome)
  await a.wait(1500)
}

function Panel({ paused }: Scene) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const target = ref.current?.querySelector<HTMLElement>(paused ? '[data-testid=tray-resume]' : '[data-testid=tray-pause]')
    if (target) {
      target.dataset.target = 'timer-toggle'
      target.dataset.cursor = 'pointer'
    }
  }, [paused])
  const view = panelView({
    navigation: { dailyNote: true, calendar: true },
    vault: 'Demo',
    today: new Date(now),
    path,
    text,
    day: parseDay(text),
    timer: paused ? pause(timer, now) : timer,
    unwritten: 0,
  })
  return (
    <div className="epizen-stage-panel" ref={ref}>
      <TrayPanel view={view} now={now} send={() => {}} onOpen={() => {}} onQuit={() => {}} />
    </div>
  )
}

export default function EpizenMenuBar() {
  return (
    <Stage
      width={656} height={536}
      compact={{ below: 620, width: 358, height: 526 }}
      initial={{ paused: false }} poster={{ paused: false }}
      script={script} cursor={{ at: cursorHome, idle: 850 }}
      theme="dark" accent="#8fbcaa" className="epizen-stage"
    >
      {(scene, _rect, layout) => (
        <>
          {layout === 'wide' && (
            <Window chrome="hairline" receded className="epizen-stage-window">
              <div className="epizen-stage-calendar" aria-hidden="true">
                <Bar w={76} h={13} r={4} tone={3} />
                <div className="epizen-stage-week">
                  {[64, 98, 50, 82, 104].map((width) => (
                    <div key={width}>
                      <Bar w={18} h={6} r={2} tone={3} />
                      <Bar w={width / 2} h={32} r={4} tone={1} />
                      <Bar w={width / 2} h={23} r={4} tone={1} />
                    </div>
                  ))}
                </div>
              </div>
            </Window>
          )}
          <Panel paused={scene.paused} />
        </>
      )}
    </Stage>
  )
}
