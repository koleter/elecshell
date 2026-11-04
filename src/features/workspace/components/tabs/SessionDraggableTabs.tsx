import React from 'react';
import { horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Tabs, Tooltip } from 'antd';
import { CompressOutlined, ExpandOutlined } from '@ant-design/icons';
import './SessionDraggableTabs.css';

export interface SessionTabItem {
    key: string;
    label: React.ReactNode;
}

interface Props {
    groupId: string;
    items: SessionTabItem[];
    activeKey: string;
    onChange: (key: string) => void;
    onClose: (key: string) => void;
    onMaximize: () => void;
    canMaximize: boolean;
    maximized: boolean;
    maximizeLabel: string;
}

function DraggableTab({ node, groupId }: { node: React.ReactElement; groupId: string }) {
    const id = String(node.key);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting } =
        useSortable({
            id,
            data: { groupId },
            animateLayoutChanges: () => false,
        });
    return React.cloneElement(node, {
        ref: setNodeRef,
        ...attributes,
        ...listeners,
        'data-session-tab': id,
        style: {
            ...node.props.style,
            // 正在拖动的标签由 Workspace 的 DragOverlay 绘制；原节点只隐藏并保留占位。
            // 仅让其余标签执行排序位移，避免原节点变换导致预览的抓取位置跳动。
            transform: isSorting && !isDragging ? CSS.Translate.toString(transform) : undefined,
            transition: isSorting && !isDragging ? transition : undefined,
            opacity: isDragging ? 0 : 1,
            touchAction: 'none',
        },
    });
}

export default function SessionDraggableTabs(props: Props) {
    // 每个分组只渲染标签头，终端内容由 Workspace 统一挂载，跨组移动时不重新挂载。
    return (
        <Tabs
            className="session-group-tabs"
            type="editable-card"
            hideAdd
            activeKey={props.activeKey}
            items={props.items}
            onChange={props.onChange}
            onEdit={(key, action) => {
                if (action === 'remove' && typeof key === 'string') props.onClose(key);
            }}
            tabBarExtraContent={
                props.canMaximize && (
                    <Tooltip title={props.maximizeLabel}>
                        <Button
                            type="text"
                            size="small"
                            aria-label={props.maximizeLabel}
                            onClick={props.onMaximize}
                            icon={props.maximized ? <CompressOutlined /> : <ExpandOutlined />}
                        />
                    </Tooltip>
                )
            }
            renderTabBar={(tabBarProps, DefaultTabBar) => (
                <SortableContext
                    items={props.items.map((item) => item.key)}
                    strategy={horizontalListSortingStrategy}
                >
                    <DefaultTabBar {...tabBarProps}>
                        {(node) => (
                            <DraggableTab key={node.key} node={node} groupId={props.groupId} />
                        )}
                    </DefaultTabBar>
                </SortableContext>
            )}
        />
    );
}
