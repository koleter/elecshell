import {createContext, useEffect, useState, useRef} from 'react';
import {request} from "@@/plugin-request/request";
import util from "@/util";
import {message} from "antd";
import platform from "@/pages/Session/platform/platform"

//根据定义创建Context
export const AppContext = createContext(null);

//定义ContextProvider，children是组件
export function AppContextProvider(props: { children: React.ReactNode | React.ReactNode[] }) {

  const [xshListWindowWidth, setXshListWindowWidth] = useState(250);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptTitle, setPromptTitle] = useState("");
  const [promptOKCallback, setPromptOKCallback] = useState("");
  const [promptUserInput, setPromptUserInput] = useState("");
  const promptInputRef = useRef(null);

  const prompt = function (title, callback, defaultUserInput = "") {
    setPromptTitle(title);
    setPromptOKCallback(() => callback);
    setPromptUserInput(defaultUserInput);
    setShowPrompt(true);
    promptInputRef.current.focus();
  }

  const [xtermShortKeys, setXtermShortKeys] = useState({});

  useEffect(() => {
    request(util.baseUrl + 'conf', {
      method: 'GET',
      params: {
        type: 'GlobalAutoConfig',
      },
    }).then(res => {
      if (res.status !== 'success') {
        message[res.status](res.msg);
        return;
      }
      if (res.data.xshListWindowWidth) {
        setXshListWindowWidth(res.data.xshListWindowWidth);
      }

      const termDefaultShortKey = platform?.default?.getTermDefaultShortKey();
      // console.log(termDefaultShortKey)
      if (termDefaultShortKey) {
        if (!res.data.xtermShortKeys) {
          res.data.xtermShortKeys = {};
        }
        for (let key in termDefaultShortKey) {
          if (!(key in res.data.xtermShortKeys)) {
            res.data.xtermShortKeys[key] = termDefaultShortKey[key];
          }
        }
      }
      setXtermShortKeys(res.data.xtermShortKeys);
    })
  }, []);
  return (
    <AppContext.Provider value={{
      xshListWindowWidth, setXshListWindowWidth,
      // use for prompt
      promptInputRef, showPrompt, setShowPrompt, promptTitle, setPromptTitle, promptOKCallback, setPromptOKCallback, promptUserInput, setPromptUserInput, prompt,
      // use for xterm short keys
      xtermShortKeys, setXtermShortKeys
    }}>{/** value就是可在<AppContextProvider>组件的子组件中使用useContext() hook函数所获取的对象 */}
      {props.children}
    </AppContext.Provider>
  );
}
