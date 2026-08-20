import React, {useRef, useState} from 'react';
import type {DragEndEvent, DragMoveEvent, DragStartEvent} from '@dnd-kit/core';
import {closestCenter, DndContext, DragOverlay, PointerSensor, useSensor} from '@dnd-kit/core';
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
        opacity: isDragging ? 0.5 : 1,
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

const SessionDraggableTabs = (props: SessionDraggableTabsProps) => {
    const {items, onDragEnd, onDetach, ...rest} = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isOutside, setIsOutside] = useState(false);

    const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 10 } });

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(String(event.active.id));
        setIsOutside(false);
    };

    const handleDragMove = (event: DragMoveEvent) => {
        if (!containerRef.current || !onDetach) return;
        const {activatorEvent, delta} = event;
        const pointerEvent = activatorEvent as PointerEvent | undefined;
        if (!pointerEvent || typeof pointerEvent.clientX !== 'number') return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const currentX = pointerEvent.clientX + delta.x;
        const currentY = pointerEvent.clientY + delta.y;
        const outside = (
            currentX < containerRect.left ||
            currentX > containerRect.right ||
            currentY < containerRect.top ||
            currentY > containerRect.bottom
        );
        setIsOutside(outside);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const {active, activatorEvent, delta} = event;
        let shouldDetach = isOutside && onDetach;

        if (!shouldDetach && onDetach && containerRef.current) {
            const pointerEvent = activatorEvent as PointerEvent | undefined;
            if (pointerEvent && typeof pointerEvent.clientX === 'number') {
                const containerRect = containerRef.current.getBoundingClientRect();
                const endX = pointerEvent.clientX + delta.x;
                const endY = pointerEvent.clientY + delta.y;
                shouldDetach = (
                    endX < containerRect.left ||
                    endX > containerRect.right ||
                    endY < containerRect.top ||
                    endY > containerRect.bottom
                );
            }
        }

        setActiveId(null);
        setIsOutside(false);

        if (shouldDetach && onDetach) {
            onDetach(String(active.id));
            return;
        }
        onDragEnd?.(event);
    };

    const handleDragCancel = () => {
        setActiveId(null);
        setIsOutside(false);
    };

    const activeItem = items.find(item => String(item.key) === activeId);

    return (
        <div ref={containerRef} style={{height: '100%'}}>
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
                        <DragOverlay
                            zIndex={999999}
                            dropAnimation={null}
                        >
                            {activeId && activeItem ? (
                                <div
                                    style={{
                                        padding: '8px 16px',
                                        background: '#fff',
                                        border: `2px solid ${isOutside ? '#ff4d4f' : '#1890ff'}`,
                                        borderRadius: '4px',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                                        cursor: 'move',
                                        opacity: 0.95,
                                        userSelect: 'none',
                                    }}
                                >
                                    {typeof activeItem.label === 'object'
                                        ? React.cloneElement(activeItem.label as React.ReactElement, {style: {padding: 0}})
                                        : activeItem.label}
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}
            />
        </div>
    );
}

export default SessionDraggableTabs;
