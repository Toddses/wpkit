#!/usr/bin/env node

// Requirements
var fs        = require('fs'),
	chalk     = require('chalk'),
	argv      = require('minimist')(process.argv.slice(2)),
	interpret = require('interpret'),
	Deployer  = require('../lib/deployer'),
	Logger    = require('../lib/logger');

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

// do it!
handleArguments();

// the actual logic
function handleArguments() {
	if (versionFlag) {
		logger.log('CLI version ' + cliPackage.version);
		process.exit(0);
	}

	var wpToolkitInst = require('../index.js'),
		templateDir = __dirname + '/../templates';

	process.nextTick(function () {
		if (task === 'init') {
			wpToolkitInst.init(templateDir, logger);
		} else {
			wpToolkitInst.setStage(stage, logger);
			//execute the deployment task
			logger.log('deploy to ' + stage);
            wpToolkitInst.deploy();
		}
	});
}