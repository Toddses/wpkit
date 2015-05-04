/**
 * Database
 * Handles all the tasks related to database transfers
 *
 * @author Todd Miller <todd@rainydaymedia.net>
 * @since wpkit v1.1.0
 */

// Requires
var async   = require('async'),
    join    = require('path').join,
    dirname = require('path').dirname,
    Server  = require('./server');

/**
 * Constructor
 *
 * @param {Configubot} config The project configuration to manage
 * @param {string} stage The server environment to manage
 * @param {Logger} logger
 */
function Database(config, stage, logger) {
    this.config    = config;
    this.stage     = stage;
    this.logger    = logger;
    this.timestamp = '';
    this.remoteSql = '';
    this.localSql  = join('~/tmp', config.get('dbName', 'local')+'.sql');
    this.deployLog = join(config.get('privatePath', stage), 'deployments.log'),

    this.server = new Server({
        host: config.get('host', stage),
        username: config.get('username', stage)
    }, logger);
}

/**
 * Database.transfer
 * the basic action for transfering a database between local and remote servers
 *
 * valid values for the subtask are currently 'push' or 'pull'
 *
 * @param {string} subtask A predefined task list
 */
Database.prototype.transfer = function (subtask) {

    var that = this;

    this.server.open(function (err) {
        if (err) {
            that.logger.error('Could not connect to ' + that.server.host + '! ' + err);

        } else {
            that.logger.log('Connected to ' + that.server.host);

            var taskList = [];

            if (subtask == 'push')
                taskList = that._pushArray();
            else if (subtask == 'pull')
                tasklist = that._pullArray();
            else {
                that.server.close(function () {
                    that.logger.error('Invalid subtask');
                    process.exit(0);
                });
            }

            async.series(taskList, function (err) {
                if (err) {
                    that.server.close(function () {
                        that.logger.error('Transfer failed with: ' + err);
                    });
                } else {
                    that.server.close(function () {
                        that.logger.success('Transfer complete!');
                    });
                }
            });
        }
    });

};

/**
 * Database._pushArray (private)
 * defines the task list for pushing local database to remote server
 *
 * @return {Array}
 */
Database.prototype._pushArray = function () {

    return [
        this._getTimestamp.bind(this),
        this._exportLocalSql.bind(this),
        this._uploadSql.bind(this),
        this._importRemoteSql.bind(this),
        this._localCleanUp.bind(this)
    ];

};

/**
 * Database._pullArrray (private)
 * defines the task list for pulling remote database to local server
 *
 * @return {Array}
 */
Database.prototype._pullArray = function () {
    return [];
};

// capture the remote server's current time
// use the timestamp for logging and tracking the sqldumps
Database.prototype._getTimestamp = function (cb) {

    var that = this;

    this.server.capture('date +%Y%m%d%H%M%S', function (data, err) {
        if (err) cb(err);
        else {
            that.timestamp = data;
            cb();
        }
    });

};

// exports the database from the local server
// note that we don't do the url replacement locally. likely that
// its more reliable on the remote side.
Database.prototype._exportLocalSql = function (cb) {

    this.server
        .queue(['mkdir', '-p', dirname(this.localSql)])
        .queue(['touch', this.localSql])
        .queue(['mysqldump',
                '-u'+this.config.get('dbUser', 'local'),
                '-p'+this.config.get('dbPass', 'local'),
                this.config.get('dbName', 'local'),
                '> '+this.localSql]
            )
        .execQueueLocally(cb);

};

// uploads the local export to the remote server
Database.prototype._uploadSql = function (cb) {

    this.remoteSql = join(this.config.get('privatePath', this.stage),
                        'sqldumps',
                        this.config.get('dbName', this.stage)+'_'+this.timestamp+'.sql');

    this.server.upload(this.localSql, this.remoteSql, cb);

};

// replace urls, import the sql, log transfer
Database.prototype._importRemoteSql = function (cb) {

    var log  = 'Database ';
        log += this.config.get('dbName', this.stage);
        log += ' pushed at ';
        log += this.timestamp;
        log += ' by ';
        log += process.env.USER;

    // use sed here for url replacement. makes wordpress happy.
    // note the use of '%' as the delimiter. since '/' is in the
    // string we want to find/replace, need to use something else
    this.server
        .queue(['sed',
                '-i',
                's%'+this.config.get('url', 'local')+'%'+this.config.get('url', this.stage)+'%g',
                this.remoteSql]
            )
        .queue(['mysql',
                '-u'+this.config.get('dbUser', this.stage),
                '-p'+this.config.get('dbPass', this.stage),
                this.config.get('dbName', this.stage),
                '< '+this.remoteSql]
            )
        // this writes the new log to the remote deployment log
        .queue(['echo', '\"'+log+'\"', '>>', this.deployLog])
        .execQueue(cb);

};

 // removes the tmp sql file and the whole shebang if its empty
Database.prototype._localCleanUp = function (cb) {

    this.server
        .queue(['rm', this.localSql])
        // output rmdir to null because failing is okay here
        // (it means there were other files in tmp dir)
        .queue(['rmdir', dirname(this.localSql), '2>/dev/null'])
        .execQueueLocally(cb);

};

module.exports = Database;
