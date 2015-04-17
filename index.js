var fs       = require('fs'),
	Deployer = require('./lib/deployer');

function WPToolkit() {
	// don't do nothing right now
};

// setup, prepare for launch
WPToolkit.prototype.init = function (templateDir, logger) {

	// copy the deployment.json template file to the cwd
	console.log(templateDir);
	fs.readFile(templateDir + '/deployment.json.tmpl', function (err, data) {
		if (err) logger.error('unable to locate deployment.json template');
		else {
			fs.writeFile('./deployment.json', data, { flag: 'wx' }, function (err) {
				if (err) {
					if (err.code === 'EEXIST')
						logger.error('deployment.json already exists!');
					else
						logger.error(err);
				} else
					logger.log('created deployment.json')
			});
		}
	});

};

// instantiate the deployer
WPToolkit.prototype.setStage = function (stage, logger) {
	this._deployer = new Deployer(stage, logger);
};

// execute the deploy task
WPToolkit.prototype.deploy = function () {
	this._deployer.deploy();
};

var inst = new WPToolkit();
module.exports = inst;