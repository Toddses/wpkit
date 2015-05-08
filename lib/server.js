/**
 * Wrapper for the SSH2 module
 *
 * @author Todd Miller <todd@rainydaymedia.net>
 * @since wpkit v0.0.1
 */

// Requires
// Brian White's ssh2 module is the real hero here
// (https://github.com/mscdex/ssh2)
var async   = require('async'),
    local  = require('child_process').exec,
    dirname = require('path').dirname,
	Client  = require('ssh2').Client;

/**
 * Constructor
 *
 * @param {obj} opts JSON object with server configurations
 * @param {Logger} logger
 * @param {Function} cb
 */
var Server = function (opts, logger, cb) {

	this.logger     = logger;
	this.client     = '';
	this.cmdQueue   = [];

	this.host     = opts.host;
	this.port     = opts.port || 22;
	this.user     = opts.username;
	this.pass     = opts.password || '';
    // for now just assume we're using a running ssh agent and agent forwarding
	this.agent    = opts.agent || process.env.SSH_AUTH_SOCK;
	this.agentFwd = opts.agentFwd || true;
    this.key      = opts.privateKey || '';

};

/**
 * Server.open
 * Open up a connection with ssh2 and prepare to blast it with commands
 *
 * @param {Function} cb
 */
Server.prototype.open = function (cb) {

	this.client = new Client();

	this.client.connect({
		host: this.host,
		port: this.port,
		username: this.user,
		password: this.pass,
		agent: this.agent,
		agentForward: this.agentFwd,
        privateKey: this.key,
		readyTimeout: 5000
	});

	this.client
        .on('ready', function () {
            cb();

        }).on('error', function (err) {
            cb(err.toString());

        });

};

/**
 * Server.close
 * Close down an ssh2 connection after blasting it with commands
 *
 * @param {Function} cb
 */
Server.prototype.close = function (cb) {

	this.client.end();
	cb();

};

/**
 * Server.queue
 * Adds a command to the queue.
 * Can be a local or remote command, but one should call the respective exec
 * method, and not mix local and remote commands
 *
 * cmd can be an array or string. Readibility suffers when chaining together
 * a string for longer commands, so it can be split up into an array and pieced
 * together later.
 *
 * @param {Array or string} cmd The command to execute
 * @param {string} cwd (optional) Absolute path to execute the command within
 */
Server.prototype.queue = function (cmd, cwd) {

	this.cmdQueue.push(this._parseCommand(cmd, cwd));
	return this;

};

/**
 * Server.check
 * test if a file or directory exists
 *
 * @param {string} type 'file' or 'dir'. 'dir' is the default
 * @param {string} path Absolute path to the file or dir
 * @param {Function} cb
 */
Server.prototype.check = function (type, path, cb) {

	var flag = (type == 'file') ? '-f' : '-d';
	var cmd  = 'if test ' + flag + ' ' + path + '; then echo 1; else echo 0; fi';

	this.logger.verbose('Executing command: ' + cmd);

	this.client.exec(cmd, function (err, stream) {
		if (err) cb(null, err);

		stream.on('data', function (data) {
			cb(data.toString().trim());
		}).stderr.on('data', function (data) {
			cb(null, data.toString().trim());
		});
	});

};

/**
 * Server.capture
 * capture output from a command on the server
 *
 * cmd can be an array or string. Readibility suffers when chaining together
 * a string for longer commands, so it can be split up into an array and pieced
 * together later.
 *
 * @param {string or Array} cmd The command to execute
 * @param {sring} cwd (optional) The absolute path to exec the command in
 * @param {Function} cb Sends return value, or null and the error
 */
Server.prototype.capture = function (cmd, cwd, cb) {

    // checking if cwd was sent over
	if (!cb && typeof cwd === 'function') {
		cb  = cwd;
		cwd = '';
	}

	cmd = this._parseCommand(cmd, cwd);
    this.logger.verbose('Executing command: ' + cmd);

	this.client.exec(cmd, function (err, stream) {
		if (err) cb(null, err);

		stream.on('data', function (data) {
			cb(data.toString().trim());
		}).stderr.on('data', function (data) {
			cb(null, data.toString().trim());
		});
	});

};

