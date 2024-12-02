import React, {useEffect, useState} from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { DndContext, PointerSensor, closestCenter, useSensor } from '@dnd-kit/core';
import {
    arrayMove,
    horizontalListSortingStrategy,
    SortableContext,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Tabs } from 'antd';
import "./DraggableTabs.css"

interface DraggableTabPaneProps extends React.HTMLAttributes<HTMLDivElement> {
    'data-node-key': string;
}

const DraggableTabNode = ({ className, ...props }: DraggableTabPaneProps) => {
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

const DraggableTabs = (props) => {
    const {items, onDragEnd} = props;

    const sensor = useSensor(PointerSensor, { activationConstraint: { distance: 10 } });

    return (
        <Tabs
            {...props}
            renderTabBar={(tabBarProps, DefaultTabBar) => (
                <DndContext sensors={[sensor]} onDragEnd={onDragEnd} collisionDetection={closestCenter}>
                    <SortableContext items={items.map((i) => i.key)} strategy={horizontalListSortingStrategy}>
                        <DefaultTabBar {...tabBarProps}>
                            {(node) => (
                                <DraggableTabNode {...node.props} key={node.key}>
                                    {node}
                                </DraggableTabNode>
                            )}
                        </DefaultTabBar>
                    </SortableContext>
                </DndContext>
            )}
        />
    );
}

export default DraggableTabs;
