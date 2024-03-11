const DragLine = ({canMove = null, moveFunc = null, moveEndFunc = null, direction = "row"}) => {
    let style;
    if ("column" == direction) {
        style = {height: '6px', width: '100%', cursor: 'row-resize'}
    } else {
        style = {width: '6px', height: '100vh', cursor: 'col-resize'}
    }
    return <div
        style={style}
        onMouseDown={(e) => {
            let startX = e.clientX;

            // @ts-ignore
            function move(e) {
                if (canMove && !canMove(e, startX)) {
                    return;
                }
                startX = startX + e.movementX;
                // @ts-ignore
                moveFunc && moveFunc(startX);
            }

            document.addEventListener('mousemove', move);

            function removeDocumentListener() {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', removeDocumentListener);
                // @ts-ignore
                moveEndFunc && moveEndFunc(startX);
            }

            document.addEventListener('mouseup', removeDocumentListener);
        }}
    />
}

export default DragLine;
