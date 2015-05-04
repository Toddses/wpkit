/**
 * Configubot!
 * A nodeJS configuration manager. The main feature is that you can pass a
 * predefined set of required config keys, and if they don't exist after
 * loading the file, it will prompt the user for them. Then will prompt the user
 * to save the new configuration, and it will crap out the entire config
 * back into the file.
 *
 * Version 0.1.0
 * Author: Todd Miller <todd@rainydaymedia.net>
 *
 * Todo:
 * -split configubot off into a separately managed module
 * -get and set methods need to be more abstract to allow for a deeper keyset
 * -define a has() method to test if a value exists in the config
 * -should allow for a more robust set of options when defining your requirements
 *  (this would be based on the options available to revalidator)
 * -make the filetype more optional, support at least yaml and json
 */

// Requires
var fs          = require('fs'),
    chalk       = require('chalk'),
    revalidator = require('revalidator'),
    readline    = require('readline'),
    async       = require('async');

/**
 * Constructor
 *
 * @param {string} filename Absolute path to the expected config file
 */
function Configubot (filename) {
    this.filename      = filename;
    this.promptForSave = false;
    this.config        = {};
    var that           = this;

    // load up the config file. if its not there, just let the user know that
    // no config was preloaded.
    if (fs.existsSync(this.filename)) {
        var content = fs.readFileSync(this.filename, {encoding: 'utf8'});
        this.config = JSON.parse(content);
    } else {
        console.log('No ' + filename + ' configuration loaded.');
    }

    return this;
};

/**
 * Set a value
 *
 * @param {string} key The bottom most key to set in the object
 * @param {string} stage (optional) The stage/environment this key is within
 * @param {string} value
 * @return {this} Allows for function chaining
 */
Configubot.prototype.set = function (key, stage, value) {
    if (!value) {
        value = stage;
        stage = '';
    }

    if (stage) {
        // if the stage isn't in the config, create it
        if (!this.config[stage])
            this.config[stage] = {};

        this.config[stage][key] = value;
    } else {
        this.config[key] = value;
    }

    return this;
};

/**
 * Retrieve a value from the configuration
 *
 * @param {string} key The bottom level key to retrieve
 * @param {string} stage The stage/environment
 * @return {string} The value!
 */
Configubot.prototype.get = function (key, stage) {
    if (stage) {
        return (this.config[stage] && this.config[stage][key]) ? this.config[stage][key] : '';
    } else {
        return (this.config[key]) ? this.config[key] : '';
    }
};

/**
 * Primes the Configubot prompting engine with a set of predefined required keys.
 * Deeper keys (ie keys within a stage) should be delimited by a '.'
 *
 * @param {Array} keys An array of required keys
 * @param {Function} cb The callback function to call when finished
 */
Configubot.prototype.prime = function (keys, cb) {
    var that = this;

    // loop through the keys and test that there's a value for each one
    async.eachSeries(
        keys,
        function (k, callback) {
            var els   = k.split('.'),
                stage = (els[1]) ? els[0] : '',
                key   = (els[1]) ? els[1] : els[0],
                value = '';

            if (stage) {
                value = that.get(key, stage);
            } else {
                value = that.get(key);
            }

            // if the value could not be found, prompt the user for it
            if (!value) {
                var message;
                if (stage)
                    message = chalk.green(key) + ' in ' + chalk.green(stage) + ' required: ';
                else
                    message = chalk.green(key) + ' required: ';

                // let Configubot know it should ask the user if they want to save
                that.promptForSave = true;
                that._prompt(message, function (value) {
                    that.set(key, stage, value);
                    callback();
                });

            } else {
                callback();
            }
        },
        function (err) {
            if (err) cb(err);
            else {
                that.maybeSaveConfig(function () {
                    cb();
                });
            }
        }
    );
}

/**
 * The actual prompting logic
 *
 * @param {string} message A prompt message
 * @param {string} validation (optional) Regex defining valid input
 * @param {Function} cb
 */
Configubot.prototype._prompt = function (message, validation, cb) {
    var prompt     = chalk.yellow('>> '),
        that       = this,
        cb         = (typeof(validation) === 'function') ? validation : cb,
        validation = (typeof(validation) !== 'function') ? validation : '';

    // get readline ready to go
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // the schema revalidator will to use to test against
    var schema = {
        properties: {
            value: {
                type: 'string',
                pattern: validation,
                allowEmpty: false
            }
        }
    };

    // repeat forever to eventually get valid input
    async.forever(
        function (next) {
            // simply prompt the user and use revalidator to make sure its good
            rl.question(prompt + message, function (answer) {
                var validation = revalidator.validate({value: answer}, schema);
                if (validation.valid) {
                    rl.close();
                    cb(answer);

                } else {
                    // let the user know they failed and try again
                    console.log(chalk.red('>> Error: ') + validation.errors[0].message);
                    next();
                }
            });
        },
        function (err) {
            // i don't think this will ever actually error, so if it does
            // just dump it out so we know what to look for and move on
            console.log(err);
            cb();
        }
    );
};

/**
 * If the configuration has changed, prompt the user to save the new config,
 * and rewrite the file if yes.
 */
Configubot.prototype.maybeSaveConfig = function (cb) {
    var that = this;
    if (this.promptForSave) {
        this._prompt(
            'Would you like to save this config? (yes|no) ',
            /^[yn](es|o)?$/i, // valiation regex
            function (answer) {
                if (answer.toLowerCase().indexOf('y') > -1) {
                    fs.writeFileSync(that.filename, JSON.stringify(that.config, null, 2));
                    cb();
                }
            }
        );

    } else {
        cb();
    }
};

module.exports = Configubot;
