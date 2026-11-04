import { useRef } from 'react';
import type { CSSProperties } from 'react';

interface Props {
    startPos: number;
    canMove?: ((event: MouseEvent, position: number) => boolean) | null;
    moveFunc?: ((position: number) => void) | null;
    moveEndFunc?: ((position: number) => unknown) | null;
    direction?: 'row' | 'column';
}
const DragLine = ({
    startPos,
    canMove = null,
    moveFunc = null,
    moveEndFunc = null,
    direction = 'row',
}: Props) => {
    const startPosRef = useRef(0);
    let style: CSSProperties;
    if ('column' == direction) {
        style = { height: '6px', width: '100%', cursor: 'row-resize' };
    } else {
        // 跟随内容区高度，避免连同顶部标题栏一起撑出视口。
        style = { width: '6px', height: '100%', cursor: 'col-resize' };
    }
    return (
        <div
            style={style}
            onMouseDown={() => {
                startPosRef.current = startPos;

                function move(e: MouseEvent) {
                    // console.log(e)
                    let delta;
                    if ('column' == direction) {
                        delta = e.movementY;
                    } else {
                        delta = e.movementX;
                    }

                    if (canMove && !canMove(e, startPosRef.current + delta)) {
                        return;
                    }

                    startPosRef.current += delta;
                    // @ts-ignore
                    moveFunc?.(startPosRef.current);
                }

                document.addEventListener('mousemove', move);

                function removeDocumentListener() {
                    document.removeEventListener('mousemove', move);
                    document.removeEventListener('mouseup', removeDocumentListener);
                    moveEndFunc?.(startPosRef.current);
                }

                document.addEventListener('mouseup', removeDocumentListener);
            }}
        />
    );
};

export default DragLine;
