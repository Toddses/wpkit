#!/usr/bin/env node

// Requirements
var fs        = require('fs'),
	chalk     = require('chalk'),
	argv      = require('minimist')(process.argv.slice(2)),
	interpret = require('interpret'),
	Liftoff   = require('liftoff'),
	Deployer  = require('../lib/deployer'),
	Logger    = require('../lib/logger');

// set env var for ORIGINAL cwd before anything touches it
process.env.INIT_CWD = process.cwd();

// prepare the cli with Liftoff!
var cli = new Liftoff({
	name: 'reploy',
	extensions: interpret.jsVariants
});

// setup
var cliPackage  = require('../package');
var versionFlag = argv.v || argv.version;
var tasks       = argv._;
var task        = tasks[0];
var stage       = tasks[1];
var logLevel    = 'success';

if (argv.verbose) {
	logLevel = 'verbose';
}

var logger = new Logger({ level: logLevel });

cli.on('require', function (name) {
  	logger.log('Requiring external module');
});

cli.on('requireFail', function (name) {
	logger.error('Failed to load external module ' + name);
});

cli.on('respawn', function (flags, child) {
	var nodeFlags = flags.join(', ');
	var pid = child.pid;
	gutil.log('Node flags detected: ' + nodeFlags);
	gutil.log('Respawned to PID: ' + pid);
});

cli.launch({
	cwd: argv.cwd,
	configPath: argv.reployfile,
	require: argv.require
}, handleArguments);

// the actual logic
function handleArguments(env) {
	if (versionFlag) {
		logger.log('CLI version ' + cliPackage.version);
		if (env.modulePackage && typeof env.modulePackage.version !== 'undefined') {
			logger.log('Local version ' + env.modulePackage.version);
		}
		process.exit(0);
	}

	// chdir before requiring reployfile to make sure
	// we let them chdir as needed
	if (process.cwd() !== env.cwd) {
		process.chdir(env.cwd);
		logger.log('Working directory changed to ' + env.cwd);
	}

	var reployInst = require('../index.js'),
		templateDir = __dirname + '/../templates';

	process.nextTick(function () {
		if (task === 'init') {
			reployInst.init(templateDir, logger);
		} else {
			reployInst.setStage(stage, logger);
			//execute the deployment task
			logger.log('deploy to ' + stage);
            reployInst.deploy();
		}
	});
}
