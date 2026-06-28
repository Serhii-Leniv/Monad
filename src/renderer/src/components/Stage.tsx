import { useEffect, useMemo, useRef, useState } from 'react'
import Moveable from 'react-moveable'
import Selecto from 'react-selecto'
import TerminalPane from './TerminalPane'
import { useStore } from '../store'

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function Stage(): JSX.Element {
  const agents = useStore((s) => s.agents)
  const selectedIds = useStore((s) => s.selectedIds)
  const setSelected = useStore((s) => s.setSelected)
  const reorderAgent = useStore((s) => s.reorderAgent)
  const relayout = useStore((s) => s.relayout)
  const setDraggingId = useStore((s) => s.setDraggingId)
  const setCanvasSize = useStore((s) => s.setCanvasSize)
  const draggingId = useStore((s) => s.draggingId)
  const panX = useStore((s) => s.panX)
  const panY = useStore((s) => s.panY)
  const zoom = useStore((s) => s.zoom)

  const stageRef = useRef<HTMLDivElement>(null)
  const moveableRef = useRef<Moveable>(null)
  const selectoRef = useRef<Selecto>(null)
  const draggingRef = useRef(false)
  const [targets, setTargets] = useState<HTMLElement[]>([])

  // Re-tile only when the pane set changes (add/remove) or the selection
  // changes — not on every status/ptyId tick that mutates `agents`.
  const agentCount = agents.length
  // A signature of just the layout geometry; status/branch/ptyId churn doesn't
  // change it, so the Moveable rect isn't recomputed for non-layout updates.
  const layoutSig = useMemo(
    () => agents.map((a) => `${a.x},${a.y},${a.w},${a.h}`).join('|'),
    [agents]
  )

  useEffect(() => {
    const vp = stageRef.current
    if (!vp) return
    const all = Array.from(vp.querySelectorAll<HTMLElement>('.vec-pane'))
    const sel = new Set(selectedIds)
    setTargets(all.filter((c) => sel.has(c.dataset.id ?? '')))
  }, [selectedIds, agentCount])

  useEffect(() => {
    // Don't poke Moveable mid-drag — the live reorder re-tiles every cross and
    // updateRect would fight the in-progress drag.
    if (!draggingRef.current) moveableRef.current?.updateRect()
  }, [panX, panY, zoom, layoutSig])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    // Coalesce a burst of resize callbacks into one update per frame.
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setCanvasSize(el.clientWidth, el.clientHeight))
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [setCanvasSize])

  const idOf = (el: HTMLElement | null): string | undefined =>
    (el?.closest('.vec-pane') as HTMLElement | null)?.dataset.id

  // Where does this drop land? The slot whose centre is nearest the dragged
  // card's centre — that index becomes the card's new place in the order.
  const nearestIndex = (cx: number, cy: number): number => {
    const list = useStore.getState().agents
    let best = 0
    let bestD = Infinity
    list.forEach((g, i) => {
      const d = (g.x + g.w / 2 - cx) ** 2 + (g.y + g.h / 2 - cy) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }

  const dragTarget =
    targets.length === 1
      ? (targets[0].querySelector('.vec-pane__header') as HTMLElement) ?? undefined
      : undefined

  const dragAgent = draggingId ? agents.find((a) => a.id === draggingId) : undefined

  return (
    <div className="stage" ref={stageRef}>
      <div
        className="stage__panes"
        style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }}
      >
        {dragAgent && dragAgent.dropX != null && (
          <div
            className="stage__placeholder"
            style={{
              transform: `translate(${dragAgent.dropX}px, ${dragAgent.dropY}px)`,
              width: dragAgent.dropW,
              height: dragAgent.dropH
            }}
          />
        )}
        {agents.map((a) => (
          <TerminalPane key={a.id} agent={a} />
        ))}
      </div>

      <Moveable
        ref={moveableRef}
        target={targets}
        dragTarget={dragTarget}
        rootContainer={stageRef.current ?? undefined}
        zoom={zoom}
        draggable
        resizable={false}
        origin={false}
        // NB: deliberately NOT passing flushSync — it forced a *synchronous*
        // re-render of every xterm pane on each pointer-move (the drag "flicker").
        // Let React batch the reorder re-renders instead.
        onDragStart={(e: any) => {
          draggingRef.current = true
          stageRef.current?.classList.add('is-dragging-any')
          document.body.classList.add('dragging')
          const id = idOf(e.target)
          if (id) {
            setDraggingId(id)
            relayout() // marks the dragged card's slot so the placeholder shows
          }
          e.target.classList.add('is-dragging')
        }}
        onDrag={(e: any) => {
          // The card lifts and follows the cursor 1:1; meanwhile the OTHER cards
          // reflow to open a gap at the slot nearest the pointer.
          e.target.style.transform = `${e.transform} scale(1.03)`
          const id = idOf(e.target)
          const t = e.translate
          if (!id || !t) return
          const st = useStore.getState()
          const a = st.agents.find((x) => x.id === id)
          if (!a) return
          const cur = st.agents.findIndex((x) => x.id === id)
          const target = nearestIndex(t[0] + a.w / 2, t[1] + a.h / 2)
          if (target !== cur) reorderAgent(id, target)
        }}
        onDragEnd={(e: any) => {
          draggingRef.current = false
          stageRef.current?.classList.remove('is-dragging-any')
          document.body.classList.remove('dragging')
          e.target.classList.remove('is-dragging')
          setDraggingId(null) // clear first so relayout drops it into its slot
          relayout()
          // Explicitly animate the lifted card into its final slot (transition is
          // back on now) — also covers releasing in the same cell.
          const a = useStore.getState().agents.find((x) => x.id === idOf(e.target))
          if (a) e.target.style.transform = `translate(${a.x}px, ${a.y}px)`
        }}
        onDragGroup={(e: any) =>
          e.events.forEach((ev: any) => (ev.target.style.transform = ev.transform))
        }
        // Multi-card drag doesn't reorder — just snap everything back into place.
        onDragGroupEnd={() => relayout()}
        onClickGroup={(e: any) => selectoRef.current?.clickTarget(e.inputEvent, e.inputTarget)}
      />

      <Selecto
        ref={selectoRef}
        dragContainer={stageRef.current ?? undefined}
        selectableTargets={['.vec-pane']}
        hitRate={0}
        selectByClick
        selectFromInside={false}
        toggleContinueSelect={['shift']}
        ratio={0}
        onDragStart={(e: any) => {
          const t = e.inputEvent.target as HTMLElement
          const mv = moveableRef.current
          if (mv?.isMoveableElement(t)) return e.stop()
          if (t.closest?.('.vec-pane__term') || t.closest?.('.vec-pane__close')) return e.stop()
          if (targets.some((el) => el === t || el.contains(t))) e.stop()
        }}
        onSelect={(e: any) =>
          setSelected((e.selected as HTMLElement[]).map((el) => el.dataset.id!).filter(Boolean))
        }
        onSelectEnd={(e: any) => {
          setSelected((e.selected as HTMLElement[]).map((el) => el.dataset.id!).filter(Boolean))
          if (e.isDragStart) {
            e.inputEvent.preventDefault()
            moveableRef.current?.waitToChangeTarget().then(() => {
              moveableRef.current?.dragStart(e.inputEvent)
            })
          }
        }}
      />
    </div>
  )
}
