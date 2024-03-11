const {exec} = require('child_process');
const os = require("os");
const path = require("path");

class Platform {
    getUserBasePath() {
        // '/Users/a58/Library/Application Support/elecshell'
        const userHome = os.homedir();
        return path.join(userHome, "Library", "Application Support", "elecshell");
    }

    runPythonServerChildProcess() {
        const childProc = exec('../../../../pyBuild/main/main.exe', (error, stdout, stderr) => {
            if (error) {
                console.error(`执行出错：${error}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
            console.log(`stderr: ${stderr}`);
        });
        return childProc;
    }
}

exports.Platform = new Platform();
