/**
 * Wrapper for the SSH2 module
 *
 *
 */

// Requires
var async = require('async'),
	Client = require('ssh2').Client;

// Constructor
var Server = function (opts, logger, cb) {

	this.logger   = logger;
	this.client   = '';
	this.cmdQueue = [];

	this.host     = opts.host;
	this.port     = opts.port || 22;
	this.user     = opts.username;
	this.pass     = opts.password || '';
	this.agent    = opts.agent || '';
	this.agentFwd = opts.agentFwd || false;

};

// Open up a connection and prepare to blast it with commands
Server.prototype.open = function (cb) {

	this.client = new Client();

	this.client.connect({
		host: this.host,
		port: this.port,
		username: this.user,
		password: this.pass,
		agent: this.agent,
		agentForward: this.agentFwd,
		readyTimeout: 5000
	});

	this.client.on('ready', function () {
		cb();
	});

	this.client.on('error', function (err) {
		cb(err.toString());
	});

};

// Close down a connection after blasting it with commands
Server.prototype.close = function (cb) {

	this.client.end();
	cb();

};

// Add a command to the queue
Server.prototype.queue = function (cmd, cwd) {

	this.cmdQueue.push(this._parseCommand(cmd, cwd));
	return this;

};

// Check if a file or directory exists
Server.prototype.check = function (type, path, cb) {

	var flag = type == 'file' ? '-f' : '-d';
	var cmd  = 'if test ' + flag + ' ' + path + '; then echo 1; else echo 0; fi';

	this.logger.verbose('Executing command: ' + cmd);

	this.client.exec(cmd, function (err, stream) {
		if (err) throw err;

		stream.on('data', function (data) {
			cb(data.toString().replace(/\n$/, ''));
		}).stderr.on('data', function (data) {
			cb(null, data.toString().replace(/\n$/, ''));
		});
	});

};

// Execute a command and return the data
Server.prototype.capture = function (cmd, cwd, cb) {

	if (!cb && typeof cwd === 'function') {
		cb  = cwd;
		cwd = '';
	}

	cmd = this._parseCommand(cmd, cwd);

	this.client.exec(cmd, function (err, stream) {
		if (err) throw err;

		stream.on('data', function (data) {
			cb(data.toString().replace(/\n$/, ''));
		}).stderr.on('data', function (data) {
			cb(null, data.toString().replace(/\n$/, ''));
		});
	});

};

// Execute the command queue
Server.prototype.execQueue = function (cb) {

	var that = this;

	async.whilst(
		function () { return that.cmdQueue.length > 0; },

		function (callback) {
			var cmd = that.cmdQueue.shift();

			that.logger.verbose('Executing command: ' + cmd);

			that.client.exec(cmd, function (err, stream) {
				if (err) throw err;

				stream.on('data', function (data) {
					// TODO consider what to do with stdout here

				}).stderr.on('data', function (data) {
					callback(data.toString().replace(/\n$/, ''));

				}).on('close', function () {
					callback();
				});
			});

		},
		function (err) {
			if (err) cb(err);
			else cb();
		});

};

// Parse the command array
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