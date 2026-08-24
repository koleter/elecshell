import React, {useCallback, useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import type {DragEndEvent, DragMoveEvent, DragStartEvent} from '@dnd-kit/core';
import {closestCenter, DndContext, PointerSensor, useSensor} from '@dnd-kit/core';
import {horizontalListSortingStrategy, SortableContext, useSortable,} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {Tabs} from 'antd';
import "./SessionDraggableTabs.css"

interface DraggableTabPaneProps extends React.HTMLAttributes<HTMLDivElement> {
    'data-node-key': string;
}

const SessionDraggableTabNode = ({ className, ...props }: DraggableTabPaneProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: props['data-node-key'],
    });

    const style: React.CSSProperties = {
        ...props.style,
        transform: CSS.Translate.toString(transform),
        transition,
        cursor: 'move',
        position: 'relative' as const,
        zIndex: isDragging ? 999999 : undefined,
        opacity: isDragging ? 0 : 1,
    };

    return React.cloneElement(props.children as React.ReactElement, {
        ref: setNodeRef,
        style,
        ...attributes,
        ...listeners,
    });
};

interface SessionDraggableTabsProps {
    items: any[];
    onDragEnd?: (event: DragEndEvent) => void;
    onDetach?: (key: string) => void;
    [key: string]: any;
}

function extractPlainLabel(activeItem: any): string {
    if (!activeItem) return '';
    const label = activeItem.label;
    if (typeof label === 'string') return label;
    try {
        if (React.isValidElement(label)) {
            const el = label as any;
            if (el.props && typeof el.props.children === 'string') return el.props.children;
            const walkStack: any[] = [el.props?.children];
            while (walkStack.length) {
                const cur = walkStack.pop();
                if (typeof cur === 'string') return cur;
                if (Array.isArray(cur)) walkStack.push(...cur);
                else if (React.isValidElement(cur)) walkStack.push((cur as any).props?.children);
            }
        }
    } catch (e) {}
    return activeItem.key || '';
}

