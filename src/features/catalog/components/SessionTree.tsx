import React from 'react';
import { Dropdown, Tree } from 'antd';
import type { MenuProps } from 'antd';
import type { TreeProps } from 'antd/es/tree';
import type { SessionTreeNode } from '../model/types';

interface Props {
    treeData: SessionTreeNode[];
    visible: boolean;
    getMenu: (node: SessionTreeNode) => MenuProps;
    onOpen: (node: SessionTreeNode) => void;
    onDrop: TreeProps<SessionTreeNode>['onDrop'];
}

// 树只负责呈现与交互，不承担表单、配置请求或连接创建。
const SessionTree: React.FC<Props> = ({ treeData, visible, getMenu, onOpen, onDrop }) => (
    <Tree.DirectoryTree<SessionTreeNode>
        rootClassName="sessionList"
        className="draggable-tree"
        draggable
        blockNode
        autoExpandParent={false}
        treeData={treeData}
        onDrop={onDrop}
        style={{ display: visible ? 'block' : 'none' }}
        titleRender={(node) => (
            <Dropdown menu={getMenu(node)} trigger={['contextMenu']}>
                <div
                    style={{ display: 'inline-block', width: '100%' }}
                    onDoubleClick={() => {
                        if (node.isLeaf) onOpen(node);
                    }}
                >
                    {node.title}
                </div>
            </Dropdown>
        )}
    />
);
export default SessionTree;
