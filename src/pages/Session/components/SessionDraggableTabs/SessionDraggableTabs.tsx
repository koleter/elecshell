import React from 'react';
import type {DragEndEvent} from '@dnd-kit/core';
import {closestCenter, DndContext, PointerSensor, useSensor} from '@dnd-kit/core';
import {horizontalListSortingStrategy, SortableContext, useSortable,} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {Tabs} from 'antd';
import "./SessionDraggableTabs.css"

interface DraggableTabPaneProps extends React.HTMLAttributes<HTMLDivElement> {
    'data-node-key': string;
}

const SessionDraggableTabNode = ({ className, ...props }: DraggableTabPaneProps) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
        id: props['data-node-key'],
    });

    const style: React.CSSProperties = {
        ...props.style,
        transform: CSS.Translate.toString(transform),
        transition,
        cursor: 'move',
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

    const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 10 } });

    const handleDragEnd = (event: DragEndEvent) => {
        const {active, delta, activatorEvent} = event;
        // 拖拽到浏览器窗口外时,触发分离到新窗口
        const pointerEvent = activatorEvent as PointerEvent | undefined;
        if (onDetach && delta && pointerEvent && typeof pointerEvent.clientX === 'number') {
            const endX = pointerEvent.clientX + delta.x;
            const endY = pointerEvent.clientY + delta.y;
            const threshold = 50;
            const isOutside = (
                endX < -threshold ||
                endX > window.innerWidth + threshold ||
                endY < -threshold ||
                endY > window.innerHeight + threshold
            );
            if (isOutside) {
                onDetach(String(active.id));
                return;
            }
        }
        onDragEnd?.(event);
    };

    return (
        <Tabs
            {...rest}
            items={items}
            renderTabBar={(tabBarProps, DefaultTabBar) => (
                <DndContext sensors={[sensor]} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
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
    );
}

export default SessionDraggableTabs;
