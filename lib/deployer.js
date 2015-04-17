// Requires
var async  = require('async'),
	fs     = require('fs'),
	path   = require('path'),
	minify = require('node-json-minify'),
	Server = require('./server');

// Constructor
function Deployer (stage, logger) {

	this.logger = logger;

	// load up the configuration for this deployment
	if (fs.existsSync('deployment.json')) {
		var contents = fs.readFileSync('deployment.json', { encoding: 'utf8' });
		this.deployment  = JSON.parse(minify(contents));
	} else {
		this.logger.error('deployment.json file not found!');
		process.exit(1);
	}

	if (!(stage in this.deployment)) {
		this.logger.error(stage + ' does not exist in deployment.json file!');
		process.exit(1);
	}

	this.config = {
        privatePath: this._load('privatePath', stage),
        publicPath: this._load('publicPath', stage),
		repo: this._load('repository'),
		branch: this._load('branch', stage),
		sharedPath: path.join(this._load('privatePath', stage), 'shared'),
		repoPath: path.join(this._load('privatePath', stage), 'repo'),
		deployLog: path.join(this._load('privatePath', stage), 'deployments.log'),
		newRelease: '',
		newRevision: '',
		linkedFiles: this._load('linkedFiles'),
		linkedDirs: this._load('linkedDirs'),
		revisionExists: false,
		repoExists: false
	};

	// initialize a server for ssh connection
	this.server = new Server({
		host: this._load('host', stage),
		username: this._load('username', stage),
		agent: process.env.SSH_AUTH_SOCK,
		agentFwd: true
	}, logger);

};

// Load in a deployment setting
Deployer.prototype._load = function (key, stage) {

	if (stage) {
		return this.deployment[stage][key];
	} else {
		return this.deployment[key];
	}

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
				that._fetchNewRelease.bind(that),
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
				this.config.repo
			])
		// make sure the needed directories are there
		.queue(['mkdir',
				'-p',
				this.config.privatePath,
				this.config.publicPath
			]);

	// make sure that symlinked directories exist
	if (this.config.linkedDirs.length > 0) {
		var dirs = [];
		this.config.linkedDirs.forEach(function (dir) {
			dirs.push(path.join(that.config.sharedPath, dir));
		});

		this.server.queue(['mkdir', '-p', dirs.join(' ')]);
	}

	// make sure the directories of files to be symlinked exist
	if (this.config.linkedFiles.length > 0) {
		var dirs = [];
		this.config.linkedFiles.forEach(function (file) {
			dirs.push(path.dirname(path.join(that.config.sharedPath, file)));
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
						if (that.config.linkedFiles.length > 0) {
							var files = that.config.linkedFiles.slice();

							async.whilst(
								function () { return files.length > 0 },

								function (callback) {
									var file = files.shift();

									that.server.check('file', path.join(that.config.sharedPath, file), function (response, err) {
										if (err) callback(err);
										else {
											if (response == "1") callback();
											else {
                                                //callback(path.join(that.config.sharedPath, file) + ' does not exist!');
                                            // if it doesn't exist, just create the file
                                                that.server
                                                    .queue(['touch', path.join(that.config.sharedPath, file)])
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
						that.server.check('file', path.join(that.config.publicPath, 'REVISION'), function (response, err) {
							if (err) callback(err);
							else {
								if (response == "1")
									that.config.revisionExists = true;

								callback();
							}
						});
					},

					// check if the repo mirror has already been cloned
					function (callback) {
						that.server.check('file', path.join(that.config.repoPath, 'HEAD'), function (response, err) {
							if (err) callback(err);
							else {
								if (response == "1")
									that.config.repoExists = true;

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
Deployer.prototype._fetchNewRelease = function (cb) {

	this.server.capture('date +%Y%m%d%H%M%S', function (timestamp, err) {
		if (err) cb(err);
		else {
			this.config.newRelease = timestamp;
			cb();
		}
	}.bind(this));

};

// Clone, if needed, and update the repo on the server
Deployer.prototype._deployRepo = function (cb) {

	var that = this;

	// if the repo isn't already there, go ahead and clone it
	if (! this.config.repoExists)
		this.server.queue(['git', 'clone', '--mirror', '-q', this.config.repo, this.config.repoPath])

	this.server
		.queue(['git',
				'remote',
				'update',
                '&>/dev/null'
			], this.config.repoPath)
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
                this.config.publicPath
            ])
		.queue(['mkdir',
				'-p',
				this.config.publicPath
			])
		.queue(['git',
				'archive',
				this.config.branch,
				'| tar',
				'-x -f - -C',
				this.config.publicPath
			], this.config.repoPath)
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
							that.config.branch
						], that.config.repoPath,
						function (revision, err) {
							if (err) callback(err);
							else {
								that.config.newRevision = revision;
								callback();
							}
						});
			},

			// write the new revision number to the file
			function (callback) {
				that.server
					.queue(['echo',
							'\"'+that.config.newRevision+'\"',
							'>>',
							'REVISION'
						], that.config.publicPath)
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

	if (this.config.linkedDirs.length > 0) {

		var dirs = this.config.linkedDirs.slice();

		async.whilst(
			function () { return dirs.length > 0; },

			function (callback) {
				var dir    = dirs.shift();
				var target = path.join(that.config.sharedPath, dir);
				var link   = path.join(that.config.publicPath, dir);

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

	if (this.config.linkedFiles.length > 0) {

		var files = this.config.linkedFiles.slice();

		async.whilst(
			function () { return files.length > 0; },

			function (callback) {
				var file   = files.shift();
				var target = path.join(that.config.sharedPath, file);
				var link   = path.join(that.config.publicPath, file);

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
		log += this.config.branch;
		log += ' (at ';
		log += this.config.newRevision;
		log += ') deployed as release ';
		log += this.config.newRelease;
		log += ' by ';
		log += process.env.USER;

	this.server
		.queue(['echo',
				'\"'+log+'\"',
				'>>',
				this.config.deployLog
			])
		.execQueue(function (err) {
			if (err) cb(err);
			else cb();
		});

};

module.exports = Deployer;