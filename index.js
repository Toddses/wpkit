var fs       = require('fs'),
	Deployer = require('./lib/deployer');

function WPToolkit() {
	// don't do nothing right now
};

// setup, prepare for launch
WPToolkit.prototype.init = function (templateDir, logger) {

	// copy the deployment.json template file to the cwd
	fs.readFile(templateDir + '/wpkit.yml.tmpl', function (err, data) {
		if (err) logger.error('unable to locate wpkit.yml template');
		else {
			fs.writeFile('./wpkit.yml', data, { flag: 'wx' }, function (err) {
				if (err) {
					if (err.code === 'EEXIST')
						logger.error('wpkit.yml already exists!');
					else
						logger.error(err);
				} else
					logger.log('created wpkit.yml')
			});
		}
	});

};

// instantiate the deployer
WPToolkit.prototype.setStage = function (stage, logger, config) {
	this._deployer = new Deployer(stage, logger, config);
};

// execute the deploy task
WPToolkit.prototype.deploy = function () {
	this._deployer.deploy();
};

var inst = new WPToolkit();
module.exports = inst;
