process.env.NODE_ENV = 'production'

const path = require('path');
const {Platform: plat} = require(path.resolve(process.cwd(), 'src/app/platform/platform'));


const builder = require("electron-builder")
const Platform = builder.Platform

// Let's get that intellisense working
/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
const options = {
    "appId": "personal.lijinsong.elecshell",
    "productName": "elecshell",
    "asar": true,
    "directories": {
        "output": "build"
    },
    "files": [
        "src/app/**/*",
        "server/**/*",
        "antdBuild/**/*",
        "out/**/*",
        "package.json"
    ],
    "extraFiles": [
        "server/**/*",
    ],
    "extraResources": [{
        "from": "server",
        "to": `${plat.getUserBasePath()}/server`
    }],
    "mac": {
        "category": "public.app-category.utilities",
        "icon": "dist/icon.icns"
    },
    "win": {
        "target": "nsis",
        "icon": "dist/icon.ico"
    },
    "linux": {
        "target": "deb",
        "icon": "dist/icon.png"
    },
    "nsis": {
        "oneClick": false,
        "runAfterFinish": true,
        "allowToChangeInstallationDirectory": true
    }
};


// Promise is returned
builder.build({
    config: options
})
    .then((result) => {
        console.log(JSON.stringify(result))
    })
    .catch((error) => {
        console.error(error)
    })
