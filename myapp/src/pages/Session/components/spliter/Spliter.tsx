import React from 'react';
import DragLine from "@/pages/Session/components/dragline/DragLine";

// 用于切分界面的组件
const Spliter: React.FC = (props) => {
  if (props.children.length > 2) {
    throw Error("Spliter have at most two children")
  } else if (props.children.length == 1) {
    return props.children[0];
  }

  const style = {display: 'flex', height: '100%', width: '100%', overflow: 'hidden'};
  // @ts-ignore
  const {direction = 'colume'} = props;
  if (direction) {
    style.flexDirection = direction
  }

  const getChildCSS = () => {
    if (direction == 'colume') {
      return {
        height: 'calc(50% - 3px)',
        width: '100%'
      }
    }
    return {
      height: '100%',
      width: 'calc(50% - 3px)'
    }
  }

  return <div style={style}>
    <div style={getChildCSS()}>
      {props.children[0]}
    </div>
    <DragLine></DragLine>
    <div style={getChildCSS()}>
      {props.children[1]}
    </div>

  </div>
}

export default Spliter;
