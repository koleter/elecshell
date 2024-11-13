import {useRef} from 'react';

const DragLine = ({startPos, canMove = null, moveFunc = null, moveEndFunc = null, direction = "row"}) => {
    const startPosRef = useRef(0);
    let style;
    if ("column" == direction) {
        style = {height: '6px', width: '100%', cursor: 'row-resize'}
    } else {
        style = {width: '6px', height: '100vh', cursor: 'col-resize'}
    }
    return <div
        style={style}
        onMouseDown={(e) => {
            startPosRef.current = startPos;

            // @ts-ignore
            function move(e) {
                // console.log(e)
                let delta;
                if ("column" == direction) {
                    delta = e.movementY;
                } else {
                    delta = e.movementX;
                }

                if (canMove && !canMove(e, startPosRef.current + delta)) {
                    return;
                }

                startPosRef.current += delta;
                // @ts-ignore
                moveFunc && moveFunc(startPosRef.current);
            }

            document.addEventListener('mousemove', move);

            function removeDocumentListener() {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', removeDocumentListener);
                moveEndFunc && moveEndFunc(startPosRef.current);
            }

            document.addEventListener('mouseup', removeDocumentListener);
        }}
    />
}

export default DragLine;
