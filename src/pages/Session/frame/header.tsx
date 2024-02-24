import React, {useState, useRef, useContext, useEffect} from 'react';

let {ipcRenderer} = window.require('electron');

const Header: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  return <div id={"header"}
              style={{backgroundColor: '#D3E3FD', display: 'flex', justifyContent: 'flex-end', height: "28px"}}>
    <div className="window-control-box window-control-minimize" onClick={() => {
      ipcRenderer.send('window-min');
    }}>
              <span role="img" aria-label="minus" className="anticon anticon-minus iblock font12 widnow-control-icon">
                <svg viewBox="64 64 896 896" focusable="false" data-icon="minus" width="1em" height="1em"
                     fill="currentColor" aria-hidden="true">
                  <path
                    d="M872 474H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h720c4.4 0 8-3.6 8-8v-60c0-4.4-3.6-8-8-8z"></path>
                </svg>
              </span>
    </div>
    <div className="window-control-box window-control-maximize" onClick={() => {
      ipcRenderer.send('window-max');
      setIsMaximized(!isMaximized);
    }}>
      {
        isMaximized ?
          <span className="iblock font12 icon-maximize widnow-control-icon is-max"></span> :
          <span className="iblock font12 icon-maximize widnow-control-icon not-max"></span>
      }
    </div>

    <div className="window-control-box window-control-close" onClick={() => {
      ipcRenderer.send('window-close');
    }
    }>
              <span role="img" aria-label="close" className="anticon anticon-close iblock font12 widnow-control-icon">
                <svg viewBox="64 64 896 896" focusable="false" data-icon="close" width="1em" height="1em"
                     fill="currentColor" aria-hidden="true">
                  <path
                    d="M799.86 166.31c.02 0 .04.02.08.06l57.69 57.7c.04.03.05.05.06.08a.12.12 0 010 .06c0 .03-.02.05-.06.09L569.93 512l287.7 287.7c.04.04.05.06.06.09a.12.12 0 010 .07c0 .02-.02.04-.06.08l-57.7 57.69c-.03.04-.05.05-.07.06a.12.12 0 01-.07 0c-.03 0-.05-.02-.09-.06L512 569.93l-287.7 287.7c-.04.04-.06.05-.09.06a.12.12 0 01-.07 0c-.02 0-.04-.02-.08-.06l-57.69-57.7c-.04-.03-.05-.05-.06-.07a.12.12 0 010-.07c0-.03.02-.05.06-.09L454.07 512l-287.7-287.7c-.04-.04-.05-.06-.06-.09a.12.12 0 010-.07c0-.02.02-.04.06-.08l57.7-57.69c.03-.04.05-.05.07-.06a.12.12 0 01.07 0c.03 0 .05.02.09.06L512 454.07l287.7-287.7c.04-.04.06-.05.09-.06a.12.12 0 01.07 0z"></path>
                </svg>
              </span>
    </div>
  </div>
};

export default Header;
