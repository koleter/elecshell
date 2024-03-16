const DragLine = ({start, canMove = null, moveFunc = null, moveEndFunc = null, direction = "row"}) => {
    let style;
    if ("column" == direction) {
        style = {height: '6px', width: '100%', cursor: 'row-resize'}
    } else {
        style = {width: '6px', height: '100vh', cursor: 'col-resize'}
    }
    return <div
        style={style}
        onMouseDown={(e) => {

            // @ts-ignore
            function move(e) {
                if (canMove && !canMove(e, start)) {
                    return;
                }
                start = start + e.movementX;

                // @ts-ignore
                moveFunc && moveFunc(start);
            }

            document.addEventListener('mousemove', move);

            function removeDocumentListener() {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', removeDocumentListener);
                // @ts-ignore
                moveEndFunc && moveEndFunc(start);
            }

            document.addEventListener('mouseup', removeDocumentListener);
        }}
    />
}

export default DragLine;
