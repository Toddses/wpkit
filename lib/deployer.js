// Requires
var async  = require('async'),
	fs     = require('fs'),
	path   = require('path'),
	Server = require('./server');

// Constructor
function Deployer (stage, logger, config) {

	this.logger = logger;
    this.stage  = stage;

    this.config = config;
    this.config.set('sharedPath', path.join(this.config.get('privatePath', stage), 'shared'));
    this.config.set('repoPath', path.join(this.config.get('privatePath', stage), 'repo'));
    this.config.set('deployLog', path.join(this.config.get('privatePath', stage), 'deployments.log'));

	// initialize a server for ssh connection
	this.server = new Server({
		host: this.config.get('host', stage),
		username: this.config.get('username', stage),
		agent: process.env.SSH_AUTH_SOCK,
		agentFwd: true
	}, logger);

};

// Make the actual deployment
Deployer.prototype.deploy = function () {

	var that = this;

	this.server.open(function (err) {
		if (err) {
			that.logger.error('Could not connect to ' + that.server.host + '! ' + err);

		} else {
			that.logger.log('Connected to ' + that.server.host);

			async.series([
				that._preDeploy.bind(that),
				that._fetchTimestamp.bind(that),
				that._deployRepo.bind(that),
				that._deployRelease.bind(that),
				that._setNewRevision.bind(that),
				that._symlinkDirs.bind(that),
				that._symlinkFiles.bind(that),
				that._writeRevisionLog.bind(that),

			], function (err) {
				if (err) {
					that.server.close(function () {
						that.logger.error('Deployment failed with: ' + err);
					});
				} else {
					that.server.close(function () {
						that.logger.success('Deployment complete!');
					});
				}
			});
		}
	});

};

// Set up everything before deploying a new release
Deployer.prototype._preDeploy = function (cb) {

	var that = this;

	this.server
		// make sure we can access git
		.queue(['git',
				'ls-remote',
				'--heads',
				this.config.get('repo')
			])
		// make sure the needed directories are there
		.queue(['mkdir',
				'-p',
				this.config.get('privatePath', this.stage),
				this.config.get('publicPath', this.stage)
			]);

	// make sure that symlinked directories exist
	if (this.config.get('linkedDirs').length > 0) {
		var dirs = [];
		this.config.get('linkedDirs').forEach(function (dir) {
			dirs.push(path.join(that.config.get('sharedPath'), dir));
		});

		this.server.queue(['mkdir', '-p', dirs.join(' ')]);
	}

	// make sure the directories of files to be symlinked exist
	if (this.config.get('linkedFiles').length > 0) {
		var dirs = [];
		this.config.get('linkedFiles').forEach(function (file) {
			dirs.push(path.dirname(path.join(that.config.get('sharedPath'), file)));
		});

		this.server.queue(['mkdir', '-p', dirs.join(' ')]);
	}

	this.server
		.execQueue(function (err) {
			if (err) cb(err);
			else {
				async.series([
					// check that each of the symlinked files exist on the server
					// TODO make this a warning until user created tasks
					// are in there.
					function (callback) {
						if (that.config.get('linkedFiles').length > 0) {
							var files = that.config.get('linkedFiles').slice();

							async.whilst(
								function () { return files.length > 0 },

								function (callback) {
									var file = files.shift();

									that.server.check('file', path.join(that.config.get('sharedPath'), file), function (response, err) {
										if (err) callback(err);
										else {
											if (response == "1") callback();
											else {
                                            // if it doesn't exist, just create the file
                                                that.server
                                                    .queue(['touch', path.join(that.config.get('sharedPath'), file)])
                                                    .execQueue(function (err) {
                                                        if (err) callback(err);
                                                        else callback();
                                                    });
                                            }
										}
									});
								},

								function (err) {
									if (err) callback(err);
									else callback();
								});

						} else {
							callback();
						}
					},

					// check if there's already a release deployed
					function (callback) {
						that.server.check('file', path.join(that.config.get('publicPath', that.stage), 'REVISION'), function (response, err) {
							if (err) callback(err);
							else {
								if (response == "1")
									that.config.set('revisionExists', true);

								callback();
							}
						});
					},

					// check if the repo mirror has already been cloned
					function (callback) {
						that.server.check('file', path.join(that.config.get('repoPath'), 'HEAD'), function (response, err) {
							if (err) callback(err);
							else {
								if (response == "1")
									that.config.set('repoExists', true);

								callback();
							}
						});
					}
				], function (err) {
					if (err) cb(err);
					else {
						that.logger.log('Check stage complete');
						cb();
					}
				});
			}
		});

};

// Fetch the new release path
Deployer.prototype._fetchTimestamp = function (cb) {

	this.server.capture('date +%Y%m%d%H%M%S', function (timestamp, err) {
		if (err) cb(err);
		else {
			this.config.set('timestamp', timestamp);
			cb();
		}
	}.bind(this));

};

