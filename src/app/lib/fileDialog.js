const { exec } = require('child_process');
const { dialog } = require('electron');

exports.switchFileInExploer = (filePath) => {
    // 打开文件资源管理器并选中文件
    if (process.platform === 'win32') {
        exec(`explorer /select,${filePath}`);
    } else if (process.platform === 'darwin') {
        exec(`open -R ${filePath}`);
    } else if (process.platform === 'linux') {
        exec(`xdg-open ${filePath}`);
    } else {
        dialog.showMessageBox({
            type: 'error',
            title: '错误',
            message: `Unsupported platform: ${process.platform}`,
            buttons: ['确定']
        });
    }
};