const SessionDraggableTabs = (props: SessionDraggableTabsProps) => {
    const {items, onDragEnd, onDetach, ...rest} = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const overlayRootRef = useRef<HTMLDivElement | null>(null);
    const domOverlayRef = useRef<HTMLDivElement | null>(null);
    const overlayOffsetRef = useRef<{ dx: number; dy: number }>({ dx: -40, dy: -14 });

    const [activeId, setActiveId] = useState<string | null>(null);
    const [isOutsideTabs, setIsOutsideTabs] = useState(false);
    const [pointerLeftWindow, setPointerLeftWindow] = useState(false);
    const [nearWindowEdge, setNearWindowEdge] = useState(false);
    const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);
    const [usingNativeOverlay, setUsingNativeOverlay] = useState(false);

    const pendingDetachRef = useRef<string | null>(null);
    const dragActiveRef = useRef(false);
    // 存储拖拽开始时的位置
    const lastPosRef = useRef<{ x: number; y: number } | null>(null);
    const EDGE_SWITCH_THRESHOLD = 30;

    const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 10 } });

    useEffect(() => {
        if (!overlayRootRef.current) {
            overlayRootRef.current = document.createElement('div');
            overlayRootRef.current.style.position = 'fixed';
            overlayRootRef.current.style.top = '0';
            overlayRootRef.current.style.left = '0';
            overlayRootRef.current.style.width = '0';
            overlayRootRef.current.style.height = '0';
            overlayRootRef.current.style.pointerEvents = 'none';
            overlayRootRef.current.style.zIndex = '999998';
            overlayRootRef.current.style.overflow = 'visible';
            document.body.appendChild(overlayRootRef.current);
        }
        return () => {
            if (overlayRootRef.current) {
                document.body.removeChild(overlayRootRef.current);
                overlayRootRef.current = null;
            }
        };
    }, []);

    const updateOverlayPos = useCallback((clientX: number, clientY: number) => {
        const x = Math.max(0, Math.min(window.innerWidth - 8, clientX + overlayOffsetRef.current.dx));
        const y = Math.max(0, Math.min(window.innerHeight - 8, clientY + overlayOffsetRef.current.dy));
        setOverlayPos({ x, y });
        lastPosRef.current = { x: clientX, y: clientY };
    }, []);

    const tryHideNativeOverlay = useCallback(async () => {
        try {
            if (window.electronAPI?.hideDragOverlay) {
                await window.electronAPI.hideDragOverlay();
            }
        } catch (e) {}
        setUsingNativeOverlay(false);
    }, []);

    const tryDetachNow = useCallback((sessionKey: string) => {
        if (!onDetach || !dragActiveRef.current) return;
        pendingDetachRef.current = sessionKey;
        dragActiveRef.current = false;
        setActiveId(null);
        setIsOutsideTabs(false);
        setPointerLeftWindow(false);
        setOverlayPos(null);
        tryHideNativeOverlay();
        onDetach(sessionKey);
    }, [onDetach, tryHideNativeOverlay]);

    const captureOverlaySnapshot = useCallback(() => {
        const el = domOverlayRef.current;
        if (!el) return undefined;
        const rect = el.getBoundingClientRect();
        const labelText = extractPlainLabel(activeId ? items.find(i => String(i.key) === activeId) : undefined);
        const activeItem = activeId ? items.find(i => String(i.key) === activeId) : undefined;
        const outside = isOutsideTabs || pointerLeftWindow || nearWindowEdge;
        return {
            label: labelText,
            connected: !!(activeItem as any)?.isConnected,
            outside,
            pointerLeft: !!pointerLeftWindow,
            width: Math.max(120, Math.ceil(rect.width) + 8),
            height: Math.max(56, Math.ceil(rect.height) + 40),
            padding: '8px 16px',
            background: outside ? '#fff1f0' : '#ffffff',
            border: `2px solid ${outside ? '#ff4d4f' : '#1890ff'}`,
            borderRadius: '4px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            opacity: 0.98,
            scale: pointerLeftWindow ? 1.04 : (outside ? 1.02 : 1),
        };
    }, [activeId, items, isOutsideTabs, pointerLeftWindow, nearWindowEdge]);

    const switchToNativeOverlay = useCallback(async (activeItem: any, outside: boolean) => {
        if (!window.electronAPI?.showDragOverlay) return;
        try {
            const lp = lastPosRef.current || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            const snap = captureOverlaySnapshot();
            await window.electronAPI.showDragOverlay({
                snapshot: snap,
                label: extractPlainLabel(activeItem),
                connected: !!activeItem?.isConnected,
                outside,
                clientX: lp.x,
                clientY: lp.y,
                offsetX: overlayOffsetRef.current.dx,
                offsetY: overlayOffsetRef.current.dy,
            });
            setUsingNativeOverlay(true);
            setOverlayPos(null);
        } catch (e) {
            console.error('show native overlay failed', e);
        }
    }, [captureOverlaySnapshot]);

    useEffect(() => {
        const onDocMouseMove = (e: MouseEvent) => {
            if (!dragActiveRef.current) return;
            if (!usingNativeOverlay) {
                updateOverlayPos(e.clientX, e.clientY);
            }

            if (containerRef.current && onDetach) {
                const rect = containerRef.current.getBoundingClientRect();
                const outside = (
                    e.clientX < rect.left ||
                    e.clientX > rect.right ||
                    e.clientY < rect.top ||
                    e.clientY > rect.bottom
                );
                setIsOutsideTabs(outside);
            }

            const t = EDGE_SWITCH_THRESHOLD;
            const near = (
                e.clientX < t ||
                e.clientX > window.innerWidth - t ||
                e.clientY < t ||
                e.clientY > window.innerHeight - t
            );
            setNearWindowEdge(near);
        };

        const onDocMouseLeave = () => {
            if (!dragActiveRef.current || !activeId) return;
            setPointerLeftWindow(true);
        };
        const onDocMouseEnter = () => {
            if (!dragActiveRef.current) return;
            setPointerLeftWindow(false);
            setNearWindowEdge(false);
            pendingDetachRef.current = null;
        };

        const onWindowBlur = () => {
            if (dragActiveRef.current && activeId && pendingDetachRef.current == null) {
                pendingDetachRef.current = activeId;
            }
        };

        const onMouseOut = (e: MouseEvent) => {
            if (e.relatedTarget == null && e.target instanceof Node && document.contains(e.target)) {
                onDocMouseLeave();
            }
        };
        const onMouseOver = (e: MouseEvent) => {
            if (e.relatedTarget == null) {
                onDocMouseEnter();
            }
        };

        document.addEventListener('mousemove', onDocMouseMove, true);
        window.addEventListener('mouseout', onMouseOut);
        window.addEventListener('mouseover', onMouseOver);
        window.addEventListener('blur', onWindowBlur);
        return () => {
            document.removeEventListener('mousemove', onDocMouseMove, true);
            window.removeEventListener('mouseout', onMouseOut);
            window.removeEventListener('mouseover', onMouseOver);
            window.removeEventListener('blur', onWindowBlur);
        };
    }, [activeId, onDetach, updateOverlayPos, usingNativeOverlay]);

    useEffect(() => {
        if (!dragActiveRef.current || !activeId) return;
        const activeItem = items.find(it => String(it.key) === activeId);
        if (!activeItem) return;

        const shouldUseNative = (nearWindowEdge || pointerLeftWindow) && !!window.electronAPI?.showDragOverlay;

        if (shouldUseNative && !usingNativeOverlay) {
            switchToNativeOverlay(activeItem, isOutsideTabs || pointerLeftWindow || nearWindowEdge);
        } else if (!shouldUseNative && usingNativeOverlay) {
            tryHideNativeOverlay();
            if (lastPosRef.current) {
                updateOverlayPos(lastPosRef.current.x, lastPosRef.current.y);
            }
        } else if (usingNativeOverlay && window.electronAPI?.updateDragOverlayData) {
            window.electronAPI.updateDragOverlayData({
                snapshot: captureOverlaySnapshot(),
                label: extractPlainLabel(activeItem),
                connected: !!activeItem.isConnected,
                outside: isOutsideTabs || pointerLeftWindow || nearWindowEdge,
            });
        }
    }, [pointerLeftWindow, nearWindowEdge, usingNativeOverlay, isOutsideTabs, activeId, items, switchToNativeOverlay, tryHideNativeOverlay, updateOverlayPos, captureOverlaySnapshot]);

    useEffect(() => {
        return () => {
            tryHideNativeOverlay();
        };
    }, [tryHideNativeOverlay]);

    const handleDragStart = (event: DragStartEvent) => {
        const id = String(event.active.id);
        const pe = (event as any).activatorEvent as PointerEvent | undefined;
        let cx = 0, cy = 0;
        if (pe && typeof pe.clientX === 'number') {
            cx = pe.clientX;
            cy = pe.clientY;
        }
        dragActiveRef.current = true;
        pendingDetachRef.current = null;
        lastPosRef.current = { x: cx, y: cy };
        setActiveId(id);
        setIsOutsideTabs(false);
        setPointerLeftWindow(false);
        setNearWindowEdge(false);
        setUsingNativeOverlay(false);
        updateOverlayPos(cx, cy);
    };

    const handleDragMove = (event: DragMoveEvent) => {
        const {activatorEvent, delta} = event;
        const pointerEvent = activatorEvent as PointerEvent | undefined;
        if (!pointerEvent || typeof pointerEvent.clientX !== 'number') return;
        const currentX = pointerEvent.clientX + delta.x;
        const currentY = pointerEvent.clientY + delta.y;
        lastPosRef.current = { x: currentX, y: currentY };
        if (!usingNativeOverlay) {
            updateOverlayPos(currentX, currentY);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const {active, activatorEvent, delta} = event;
        const id = String(active.id);
        let shouldDetach = false;

        if (pendingDetachRef.current === id) {
            shouldDetach = true;
        }
        if (!shouldDetach && onDetach && (pointerLeftWindow || usingNativeOverlay)) {
            shouldDetach = true;
        }
        if (!shouldDetach && onDetach && containerRef.current) {
            const pointerEvent = activatorEvent as PointerEvent | undefined;
            if (pointerEvent && typeof pointerEvent.clientX === 'number') {
                const rect = containerRef.current.getBoundingClientRect();
                const endX = pointerEvent.clientX + delta.x;
                const endY = pointerEvent.clientY + delta.y;
                shouldDetach = (
                    endX < rect.left ||
                    endX > rect.right ||
                    endY < rect.top ||
                    endY > rect.bottom
                );
                if (!shouldDetach) {
                    const edgeThreshold = 2;
                    if (
                        endX < edgeThreshold ||
                        endX > window.innerWidth - edgeThreshold ||
                        endY < edgeThreshold ||
                        endY > window.innerHeight - edgeThreshold
                    ) {
                        shouldDetach = true;
                    }
                }
            }
        }

        dragActiveRef.current = false;
        pendingDetachRef.current = null;
        lastPosRef.current = null;
        setActiveId(null);
        setIsOutsideTabs(false);
        setPointerLeftWindow(false);
        setNearWindowEdge(false);
        setOverlayPos(null);
        tryHideNativeOverlay();

        if (shouldDetach && onDetach) {
            onDetach(id);
            return;
        }
        onDragEnd?.(event);
    };

    const handleDragCancel = () => {
        if (dragActiveRef.current && activeId && (pendingDetachRef.current === activeId || pointerLeftWindow || usingNativeOverlay)) {
            tryDetachNow(activeId);
            return;
        }
        dragActiveRef.current = false;
        pendingDetachRef.current = null;
        lastPosRef.current = null;
        setActiveId(null);
        setIsOutsideTabs(false);
        setPointerLeftWindow(false);
        setNearWindowEdge(false);
        setOverlayPos(null);
        tryHideNativeOverlay();
    };

    const activeItem = items.find(item => String(item.key) === activeId);
    const showCustomOverlay = !!(activeId && activeItem && overlayPos && !usingNativeOverlay);

    const customOverlay = showCustomOverlay ? (
        <div
            ref={domOverlayRef}
            style={{
                position: 'fixed',
                left: overlayPos!.x,
                top: overlayPos!.y,
                background: (isOutsideTabs || pointerLeftWindow || nearWindowEdge) ? '#fff1f0' : '#fff',
                border: `2px solid ${(isOutsideTabs || pointerLeftWindow || nearWindowEdge) ? '#ff4d4f' : '#1890ff'}`,
                borderRadius: '4px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                cursor: 'move',
                opacity: 0.98,
                userSelect: 'none',
                transform: pointerLeftWindow ? 'scale(1.04)' : ((isOutsideTabs || nearWindowEdge) ? 'scale(1.02)' : 'scale(1)'),
                transition: 'transform 0.08s ease-out, background-color 0.12s ease-out, border-color 0.12s ease-out',
                pointerEvents: 'none',
                zIndex: 999999,
                whiteSpace: 'nowrap',
            }}
        >
            {typeof activeItem!.label === 'object'
                ? React.cloneElement(activeItem!.label as React.ReactElement, {style: {padding: 0, display: 'inline-block'}})
                : activeItem!.label}
            {(isOutsideTabs || pointerLeftWindow || nearWindowEdge) && (
                <div style={{
                    position: 'absolute',
                    top: '-28px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#ff4d4f',
                    color: 'white',
                    padding: '2px 10px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(255,77,79,0.4)',
                }}>
                </div>
            )}
        </div>
    ) : null;

    return (
        <div ref={containerRef} style={{height: '100%', position: 'relative'}}>
            <Tabs
                {...rest}
                items={items}
                renderTabBar={(tabBarProps, DefaultTabBar) => (
                    <DndContext
                        sensors={[sensor]}
                        onDragStart={handleDragStart}
                        onDragMove={handleDragMove}
                        onDragEnd={handleDragEnd}
                        onDragCancel={handleDragCancel}
                        collisionDetection={closestCenter}
                    >
                        <SortableContext items={items.map((i) => i.key)} strategy={horizontalListSortingStrategy}>
                            <DefaultTabBar {...tabBarProps}>
                                {(node) => (
                                    <SessionDraggableTabNode {...node.props} key={node.key} style={{padding: '8px 16px'}}>
                                        {node}
                                    </SessionDraggableTabNode>
                                )}
                            </DefaultTabBar>
                        </SortableContext>
                    </DndContext>
                )}
            />
            {overlayRootRef.current && ReactDOM.createPortal(customOverlay, overlayRootRef.current)}
        </div>
    );
}

export default SessionDraggableTabs;
