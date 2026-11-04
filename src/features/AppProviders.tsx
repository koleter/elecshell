import React from 'react';
import { ShellProvider } from './settings/model/ShellProvider';
import { SettingsProvider } from './settings/model/SettingsProvider';
import { CatalogProvider } from './catalog/model/CatalogProvider';
import { ScriptsProvider } from './scripts/model/ScriptsProvider';
import { PromptProvider } from './dialogs/PromptProvider';
import { TransferProvider } from './transfers/model/TransferProvider';

// 这里只组合功能 Provider；各功能更新自身状态，避免重新构造一个全局 Context 值。
const AppProviders: React.FC = ({ children }) => (
    <ShellProvider>
        <SettingsProvider>
            <CatalogProvider>
                <ScriptsProvider>
                    <TransferProvider>
                        <PromptProvider>{children}</PromptProvider>
                    </TransferProvider>
                </ScriptsProvider>
            </CatalogProvider>
        </SettingsProvider>
    </ShellProvider>
);
export default AppProviders;
