// Requires
var async  = require('async'),
	fs     = require('fs'),
	path   = require('path'),
	Server = require('./server');

// Constructor
function Deployer (config, stage, logger) {

	this.logger = logger;
    this.stage  = stage;
    this.config = config;

    this.repo           = config.get('repo');
    this.branch         = config.get('branch', stage);
    this.privatePath    = config.get('privatePath', stage);
    this.publicPath     = config.get('publicPath', stage);
    this.sharedPath     = path.join(config.get('privatePath', stage), 'shared');
    this.repoPath       = path.join(config.get('privatePath', stage), 'repo');
    this.deployLog      = path.join(config.get('privatePath', stage), 'deployments.log');
    this.linkedDirs     = config.get('linkedDirs');
    this.linkedFiles    = config.get('linkedFiles');
    this.repoExists     = false;
    this.revisionExists = false;
    this.newRevision    = '';
    this.timestamp      = '';

	// initialize a server for ssh connection
	this.server = new Server({
		host: config.get('host', stage),
		username: config.get('username', stage)
	}, logger);

};

// Make the actual deployment
Deployer.prototype.deploy = function () {

	var that = this;

	this.server.open(function (err) {
        async.series([
            that._preDeploy.bind(that),
            that._fetchTimestamp.bind(that),
            that._deployRepo.bind(that),
            that._deployRelease.bind(that),
            that._setNewRevision.bind(that),
            that._symlinkDirs.bind(that),
            that._symlinkFiles.bind(that),
            that._writeRevisionLog.bind(that)
        ],
        function (err) {
            that.server.close(function () {
                if (err)
                    that.logger.error('Deployment failed! ' + err);
                else
                    that.logger.success('Deployment complete!');
            }.bind(err));
        });
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
				this.repo
			])
		// make sure the needed directories are there
		.queue(['mkdir',
				'-p',
				this.privatePath,
				this.publicPath
			]);

	// make sure that symlinked directories exist
	if (this.linkedDirs.length > 0) {
		var dirs = [];
		this.linkedDirs.forEach(function (dir) {
			dirs.push(path.join(that.sharedPath, dir));
		});

		this.server.queue(['mkdir', '-p', dirs.join(' ')]);
	}

	// make sure the directories of files to be symlinked exist
	if (this.linkedFiles.length > 0) {
		var dirs = [];
		this.linkedFiles.forEach(function (file) {
			dirs.push(path.dirname(path.join(that.sharedPath, file)));
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
						if (that.linkedFiles.length > 0) {
							var files = that.linkedFiles.slice();

							async.whilst(
								function () { return files.length > 0 },

								function (callback) {
									var file = files.shift();

									that.server.check('file', path.join(that.sharedPath, file), function (response, err) {
										if (err) callback(err);
										else {
											if (response == "1") callback();
											else {
                                            // if it doesn't exist, just create the file
                                                that.server
                                                    .queue(['touch', path.join(that.sharedPath, file)])
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
						that.server.check('file', path.join(that.publicPath, 'REVISION'), function (response, err) {
							if (err) callback(err);
							else {
								if (response == "1")
									that.revisionExists = true;

								callback();
							}
						});
					},

					// check if the repo mirror has already been cloned
					function (callback) {
						that.server.check('file', path.join(that.repoPath, 'HEAD'), function (response, err) {
							if (err) callback(err);
							else {
								if (response == "1")
									that.repoExists = true;

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
			this.timestamp = timestamp;
			cb();
		}
	}.bind(this));

};

// Clone, if needed, and update the repo on the server
Deployer.prototype._deployRepo = function (cb) {

	var that = this;

	// if the repo isn't already there, go ahead and clone it
	if (! this.repoExists)
		this.server.queue(['git', 'clone', '--mirror', '-q', this.repo, this.repoPath])

	this.server
		.queue(['git',
				'remote',
				'update',
                '&>/dev/null'
			], this.repoPath)
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
                this.publicPath
            ])
		.queue(['mkdir',
				'-p',
				this.publicPath
			])
		.queue(['git',
				'archive',
				this.branch,
				'| tar',
				'-x -f - -C',
				this.publicPath
			], this.repoPath)
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
							that.branch
						], that.repoPath,
						function (revision, err) {
							if (err) callback(err);
							else {
								that.newRevision = revision;
								callback();
							}
						});
			},

			// write the new revision number to the file
			function (callback) {
				that.server
					.queue(['echo',
							'\"'+that.newRevision+'\"',
							'>>',
							'REVISION'
						], that.publicPath)
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

	if (this.linkedDirs.length > 0) {

		var dirs = this.linkedDirs.slice();

		async.whilst(
			function () { return dirs.length > 0; },

			function (callback) {
				var dir    = dirs.shift();
				var target = path.join(that.sharedPath, dir);
				var link   = path.join(that.publicPath, dir);

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

	if (this.linkedFiles.length > 0) {

		var files = this.linkedFiles.slice();

		async.whilst(
			function () { return files.length > 0; },

			function (callback) {
				var file   = files.shift();
				var target = path.join(that.sharedPath, file);
				var link   = path.join(that.publicPath, file);

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

	var log  = 'Branch ';
		log += this.branch;
		log += ' (at ';
		log += this.newRevision;
		log += ') deployed at ';
		log += this.timestamp;
		log += ' by ';
		log += process.env.USER;

	this.server
		.queue(['echo',
				'\"'+log+'\"',
				'>>',
				this.deployLog
			])
		.execQueue(function (err) {
			if (err) cb(err);
			else cb();
		});

};

module.exports = Deployer;
