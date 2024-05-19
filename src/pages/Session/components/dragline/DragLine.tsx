const DragLine = ({startPos, canMove = null, moveFunc = null, moveEndFunc = null, direction = "row"}) => {
    let style;
    if ("column" == direction) {
        style = {height: '6px', width: '100%', cursor: 'row-resize'}
    } else {
        style = {width: '6px', height: '100vh', cursor: 'col-resize'}
    }
    return <div
        style={style}
        onMouseDown={(e) => {
            let start;
            if ("column" == direction) {
                start = e.clientY;
            } else {
                start = e.clientX;
            }
            // @ts-ignore
            function move(e) {
                console.log(e)
                let delta;
                if ("column" == direction) {
                    delta = e.clientY - start;
                } else {
                    delta = e.clientX - start;
                }

                if (canMove && !canMove(e, startPos + delta)) {
                    return;
                }
                start = start + delta;

                // @ts-ignore
                moveFunc && moveFunc(start);
            }

            document.addEventListener('mousemove', move);

            function removeDocumentListener() {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', removeDocumentListener);
                moveEndFunc && moveEndFunc(start);
            }

            document.addEventListener('mouseup', removeDocumentListener);
        }}
    />
}

export default DragLine;
