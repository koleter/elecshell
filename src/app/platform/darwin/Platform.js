const { exec } = require('child_process');

class Platform {
  runPythonServerChildProcess() {
    const childProc = exec('../../../../pyBuild/main/main.exe', (error, stdout, stderr) => {
      if(error){
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
