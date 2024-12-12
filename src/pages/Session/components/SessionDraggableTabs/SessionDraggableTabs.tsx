import React from 'react';
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

const SessionDraggableTabs = (props) => {
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
