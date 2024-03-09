const {app, BrowserWindow, screen, ipcMain, Menu, globalShortcut} = require('electron');
const path = require('path');
const {platform} = require("os");
const request = require('request');
const { exec } = require('child_process');

const {Platform} = require('./platform/platform');

const args = {
  cwd: `${process.cwd()}/server`
};

// 开发模式自行启动main.py,生产模式创建子进程自动执行
if (process.env.NODE_ENV !== 'development') {
  exec('python3 main.py', args, (error, stdout, stderr) => {
    if(error){
      console.error(`${error}`);
      exec('python main.py', args, (error, stdout, stderr) => {
        if(error){
          if (error.message == 'Command failed: python main.py\n') {
            throw new Error("can not find python3 or python");
          }
          console.error(`${error}`);
          process.exit();
        }
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
      });
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);
  });
}

const createWindow = () => {
  const {width, height} = screen.getPrimaryDisplay().workAreaSize;//获取到屏幕的宽度和高度
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: width * 0.9,
    height: height * 0.9,
    webPreferences: {
      // preload: path.join(__dirname, 'preload.js'),
      // 下面两行配置使得浏览器可以使用nodejs的模块
      nodeIntegration: true, contextIsolation: false, webSecurity: false, // 禁用安全策略
      allowDisplayingInsecureContent: true, // 允许一个使用 https的界面来展示由 http URLs 传过来的资源
      allowRunningInsecureContent: true, // 允许一个 https 页面运行 http url 里的资源
      enableRemoteModule: true // 打开remote模块
    },
    frame: false,   // 去掉窗口边框 // 取消默认的头部；自定义头部
    titleBarStyle: 'hidden',  // 隐藏窗口title
    titleBarOverlay: true,  // 用于windows系统,使右上角出现最小化,最大化,关闭三个按钮
    fullscreenable: true, autoHideMenuBar: true, // 隐藏菜单栏
    minimizable: true, // 可否最小化
    maximizable: true, // 可否最大化
    resizable: true,  //
    closable: true, // 展示关闭按钮
    fullscreen: false, // MAC下是否可以全屏
    skipTaskbar: false, // 在任务栏中显示窗口
    acceptFirstMouse: true, // 是否允许单击页面来激活窗口
    transparent: false,
    movable: true, // 可否移动
    allowRunningInsecureContent: true, // 允许一个 https 页面运行 http url 里的资源
  });

  globalShortcut.register("CommandOrControl+W", () => {
    //stuff here
  });

  //登录窗口最小化
  ipcMain.on('window-min', function () {
    mainWindow.minimize();
  });
  //登录窗口最大化
  ipcMain.on('window-max', function () {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  //登录窗口关闭
  ipcMain.on('window-close', function () {
    mainWindow.close();
    if (process.env.NODE_ENV !== 'development') {
      request({
        url: 'http://localhost:8888/exit',
        method: "POST",
        json: true,
        headers: {
          "content-type": "application/json",
        }
      }, function(error, response, body) {
        if (!error) {
          console.log(body); // 请求成功的处理逻辑
        }
      });
    }

    process.exit();

  });

  // 获取操作系统类型
  ipcMain.on('getSystemPlatform', function (e) {
    e.returnValue = platform();
    // e.sender.send("replayGetSystemPlatform", platform())
  });

  // and load the index.html of the app.
  // mainWindow.loadFile(path.join(__dirname, '../web/index.html'));

  console.log(process.env.NODE_ENV);

  // Open the DevTools.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL("http://localhost:8000/session");
    mainWindow.webContents.openDevTools();
  } else {
    // mainWindow.loadURL("http://localhost:8888/session")
    mainWindow.loadFile("./antdBuild/index.html");
  }

};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
