import { memo, useEffect, useMemo, useRef, useState } from 'react'
import Moveable from 'react-moveable'
import Selecto from 'react-selecto'
import TerminalPane from './TerminalPane'
import { useStore, wsById, type AgentInstance } from '../store'
import { nearestSlotIndex, type Slot } from '../dragSlot'
import { pickFolderForWorkspace } from '../openProject'
import { terminals } from '../terminalRegistry'

/* eslint-disable @typescript-eslint/no-explicit-any */

const EMPTY_AGENTS: AgentInstance[] = []
const EMPTY_IDS: string[] = []

/** One workspace's stage. App mounts one per live workspace (keyed by id) and
 *  only the active one is visible; the rest stay mounted (visibility-hidden) so
 *  their PTYs keep streaming. All scoped reads are for THIS workspace. */
function Stage({ workspaceId }: { workspaceId: string }): JSX.Element {
  const agents = useStore((s) => wsById(s, workspaceId)?.agents ?? EMPTY_AGENTS)
  const selectedIds = useStore((s) => wsById(s, workspaceId)?.selectedIds ?? EMPTY_IDS)
  const setSelected = useStore((s) => s.setSelected)
  const reorderAgent = useStore((s) => s.reorderAgent)
  const relayout = useStore((s) => s.relayout)
  const setDraggingId = useStore((s) => s.setDraggingId)
  const draggingId = useStore((s) => wsById(s, workspaceId)?.draggingId ?? null)
  const panX = useStore((s) => s.panX)
  const panY = useStore((s) => s.panY)
  const zoom = useStore((s) => s.zoom)
  const focusedId = useStore((s) => wsById(s, workspaceId)?.focusedId ?? null)
  // A workspace created via "New workspace" has no folder yet. Both facts drive
  // the empty state below — without it the stage renders as a blank rectangle
  // with no way out, because the rail hides its tools until a folder exists.
  const defaultPath = useStore((s) => wsById(s, workspaceId)?.defaultPath ?? null)
  const addAgent = useStore((s) => s.addAgent)

  // Mutable (not RefObject) because the callback ref below assigns it directly.
  const stageRef = useRef<HTMLDivElement | null>(null)
  const moveableRef = useRef<Moveable>(null)
  const selectoRef = useRef<Selecto>(null)
  const draggingRef = useRef(false)
  const [targets, setTargets] = useState<HTMLElement[]>([])
  // Moveable/Selecto need the stage ELEMENT, but `stageRef.current` is null on
  // the first render and assigning a ref doesn't re-render — so both libraries
  // were permanently handed `undefined` and fell back to the document. Mirroring
  // the node into state gives them the real container on the second render.
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null)

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
    // layoutSig too: a drag-reorder keeps agentCount and selectedIds identical,
    // so without it the queried element list stayed stale after the re-tile.
  }, [selectedIds, agentCount, layoutSig])

  useEffect(() => {
    // Don't poke Moveable mid-drag — the live reorder re-tiles every cross and
    // updateRect would fight the in-progress drag.
    if (!draggingRef.current) moveableRef.current?.updateRect()
  }, [panX, panY, zoom, layoutSig])

  // (Stage measurement lives in App now — it observes the shared stage box and
  // re-tiles every workspace, so a hidden Stage never reports a 0×0 size.)

  const idOf = (el: HTMLElement | null): string | undefined =>
    (el?.closest('.vec-pane') as HTMLElement | null)?.dataset.id

  // The slots as currently laid out. The dragged card's own x/y are pinned at its
  // pre-drag position and mean nothing mid-gesture — its real slot is the gap
  // laidOut stashed in drop*, so use that. Including it is what lets the hit test
  // answer "stay where you are"; skipping it made every pointer-move a reorder.
  const slotsOf = (list: AgentInstance[], dragId: string | null): Slot[] =>
    list.map((g) =>
      g.id === dragId && g.dropX != null
        ? { x: g.dropX, y: g.dropY!, w: g.dropW!, h: g.dropH! }
        : { x: g.x, y: g.y, w: g.w, h: g.h }
    )

  // No drag while a pane is maximized — Moveable's inline transform would fight
  // the focus geometry, and reordering makes no sense with one pane on screen.
  const dragTarget =
    targets.length === 1 && !focusedId
      ? (targets[0].querySelector('.vec-pane__header') as HTMLElement) ?? undefined
      : undefined

  const dragAgent = draggingId ? agents.find((a) => a.id === draggingId) : undefined

  return (
    <div
      className="stage"
      ref={(el) => {
        stageRef.current = el
        setStageEl((prev) => (prev === el ? prev : el))
      }}
    >
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
          <TerminalPane key={a.id} agent={a} workspaceId={workspaceId} />
        ))}
      </div>

      {/* An empty stage used to render as a blank rectangle. A workspace opened
          via "New workspace" starts with no folder AND no agents, and the rail
          hides its tools until a folder exists — so there was literally nothing
          to click. Deliberately a sibling of .stage__panes, not a child: panes
          carry the pan/zoom transform, and this must stay put and clickable.
          Offer the terminal in both cases — addAgent has no path requirement
          (a folderless agent starts in the home directory). */}
      {agentCount === 0 && (
        <div className="empty">
          <div className="empty__card">
            <h1>{defaultPath ? 'No terminals open' : 'This workspace has no folder yet'}</h1>
            <p>
              {defaultPath
                ? 'Start a terminal to get going.'
                : 'Choose a folder to get per-agent git isolation, or start a terminal right away and it’ll open in your home directory.'}
            </p>
            <div className="empty__actions">
              {!defaultPath && (
                <button className="empty__btn" onClick={() => void pickFolderForWorkspace(workspaceId)}>
                  Open a folder…
                </button>
              )}
              <button
                className={'empty__btn' + (defaultPath ? '' : ' empty__btn--ghost')}
                onClick={() => addAgent({ workspaceId })}
              >
                New terminal
              </button>
            </div>
          </div>
        </div>
      )}

      <Moveable
        ref={moveableRef}
        target={targets}
        dragTarget={dragTarget}
        rootContainer={stageEl ?? undefined}
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
          const ws = wsById(useStore.getState(), workspaceId)
          const list = ws?.agents ?? EMPTY_AGENTS
          const a = list.find((x) => x.id === id)
          if (!a) return
          const cur = list.findIndex((x) => x.id === id)
          const target = nearestSlotIndex(
            slotsOf(list, ws?.draggingId ?? null),
            t[0] + a.w / 2,
            t[1] + a.h / 2,
            cur
          )
          // nearestSlotIndex returns `cur` for "stay" — and it MUST stay a no-op.
          // Reordering on every move re-tiles the stage each frame: the other cards
          // never finish their reflow transition and the whole board vibrates.
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
          const list = wsById(useStore.getState(), workspaceId)?.agents ?? EMPTY_AGENTS
          const a = list.find((x) => x.id === idOf(e.target))
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
        dragContainer={stageEl ?? undefined}
        selectableTargets={['.vec-pane']}
        hitRate={0}
        selectByClick
        selectFromInside={false}
        toggleContinueSelect={['shift']}
        ratio={0}
        // Reject the gesture BEFORE it engages when the press starts inside a
        // terminal body (or its close button). onDragStart's e.stop() below only
        // aborts AFTER Selecto's arbitration has run, which could set xterm's
        // selection anchor late/wrong; dragCondition keeps the mousedown pristine so
        // xterm owns text selection and it lands exactly where pressed.
        dragCondition={(e: any) => {
          const t = e.inputEvent?.target as HTMLElement | undefined
          if (t?.closest?.('.vec-pane__term') || t?.closest?.('.vec-pane__close')) return false
          return true
        }}
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
          const ids = (e.selected as HTMLElement[]).map((el) => el.dataset.id!).filter(Boolean)
          setSelected(ids)
          // Hand keyboard focus to the active terminal so typing never dead-ends —
          // whether the click hit a pane (including RE-clicking the already-selected
          // one, which is a no-op selection change so the pane's own focus effect
          // won't re-fire) or landed on empty stage (selection preserved by the
          // store). Skip when this gesture is starting a drag-to-move — and when it
          // marquee-selected 2+ panes: the marquee's mousedown blurred the terminal,
          // so re-focusing here would fire the pane's onFocus, which collapses the
          // multi-selection back to that single pane — undoing the marquee the user
          // just drew and making a group drag impossible.
          if (!e.isDragStart && ids.length <= 1) {
            const cur = ids[0] ?? wsById(useStore.getState(), workspaceId)?.selectedIds[0]
            if (cur) terminals.get(cur)?.focus()
          }
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

// Memoized, and `workspaceId` is its only prop. mapWs already goes to the
// trouble of leaving untouched workspace objects reference-equal — its comment
// says "so only that workspace's Stage/panes re-render" — but that intent was
// lost without this: App re-renders on any store write, so every live
// workspace's Stage re-reconciled a <Moveable> and a <Selecto> each time, for
// workspaces where nothing had changed. TerminalPane was already memoized;
// this closes the gap above it.
export default memo(Stage)
