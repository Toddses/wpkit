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

    this.localUrl    = config.get('url', 'local');
    this.localDbName = config.get('dbName', 'local');
    this.localDbUser = config.get('dbUser', 'local');
    this.localDbPass = config.get('dbPass', 'local');

    this.host         = config.get('host', stage);
    this.username     = config.get('username', stage);
    this.remoteUrl    = config.get('url', stage);
    this.remoteDbName = config.get('dbName', stage);
    this.remoteDbPass = config.get('dbPass', stage);
    this.remoteDbUser = config.get('dbUser', stage);
    this.privatePath  = config.get('privatePath', stage);

    this.remoteSql = '';
    this.localSql  = join('~/tmp', 'tmp.sql');
    this.tmpSql    = join(this.privatePath, 'sqldumps', 'tmp.sql');
    this.deployLog = join(this.privatePath, 'deployments.log');

    this.server = new Server({
        host: this.host,
        username: this.username
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

    var that     = this;
    this.subtask = subtask;

    this.server.open(function (err) {

        async.series(that._getTaskList(), function (err) {
            that.server.close(function () {
                if (err) {
                    that.logger.error('Transfer failed! ' + err);
                } else {
                    that.logger.success('Transfer complete!');
                }
            }.bind(err));
        });
    }); // ugh

};

/**
 * Database._getTaskList (private)
 * Returns an array containing the task list, or quits with an error if
 * no task exists for this subtask
 */
Database.prototype._getTaskList = function () {

    if (this.subtask == 'push') {
        return [
            this._getTimestamp.bind(this),
            this._exportLocalSql.bind(this),
            this._uploadSql.bind(this),
            this._replaceUrls.bind(this),
            this._importRemoteSql.bind(this),
            this._writeLog.bind(this),
            this._remoteCleanUp.bind(this),
            this._localCleanUp.bind(this)
        ];

    } else if (this.subtask == 'pull') {
        return [
            this._getTimestamp.bind(this),
            this._exportRemoteSql.bind(this),
            this._replaceUrls.bind(this),
            this._downloadSql.bind(this),
            this._importLocalSql.bind(this),
            this._writeLog.bind(this),
            this._remoteCleanUp.bind(this),
            this._localCleanUp.bind(this)
        ];

    } else {
        this.server.close(function () {
            this.logger.error('Invalid subtask');
            process.exit(0);
        });

    }

};

/**
 * Database._replaceUrls (private)
 * Use sed here for url replacement. makes wordpress happy.
 *
 * Note the use of '%' as the delimiter. since '/' is in the
 * string we want to find/replace, need to use something else
 *
 * @param {Function} cb
 */
Database.prototype._replaceUrls = function (cb) {

    var fromUrl, toUrl, fromSql, toSql;

    if (this.subtask == 'push') {
        fromUrl = this.localUrl;
        toUrl   = this.remoteUrl;
        fromSql = this.tmpSql;
        toSql   = this.remoteSql;

    } else if (this.subtask == 'pull') {
        fromUrl = this.remoteUrl;
        toUrl   = this.localUrl;
        fromSql = this.remoteSql;
        toSql   = this.tmpSql;

    }

    this.server
        .queue(['sed', 's%'+fromUrl+'%'+toUrl+'%g', fromSql, '> '+toSql])
        .execQueue(cb);

};

// capture the remote server's current time
// use the timestamp for logging and tracking the sqldumps
Database.prototype._getTimestamp = function (cb) {

    var that = this;

    this.server.capture('date +%Y%m%d%H%M%S', function (data, err) {
        if (err) cb(err);
        else {
            // now that we know the timestamp, cache these vars
            that.timestamp = data;
            that.remoteSql = join(
                that.privatePath,
                'sqldumps',
                that.remoteDbName+'_'+that.timestamp+'.sql'
            );
            cb();
        }
    });

};

// exports the database from the local server
Database.prototype._exportLocalSql = function (cb) {

    this.logger.log('Exporting Database');

    this.server
        .queue(['mkdir', '-p', dirname(this.localSql)])
        .queue(['mysqldump',
                '-u'+this.localDbUser,
                '-p'+this.localDbPass,
                this.localDbName,
                '> '+this.localSql]
            )
        .execQueueLocally(cb);

};

// Exports the remote database
Database.prototype._exportRemoteSql = function (cb) {

    this.logger.log('Exporting Database');

    this.server
        .queue(['mkdir', '-p', dirname(this.remoteSql)])
        .queue(['mysqldump',
                '-u'+this.remoteDbUser,
                '-p'+this.remoteDbPass,
                this.remoteDbName,
                '> '+this.remoteSql]
            )
        .execQueue(cb);

};

// uploads the local export to the remote server
Database.prototype._uploadSql = function (cb) {

    this.logger.log('Transferring SQL file');
    this.server.upload(this.localSql, this.tmpSql, cb);

};

// Download the exported sql file to the local environment
Database.prototype._downloadSql = function (cb) {

    this.logger.log('Transferring SQL file');
    this.server.download(this.tmpSql, this.localSql, cb);

};

// import the sql file to the remote database
Database.prototype._importRemoteSql = function (cb) {

    var that = this;

    this.logger.log('Importing Database');

    this.server
        .queue(['mysql',
                '-u'+this.remoteDbUser,
                '-p'+this.remoteDbPass,
                this.remoteDbName,
                '< '+this.remoteSql]
            )
        .execQueue(function(err) {
            // if mysql drops an error, we get just a generic 'ERROR' as
            // the message, so give it something a little more useful
            // TODO this is fine as a temporary solution, but look into getting
            // the actual error
            if (err === 'ERROR') {
                cb('The database \''+that.remoteDbName+'\' does not exist, or the username/password is invalid');

            } else cb();
        });

};

// import the sql file to the local database
Database.prototype._importLocalSql = function(cb) {

    this.logger.log('Importing Database');

    this.server
        .queue(['mysql',
                '-u'+this.localDbUser,
                '-p'+this.localDbPass,
                this.localDbName,
                '< '+this.localSql]
            )
        .execQueueLocally(cb);
};

// write out the revision log with a nice message
Database.prototype._writeLog = function (cb) {

    this.logger.log('Writing log and tidying up');

    var action = this.subtask + 'ed',
        log  = 'Database ';
        log += this.remoteDbName;
        log += ' ' + action + ' at ';
        log += this.timestamp;
        log += ' by ';
        log += process.env.USER;

    this.server
        .queue(['echo', '\"'+log+'\"', '>>', this.deployLog])
        .execQueue(cb);
};

// delete the tmp sql file from the remote server
Database.prototype._remoteCleanUp = function (cb) {

    this.server
        .queue(['rm', this.tmpSql])
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
