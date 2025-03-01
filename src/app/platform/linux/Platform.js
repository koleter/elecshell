const {exec, execFile, spawn} = require('child_process');
const os = require('os');
const path = require('path');

class Platform {
    getUserBasePath() {
        // 'C:\\Users\\24478\\AppData\\Local\\elecshell'
        const userHome = os.homedir();
        return path.join(userHome, ".config", "elecshell");
    }
    runPythonServerChildProcess() {
        console.log(__dirname);

        // var cmd = "../../../../pyBuild/main/main.exe";
        // var childProc = spawn('cmd.exe', ['/s', '/c', cmd]);
        // childProc.on('close', function(code) {
        //   console.log('child process exited with code :' + code);
        // });
        // childProc.stdout.on('data', function(data) {
        //   console.log('stdout: ' + data);
        // });
        // childProc.stderr.on('data', function(data) {
        //   console.log('stderr: ' + data);
        // });

        const args = {
            cwd: `${__dirname}/../../../../server`
        };

        const childProc = exec('python main.py', args, (error, stdout, stderr) => {
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