// Clone, if needed, and update the repo on the server
Deployer.prototype._deployRepo = function (cb) {

	var that = this;

	// if the repo isn't already there, go ahead and clone it
	if (! this.config.get('repoExists'))
		this.server.queue(['git', 'clone', '--mirror', '-q', this.config.get('repo'), this.config.get('repoPath')])

	this.server
		.queue(['git',
				'remote',
				'update',
                '&>/dev/null'
			], this.config.get('repoPath'))
		.execQueue(function (err) {

			if (err) cb(err);
			else {
				that.logger.log('Repo updated');
				cb();
			}
		});

};

// Create and clone the new release
Deployer.prototype._deployRelease = function (cb) {

	var that = this;

	this.server
        .queue(['rm',
                '-rf',
                this.config.get('publicPath', this.stage)
            ])
		.queue(['mkdir',
				'-p',
				this.config.get('publicPath', this.stage)
			])
		.queue(['git',
				'archive',
				this.config.get('branch', this.stage),
				'| tar',
				'-x -f - -C',
				this.config.get('publicPath', this.stage)
			], this.config.get('repoPath'))
		.execQueue(function (err) {
			if (err) cb(err);
			else {
				that.logger.log('New release created');
				cb();
			}
		});

};

// Get the current git revision
Deployer.prototype._setNewRevision = function (cb) {

	var that = this;

	async.series([
			// fetch the new revision number
			function (callback) {
				that.server
					.capture(['git',
							'rev-parse',
							'--short',
							that.config.get('branch', that.stage)
						], that.config.get('repoPath'),
						function (revision, err) {
							if (err) callback(err);
							else {
								that.config.set('newRevision', revision);
								callback();
							}
						});
			},

			// write the new revision number to the file
			function (callback) {
				that.server
					.queue(['echo',
							'\"'+that.config.get('newRevision')+'\"',
							'>>',
							'REVISION'
						], that.config.get('publicPath', that.stage))
					.execQueue(function (err) {
						if (err) callback(err);
						else callback();
					});
			}

		], function (err) {
			if (err) cb(err);
			else cb();
		});

};

// Set up the directory symlinks
Deployer.prototype._symlinkDirs = function (cb) {

	var that = this;

	if (this.config.get('linkedDirs').length > 0) {

		var dirs = this.config.get('linkedDirs').slice();

		async.whilst(
			function () { return dirs.length > 0; },

			function (callback) {
				var dir    = dirs.shift();
				var target = path.join(that.config.get('sharedPath'), dir);
				var link   = path.join(that.config.get('publicPath', that.stage), dir);

				// first make sure the parent directory exists
				// TODO may not need this since we created the dirs in _preDeploy
				that.server.queue(['mkdir', '-p', path.dirname(link)]);
				// then create the link
				that.server.queue(['ln', '-s', target, link]);

				callback();
			},

			function (err) {
				if (err) cb(err);
				else {
					that.server.execQueue(function (err) {
						if (err) cb(err);
						else {
							that.logger.log('Symlinked directories');
							cb();
						}
					});
				}
			});

	} else cb();

};

// Set up the file symlinks
Deployer.prototype._symlinkFiles = function (cb) {

	var that = this;

	if (this.config.get('linkedFiles').length > 0) {

		var files = this.config.get('linkedFiles').slice();

		async.whilst(
			function () { return files.length > 0; },

			function (callback) {
				var file   = files.shift();
				var target = path.join(that.config.get('sharedPath'), file);
				var link   = path.join(that.config.get('publicPath', that.stage), file);

				// first make sure the parent directory exists
				// TODO may not need this since we created the dirs in _preDeploy
				that.server.queue(['mkdir', '-p', path.dirname(link)]);
				// then create the link
				that.server.queue(['ln', '-s', target, link]);

				callback();
			},

			function (err) {
				if (err) cb(err);
				else {
					that.server.execQueue(function (err) {
						if (err) cb(err);
						else {
							that.logger.log('Symlinked files');
							cb();
						}
					});
				}
			});

	} else cb();

};

// Write out the deployment log
Deployer.prototype._writeRevisionLog = function (cb) {

	var log = 'Branch ';
		log += this.config.get('branch', this.stage);
		log += ' (at ';
		log += this.config.get('newRevision');
		log += ') deployed at ';
		log += this.config.get('timestamp');
		log += ' by ';
		log += process.env.USER;

	this.server
		.queue(['echo',
				'\"'+log+'\"',
				'>>',
				this.config.get('deployLog')
			])
		.execQueue(function (err) {
			if (err) cb(err);
			else cb();
		});

};

module.exports = Deployer;
