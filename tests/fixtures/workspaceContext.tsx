import {createContext} from 'react';
// 独立测试上下文，避免加载应用页面、路由和其他与分屏验证无关的依赖。
export const AppContext = createContext<any>(null);
