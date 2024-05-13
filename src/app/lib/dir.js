const fs = require("fs");

exports.folderExists = function (path) {
    try {
        return fs.statSync(path).isDirectory();
    } catch (err) {
        return false;
    }
};
