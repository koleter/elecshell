const {platform} = require("os");

const {Platform} = require(`./${platform()}/Platform`);

exports.Platform = Platform;

