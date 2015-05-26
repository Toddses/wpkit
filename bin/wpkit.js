#!/usr/bin/env node

// Requirements
var fs         = require('fs'),
    cli        = require('cli').enable('version').setApp(__dirname+'/../package.json'),
    Configubot = require('../lib/configubot'),
    Database   = require('../lib/database'),
	Deployer   = require('../lib/deployer'),
	Logger     = require('../lib/logger');

// set up the cli parser
var options = cli.parse(
    {
        verbose: ['', 'Enables verbose logging']
    }, {
        init: ['Write the default json deployment file to the cwd'],
        deploy: ['Deploy a branch to the given environment'],
        database: ['Transfer a database to or from a remote environment']
    }
);

// set up some execution variables
var logLevel    = (options.verbose) ? 'verbose' : 'success',
    logger      = new Logger({ level: logLevel }),
    config;

// make sure the user isn't crazy
validateCommand();

// handle the commands and execute
process.nextTick(function () {
    if (cli.command === 'init') {
        copyConfigTemplate();

    } else if (cli.command === 'deploy') {
        var stage = cli.args[0];

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

    } else if (cli.command === 'database') {
        var subtask = cli.args[0],
            stage   = cli.args[1];

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

// validates the given command and arguments
function validateCommand() {
    switch(cli.command) {
        case 'init':
            if (cli.argc != 0) {
                logger.error('Invalid arguments');
                logger.use('wpkit init');
                process.exit(0);
            }
            break;

        case 'deploy':
            if (cli.argc !== 1) {
                logger.error('Invalid arguments');
                logger.use('wpkit deploy <stage>');
                process.exit(0);
            }
            break;

        case 'database':
            if (cli.argc !== 2 || (cli.args[0] !== 'push' && cli.args[0] !== 'pull')) {
                logger.error('Invalid arguments');
                logger.use('wpkit database (push | pull) <stage>');
                process.exit(0);
            }
            break;
    }
}

// copy over the template file to the cwd
function copyConfigTemplate () {
    var tmplFile = __dirname + '/../templates/wpkit.json.tmpl',
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
