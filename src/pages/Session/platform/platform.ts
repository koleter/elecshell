let {ipcRenderer} = window.require('electron');

const platform = ipcRenderer.sendSync("getSystemPlatform");
console.log(platform)

// export default await require(`./${platform}/Platform`)

