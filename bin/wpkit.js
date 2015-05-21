#!/usr/bin/env node

// Requirements
var fs         = require('fs'),
	chalk      = require('chalk'),
	argv       = require('minimist')(process.argv.slice(2)),
    cli        = require('cli').enable('version').setApp(__dirname+'/../package.json'),
    Configubot = require('../lib/configubot'),
    Database   = require('../lib/database'),
	Deployer   = require('../lib/deployer'),
	Logger     = require('../lib/logger');

// setup
/*var cliPackage  = require('../package'),
    versionFlag = argv.v || argv.version,
    cmds        = argv._,
    tasks       = cmds[0].split(':'),
    task        = tasks[0],
    subtask     = tasks[1],
    stage       = cmds[1],
    logLevel    = 'success',
    templateDir = __dirname + '/../templates',
    config;*/

var logLevel = 'success';

if (argv.verbose) {
	logLevel = 'verbose';
}

var logger = new Logger({ level: logLevel });

cli.parse({
    verbose: ['', 'Enables verbose logging']
}, {
    deploy: ['Deploy a branch to the given environment'],
    database: ['Transfer a database to or from a remote environment']
});

logger.log(cli.command);
logger.log(cli.args);
logger.log(cli.argc);
logger.log(cli.options);

// do it!
//handleArguments();

/*function handleArguments(cb) {
	if (versionFlag) {
		logger.log('CLI version ' + cliPackage.version);
		process.exit(0);
	}

	process.nextTick(function () {
		if (task === 'init') {
            copyConfigTemplate();
            process.exit(0);

		} else if (task === 'deploy') {
            config = new Configubot('./wpkit.json');
            config.prime([
                'repo', stage+'.host', stage+'.username', stage+'.privatePath',
                stage+'.publicPath', stage+'.branch'
                ],
                function () {
                    var deployer = new Deployer(config, stage, logger);
                    deployer.deploy();
                }
            );

		} else if (task === 'db') {
            config = new Configubot('./wpkit.json');
            config.prime([
                'local.url', 'local.dbName', 'local.dbUser', 'local.dbPass',
                stage+'.host', stage+'.username', stage+'.url',
                stage+'.privatePath', stage+'.dbName', stage+'.dbUser', stage+'.dbPass'
                ],
                function () {
                    var db = new Database(config, stage, logger);
                    db.transfer(subtask);
                }
            );
        }
	});
}*/

function copyConfigTemplate () {
    var tmplFile = templateDir + '/wpkit.json.tmpl',
        destFile = './wpkit.json';

    if (fs.existsSync(destFile)) {
        logger.error(destFile + ' already exists here!');

    } else {
        if (fs.existsSync(tmplFile)) {
            var content = fs.readFileSync(tmplFile, {encoding: 'utf8'});
            fs.writeFileSync(destFile, content);

        } else {
            logger.error('Unable to locate template file.');
        }
    }
}
