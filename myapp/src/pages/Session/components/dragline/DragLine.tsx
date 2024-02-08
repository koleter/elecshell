const DragLine = ({moveFunc = null, moveEndFunc = null, direction = "Vertical"}) => {
  let style;
  if (direction == "Vertical") {
    style = {width: '5px', height: '100vh', cursor: 'col-resize'}
  } else if ("horizontal" == direction) {
    style = {height: '5px', width: '100%', cursor: 'row-resize'}
  } else {
    throw Error("unexpected direction: " + direction)
  }
  return <div
    style={style}
    onMouseDown={(e) => {
      let startX = e.clientX;

      // @ts-ignore
      function move(e) {
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
