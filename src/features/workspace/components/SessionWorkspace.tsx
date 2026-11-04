import type { TerminalSession } from '../../sessions/model/types';
import { desktop } from '../../../platform/electronBridge';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode } from 'react';
import ReactDOM from 'react-dom';
import { DndContext, DragOverlay, pointerWithin, useSensor } from '@dnd-kit/core';
import type { DragStartEvent } from '@dnd-kit/core';
import SessionDraggableTabs from './tabs/SessionDraggableTabs';
import TabPointerSensor from './TabPointerSensor';
import {
    canSplit,
    constrainRatio,
    dropPosition,
    getGroups,
    measureLayout,
    splitDestination,
    SPLITTER_SIZE,
    TAB_BAR_HEIGHT,
} from '../model/layout';
import type {
    DropPosition,
    PaneRect,
    Rect,
    SplitterRect,
    WorkspaceAction,
    WorkspaceState,
} from '../model/layout';
import './SessionWorkspace.less';

export interface WorkspaceLabels {
    maximize: string;
    restore: string;
    resize: string;
    tooSmall: string;
    positions: Record<DropPosition, string>;
}

interface Props {
    state: WorkspaceState;
    dispatch: Dispatch<WorkspaceAction>;
    renderLabel: (session: TerminalSession) => ReactNode;
    renderSession: (session: TerminalSession, visible: boolean, focused: boolean) => ReactNode;
    onClose: (sessionId: string) => void;
    onDetach: (sessionId: string) => void;
    labels: WorkspaceLabels;
}

interface Point {
    x: number;
    y: number;
}
interface DropTarget {
    pane: PaneRect;
    position: DropPosition;
    index?: number;
    allowed: boolean;
}

// 指针在同一落点区域内移动时，预览没有变化，无需重复渲染所有标签与终端容器。
function sameTarget(first: DropTarget | null, second: DropTarget | null): boolean {
    if (!first || !second) return first === second;
    return (
        first.position === second.position &&
        first.index === second.index &&
        first.allowed === second.allowed &&
        first.pane.group.id === second.pane.group.id &&
        first.pane.group.tabs.length === second.pane.group.tabs.length &&
        first.pane.x === second.pane.x &&
        first.pane.y === second.pane.y &&
        first.pane.width === second.pane.width &&
        first.pane.height === second.pane.height
    );
}

function positionStyle(rect: Rect): React.CSSProperties {
    return {
        left: rect.x,
        top: rect.y,
        width: Math.max(0, rect.width),
        height: Math.max(0, rect.height),
    };
}

// 预览展示松手后的占用范围：排序覆盖标签栏，合并覆盖内容区，分屏覆盖新增的一半。
function previewRect(target: DropTarget): Rect {
    const { pane, position } = target;
    const tabBarHeight = pane.group.tabs.length ? TAB_BAR_HEIGHT : 0;
    if (position === 'tabs') return { ...pane, height: TAB_BAR_HEIGHT };
    if (position === 'center')
        return { ...pane, y: pane.y + tabBarHeight, height: pane.height - tabBarHeight };
    const horizontal = position === 'left' || position === 'right';
    const size = ((horizontal ? pane.width : pane.height) - SPLITTER_SIZE) / 2;
    return {
        ...pane,
        x: pane.x + (position === 'right' ? size + SPLITTER_SIZE : 0),
        y: pane.y + (position === 'bottom' ? size + SPLITTER_SIZE : 0),
        width: horizontal ? size : pane.width,
        height: horizontal ? pane.height : size,
    };
}

function Splitter({
    rect,
    dispatch,
    label,
}: {
    rect: SplitterRect;
    dispatch: Dispatch<WorkspaceAction>;
    label: string;
}) {
    const gesture = useRef<{ origin: DOMRect; pointerId: number } | null>(null);
    const horizontal = rect.node.axis === 'x';
    const resize = (ratio: number) =>
        dispatch({
            type: 'resize',
            splitId: rect.node.id,
            ratio: constrainRatio(rect.node, rect.container, ratio),
        });
    return (
        <div
            className={`session-splitter session-splitter--${rect.node.axis}`}
            style={positionStyle(rect)}
            data-split-id={rect.node.id}
            role="separator"
            aria-label={label}
            aria-orientation={horizontal ? 'vertical' : 'horizontal'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
                constrainRatio(rect.node, rect.container, rect.node.ratio) * 100,
            )}
            onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                gesture.current = {
                    origin: event.currentTarget.parentElement!.getBoundingClientRect(),
                    pointerId: event.pointerId,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
                if (!gesture.current || gesture.current.pointerId !== event.pointerId) return;
                const origin = gesture.current.origin;
                // 嵌套分隔条的比例相对于所属子树计算，需同时扣除工作区和子树的坐标偏移。
                const offset = horizontal
                    ? event.clientX - origin.left - rect.container.x
                    : event.clientY - origin.top - rect.container.y;
                const available =
                    (horizontal ? rect.container.width : rect.container.height) - SPLITTER_SIZE;
                if (available > 0) resize(offset / available);
            }}
            onPointerUp={(event) => {
                gesture.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onLostPointerCapture={() => {
                gesture.current = null;
            }}
            onDoubleClick={() => resize(0.5)}
        />
    );
}

