// Requires
var yaml = require('js-yaml'),
    fs   = require('fs');

// Constructor
function Configubot (cb) {
    try {
        this.configFile = yaml.safeLoad(fs.readFileSync('wpkit.yml', 'utf8'), {
            filename: 'wpkit.yml',
            schema: yaml.JSON_SCHEMA
        });

    } catch (err) {
        cb(err);
    }

    return this;
};

Configubot.prototype.set = function (key, value) {
    this.configFile[key] = value;
    return this;
};

Configubot.prototype.get = function (key, stage) {
    if (stage) {
        return this.configFile[stage][key];
    } else {
        return this.configFile[key];
    }
};

module.exports = Configubot;