/**
 * Server.execQueue
 * executes the current command queue on the remote server
 *
 * @param {Function} cb
 */
Server.prototype.execQueue = function (cb) {

	var that = this;

	async.whilst(
        // the test function
		function () { return that.cmdQueue.length > 0; },

        // execute each command, FIFO style
		function (callback) {
			var cmd = that.cmdQueue.shift();
			that.logger.verbose('Executing command: ' + cmd);

			that.client.exec(cmd, function (err, stream) {
				if (err) callback(err);

                else {
    				stream.on('close', function (code, signal) {
                        // check for success exit code because the callback
                        //would be called twice on errors.
                        // which is bad.
                        if (code == 0)
    				        callback();

    				}).on('data', function (data) {
                        // TODO consider what to do with stdout here

                    }).stderr.on('data', function (data) {
                        callback(data.toString().trim());

                    });
                }
			});

        // no need to define our own callback handler, just pass it on the parent
		}, cb);

};

/**
 * Serer.execQueueLocally
 * executes the current command queue in the local environment
 *
 * @param {Function} cb
 */
Server.prototype.execQueueLocally = function (cb) {

    var that = this;

    async.whilst(
        // the test function
        function () { return that.cmdQueue.length > 0; },

        // execute each command, FIFO style
        function (callback) {
            var cmd = that.cmdQueue.shift();
            that.logger.verbose('Executing local command: ' + cmd);

            local(cmd, function (error, stdout, stderr) {
                // stderr is the relevant error message here
                if (error) callback(stderr.trim());
                else callback();
            })

        // no need to define our own callback handler, just pass it on the parent
        }, cb);

};

/**
 * Server.download
 * downloads a file or directory from the remote server to the local environment
 * TODO: add functionality for directory download
 *
 * @param {string} source Absolute path to the source on the remote server
 * @param {string} dest Absolute path to the destination in the local env
 * @param {Function} cb
 */
Server.prototype.download = function (source, dest, cb) {

    var that = this;

    async.series([
        function (callback) {
            that
                .queue(['mkdir', '-p', dirname(dest)])
                .execQueueLocally(callback);
        },
        function (callback) {
            that
                .queue(['scp', that.user+'@'+that.host+':'+source, dest])
                .execQueueLocally(callback);
        }

    // no need to define our own callback handler, just pass it on the parent
    ], cb);

};

/**
 * Server.upload
 * uploads a file or directory from the local environment to the remote server
 * TODO: add directory uploading functionality
 *
 * @param {string} source Absolute path to the source in the local env
 * @param {string} dest Absolute path to the dest on the remote server
 * @param {Function} cb
 */
Server.prototype.upload = function (source, dest, cb) {

    var that = this;

    async.series([
        function (callback) {
            that
                .queue(['mkdir', '-p', dirname(dest)])
                .execQueue(callback);
        },
        function (callback) {
            that
                .queue(['scp', source, that.user+'@'+that.host+':'+dest])
                .execQueueLocally(callback);
        }

    // no need to define our own callback handler, just pass it on the parent
    ], cb);

};

/**
 * Server._parseCommand (private)
 * takes the given command and optional current working directory, and builds
 * the usable command string
 *
 * @param {string or Array} cmd The command to execute
 * @param {string} cwd (optional) An absolute path to execute the command within
 */
Server.prototype._parseCommand = function (cmd, cwd) {

	var cmdString = '';

	if (cwd) {
		cmdString = 'cd ' + cwd + ' && ';
	}

	if (Array.isArray(cmd)) {
		cmd.forEach(function (arg) {
			cmdString += arg + ' ';
		});
	} else {
		cmdString += cmd;
	}

	return cmdString;

};

module.exports = Server;
