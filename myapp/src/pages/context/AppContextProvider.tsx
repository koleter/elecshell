import {createContext, useEffect, useState, useRef} from 'react';
import {request} from "@@/plugin-request/request";
import util from "@/util";
import {message} from "antd";

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
    })
  }, []);
  return (
    <AppContext.Provider value={{
      xshListWindowWidth, setXshListWindowWidth,
      // use for prompt
      promptInputRef, showPrompt, setShowPrompt, promptTitle, setPromptTitle, promptOKCallback, setPromptOKCallback, promptUserInput, setPromptUserInput, prompt
    }}>{/** value就是可在<AppContextProvider>组件的子组件中使用useContext() hook函数所获取的对象 */}
      {props.children}
    </AppContext.Provider>
  );
}