export default function SessionWorkspace(props: Props) {
    const { state, dispatch, labels } = props;
    const rootRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [pointerOutside, setPointerOutside] = useState(false);
    const [target, setTarget] = useState<DropTarget | null>(null);
    // 高频指针事件读取 ref 中的即时值，React state 只负责驱动预览显示。
    const dragRef = useRef<{ id: string; point: Point } | null>(null);
    const lastPointer = useRef<Point>({ x: 0, y: 0 });
    const nativeOverlayWanted = useRef(false);
    const nativeQueue = useRef<Promise<unknown>>(Promise.resolve());
    const groups = useMemo(() => getGroups(state.root), [state.root]);
    const geometry = useMemo(
        () => measureLayout(state.root, { x: 0, y: 0, ...size }, state.maximizedGroupId),
        [state.root, state.maximizedGroupId, size],
    );
    const sessionMap = useMemo(
        () => new Map(state.sessions.map((session) => [session.key, session])),
        [state.sessions],
    );
    const paneBySession = useMemo(() => {
        const panes = new Map<string, PaneRect>();
        geometry.panes.forEach((pane) => pane.group.tabs.forEach((id) => panes.set(id, pane)));
        return panes;
    }, [geometry]);
    // 传感器和异步 IPC 使用稳定回调，通过 ref 获取最新布局，避免闭包读取过期状态。
    const latest = useRef({ props, geometry });
    latest.current = { props, geometry };

    useLayoutEffect(() => {
        const element = rootRef.current!;
        let frame = 0;
        const measure = () =>
            setSize((previous) => {
                const width = element.clientWidth;
                const height = element.clientHeight;
                return width === previous.width && height === previous.height
                    ? previous
                    : { width, height };
            });
        measure();
        // 合并同一帧内的多次尺寸通知，侧边栏和分隔条变化都能更新分屏坐标。
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        });
        observer.observe(element);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, []);

    const syncNativeOverlay = useCallback((outside: boolean) => {
        if (nativeOverlayWanted.current === outside) return;
        nativeOverlayWanted.current = outside;
        const api = desktop;
        // 串行发送原生浮层的显示/隐藏请求，避免较晚返回的 IPC 留下悬浮窗口。
        nativeQueue.current = nativeQueue.current
            .catch(() => undefined)
            .then(async () => {
                const drag = dragRef.current;
                if (nativeOverlayWanted.current && drag) {
                    const session = latest.current.props.state.sessions.find(
                        (item) => item.key === drag.id,
                    );
                    await api.showDragOverlay({
                        label: session?.label || drag.id,
                        connected: !!session?.isConnected,
                        outside: true,
                        clientX: drag.point.x,
                        clientY: drag.point.y,
                        offsetX: -40,
                        offsetY: -14,
                    });
                    if (!nativeOverlayWanted.current || !dragRef.current)
                        await api.hideDragOverlay();
                } else {
                    await api.hideDragOverlay();
                }
            })
            .catch(() => undefined);
    }, []);

    const findTarget = useCallback((client: Point): DropTarget | null => {
        const bounds = rootRef.current?.getBoundingClientRect();
        if (
            !bounds ||
            client.x < bounds.left ||
            client.x > bounds.right ||
            client.y < bounds.top ||
            client.y > bounds.bottom
        )
            return null;
        // 统一转换为工作区坐标，不能直接拿浏览器坐标与嵌套分屏的局部矩形比较。
        const local = { x: client.x - bounds.left, y: client.y - bounds.top };
        const { panes } = latest.current.geometry;
        // 分隔条间隙归属最近的分屏，避免鼠标经过分隔条时预览消失。
        // 单次遍历查找最近分屏，避免每次 pointermove 都复制并排序全部分屏。
        let pane: PaneRect | undefined;
        let nearest = Infinity;
        for (const candidate of panes) {
            const dx = Math.max(candidate.x - local.x, 0, local.x - candidate.x - candidate.width);
            const dy = Math.max(candidate.y - local.y, 0, local.y - candidate.y - candidate.height);
            const distance = dx * dx + dy * dy;
            if (distance < nearest) {
                pane = candidate;
                nearest = distance;
                if (!distance) break;
            }
        }
        if (!pane) return null;
        let position: DropPosition = pane.group.tabs.length ? dropPosition(local, pane) : 'center';
        // 唯一标签拖回自身内容区只激活原组，不能切出没有会话的空白兄弟组。
        if (
            pane.group.tabs.length === 1 &&
            pane.group.tabs[0] === dragRef.current?.id &&
            position !== 'tabs'
        )
            position = 'center';
        let index: number | undefined;
        if (position === 'tabs') {
            const groupElement = rootRef.current!.querySelector<HTMLElement>(
                `[data-group-id="${pane.group.id}"]`,
            );
            const tabs = Array.from(
                groupElement?.querySelectorAll<HTMLElement>('[data-session-tab]') || [],
            );
            // 以标签中点作为插入边界，使向左、向右排序与跨组插入使用相同规则。
            index = tabs.findIndex((tab) => {
                const rect = tab.getBoundingClientRect();
                return client.x < rect.left + rect.width / 2;
            });
            if (index < 0) index = pane.group.tabs.length;
        }
        // 源组移空后目标可能扩展，预览大小和最小尺寸判断都使用收起空组后的矩形。
        const destination =
            position !== 'tabs' && position !== 'center' && dragRef.current
                ? splitDestination(latest.current.props.state, dragRef.current.id, pane.group.id, {
                      x: 0,
                      y: 0,
                      width: bounds.width,
                      height: bounds.height,
                  }) || pane
                : pane;
        return { pane: destination, position, index, allowed: canSplit(destination, position) };
    }, []);

    const updatePosition = useCallback(
        (position: Point) => {
            lastPointer.current = position;
            if (!dragRef.current) return;
            dragRef.current.point = position;
            const nextTarget = findTarget(position);
            setTarget((previous) => (sameTarget(previous, nextTarget) ? previous : nextTarget));
            // 原生浮层只在离开整个窗口时出现；窗口内（包括侧边栏）仍使用 DOM 拖拽浮层。
            const outside =
                position.x < 0 ||
                position.y < 0 ||
                position.x >= window.innerWidth ||
                position.y >= window.innerHeight;
            setPointerOutside(outside);
            syncNativeOverlay(outside);
        },
        [findTarget, syncNativeOverlay],
    );
    const sensor = useSensor(TabPointerSensor, {
        activationConstraint: { distance: 10 },
        onPosition: updatePosition,
    });

    const clearDrag = useCallback(() => {
        dragRef.current = null;
        setDraggingId(null);
        setPointerOutside(false);
        setTarget(null);
        syncNativeOverlay(false);
    }, [syncNativeOverlay]);

    useLayoutEffect(
        () => () => {
            dragRef.current = null;
            syncNativeOverlay(false);
        },
        [syncNativeOverlay],
    );

    const onDragStart = (event: DragStartEvent) => {
        const position = lastPointer.current;
        dragRef.current = { id: String(event.active.id), point: position };
        setDraggingId(String(event.active.id));
        updatePosition(position);
    };

    const onDragEnd = () => {
        const drag = dragRef.current;
        if (!drag) return;
        // 以松手位置重新判断目标；拖动中只更新预览，直到这里才提交一次布局变更。
        const drop = findTarget(drag.point);
        clearDrag();
        if (drop) {
            if (drop.allowed)
                dispatch({
                    type: 'move',
                    sessionId: drag.id,
                    groupId: drop.pane.group.id,
                    position: drop.position,
                    index: drop.index,
                });
        } else {
            // 工作区外（包括侧边栏）松手沿用拖出独立窗口的行为。
            props.onDetach(drag.id);
        }
    };

    const focusGroup = (groupId: string) => {
        if (groupId !== state.focusedGroupId) dispatch({ type: 'focus', groupId });
    };
    const activeId = groups.find((group) => group.id === state.focusedGroupId)?.activeTabId || '';
    const dragSession = draggingId ? sessionMap.get(draggingId) : undefined;
    const canMaximize = groups.length > 1;

    // 所有标签组共享拖拽上下文，支持同组排序和跨组移动。
    return (
        <DndContext
            sensors={[sensor]}
            collisionDetection={pointerWithin}
            autoScroll={{ canScroll: (element) => element !== document.scrollingElement }}
            accessibility={{ restoreFocus: false }}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={clearDrag}
        >
            <div
                ref={rootRef}
                className={`session-workspace${draggingId ? ' session-workspace--dragging' : ''}`}
            >
                {geometry.panes.map((pane) => (
                    <div
                        key={pane.group.id}
                        data-group-id={pane.group.id}
                        className={`session-group${
                            pane.group.tabs.length ? '' : ' session-group--empty'
                        }${
                            state.focusedGroupId === pane.group.id ? ' session-group--focused' : ''
                        }`}
                        style={positionStyle(pane)}
                        onPointerDownCapture={() => focusGroup(pane.group.id)}
                    >
                        {/* 空工作区不渲染标签栏，保留完整的白色背景。 */}
                        {!!pane.group.tabs.length && (
                            <SessionDraggableTabs
                                groupId={pane.group.id}
                                items={pane.group.tabs
                                    .map((id) => sessionMap.get(id))
                                    .filter((session): session is TerminalSession => !!session)
                                    .map((session) => ({
                                        key: session.key,
                                        label: props.renderLabel(session),
                                    }))}
                                activeKey={pane.group.activeTabId || ''}
                                onChange={(sessionId) => dispatch({ type: 'activate', sessionId })}
                                onClose={props.onClose}
                                onMaximize={() =>
                                    dispatch({ type: 'maximize', groupId: pane.group.id })
                                }
                                canMaximize={canMaximize}
                                maximized={!!state.maximizedGroupId}
                                maximizeLabel={
                                    state.maximizedGroupId ? labels.restore : labels.maximize
                                }
                            />
                        )}
                    </div>
                ))}

                {/* 终端始终是同一父节点下的稳定兄弟节点；移动时只改坐标和显隐，保留连接与缓冲区。 */}
                <div className="session-terminal-instances">
                    {state.sessions.map((session) => {
                        const pane = paneBySession.get(session.key);
                        const visible = !!pane && pane.group.activeTabId === session.key;
                        return (
                            <div
                                key={session.key}
                                data-terminal-session={session.key}
                                className="session-terminal-viewport"
                                style={{
                                    ...positionStyle(
                                        pane
                                            ? {
                                                  ...pane,
                                                  y: pane.y + TAB_BAR_HEIGHT,
                                                  height: pane.height - TAB_BAR_HEIGHT,
                                              }
                                            : { x: 0, y: 0, width: 0, height: 0 },
                                    ),
                                    display: visible ? 'block' : 'none',
                                }}
                                onPointerDownCapture={() => pane && focusGroup(pane.group.id)}
                                onFocusCapture={() => pane && focusGroup(pane.group.id)}
                            >
                                {props.renderSession(
                                    session,
                                    visible,
                                    visible && activeId === session.key,
                                )}
                            </div>
                        );
                    })}
                </div>
                {/* 无会话时不显示分隔条，避免空白工作区残留黑线。 */}
                {state.sessions.length > 0 &&
                    geometry.splitters.map((rect) => (
                        <Splitter
                            key={rect.node.id}
                            rect={rect}
                            dispatch={dispatch}
                            label={labels.resize}
                        />
                    ))}
                {draggingId && target && (
                    <div
                        className={`session-drop-preview${
                            target.allowed ? '' : ' session-drop-preview--blocked'
                        }`}
                        style={positionStyle(previewRect(target))}
                    >
                        <span>
                            {target.allowed ? labels.positions[target.position] : labels.tooSmall}
                        </span>
                    </div>
                )}
            </div>
            {/* 浮层挂到 body 避免被分屏裁切；由 dnd-kit 保留抓取偏移，不再自行叠加鼠标偏移。 */}
            {ReactDOM.createPortal(
                <DragOverlay dropAnimation={null} zIndex={999999}>
                    {dragSession && !pointerOutside && (
                        <div className="session-workspace-drag-label" aria-hidden="true">
                            <span className="session-workspace-drag-text">{dragSession.label}</span>
                            <span
                                className={`session-tab-status${
                                    dragSession.isConnected ? ' session-tab-status--connected' : ''
                                }`}
                            />
                        </div>
                    )}
                </DragOverlay>,
                document.body,
            )}
        </DndContext>
    );
}
