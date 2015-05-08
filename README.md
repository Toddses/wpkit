# wpkit

Opinionated command line toolkit for managing and deploying WordPress installations over SSH in multi-server environments.

Add any issues or feature requests to the [GitHub issues](https://github.com/Toddses/wpkit/issues)!

## Installation

Install it with [NPM](https://www.npmjs.com/).

Install globally:

```sh
$ npm install -g wpkit
```

## Quick Start

[Set up your ssh keys](https://help.github.com/articles/generating-ssh-keys/) and install on your remote server(s). 

Enable Agent Forwarding for each server. One way to handle this is in your `~/.ssh/config` file:

```
Host 123.456.789.012
    User deployerbot
    AgentForward yes
```

Authorize each server to access your git account(s). For instance, log into the server with your key, and execute

```sh
$ ssh -T git@github.com
```

You'll be prompted to add github.com to your list of known hosts. This will give the server access to your github account, using your ssh pubkey.

In your project's directory, run the initializer:

```sh
$ cd /path/to/your/project
$ wpkit init
```

Fire away

```sh
$ wpkit deploy production
>> repo required: git@github.com:Toddses/example.git
>> host in production required: 123.456.789.012
>> username in production required: deployerbot
>> privatePath in production required: /var/www/project
>> publicPath in production required: /var/www/public/project
>> branch in production required: master
>> Would you like to save this config? (yes|no) y
>> Connected to 123.456.789.012
>> Check stage complete
>> Repo updated
>> New release created
>> Symlinked directories
>> Symlinked files
Success: Deployment complete!
```
	
Now future deployments to `production` will no longer require the prompt session.

If you're managing deployments, but not doing a lot of the developing or management of the repos, there is no need to keep a copy of the repo in your local environment. You could do something like

```sh
$ mkdir -p ~/deployments/project
$ cd ~/deployments/project
$ wpkit init
$ wpkit deploy production
...
```

Keeping a subdirectory for each project you're managing.

# Tasks

## Deployment

Deploy your project with git over SSH. There is one required setting in `wpkit.json`, and you must also have at least one stage defined.

```json
{
  "repo": "git@github.com:Username/repository.git",
  "stage_name": {
    "host": "xxx.xxx.xxx.xxx",
    "username": "user",
    "branch": "branch_name",
    "publicPath": "/absolute/path/to/project/public",
    "privatePath": "absolute/path/to/project"
  }
}
```

Multiple stages can be defined, by copying the structure defined above and changing the details.

**wpkit** creates a release structure that keeps in mind there are some WordPress files you don't want in your repo that are the same across all releases.

`privatePath` is not a public facing directory, while `publicPath` is the public facing website. This allows you to define symlinks to directories and files, keeping important and shared files out of your public facing website and safely tucked away on your server.

```json
"linked_dirs": [ "wp-content/uploads" ],
"linked_files": [ "wp-config.php", ".htaccess" ]
```

The above is a basic WordPress symlink structure. These files and directories will live in your `privatePath` under `/shared`.

`wp-config.php` and `.htaccess` are nice to symlink because they will be the same for each release. So you can have these unchanged files that don't live in your repo, but the public site will still have access to them.

`/wp-content/uploads` is nice to symlink as well. You won't need to copy over your site's uploads for each release, or store them in your repo. They will just symlink to the uploads in `/shared` and you're golden!

Linking files and dirs are optional settings, and as such are not part of the prompt session when starting with an empty `wpkit.json` file.

### Deployment Structure

```
/absolute/path/to/project
├─ repo
│  └─ <git data>
├─ shared
│  ├─ <symlinked files>
│  └─ <symlinked dirs>
├─ sqldumps
│  └─ <sql exports>
└─ deployments.log

/absolute/path/to/project/public
├─ REVISION
└─ *
```

#### Private Path
* **./repo/** Contains the bare git repo.
* **./shared/** Contains shared files/directories to be symlinked within each release.
* **./sqldumps/** Contains a backup of all the SQL exports for the project.
* **./deployments.log** Log file containing data on each task.

#### Public Path
* **./REVISION** Contains the revision number for this release.
* **./*** Project files.

## Database

Export/Import mysql databases over SSH with automatic URL replacement.

```sh
$ wpkit db:push production
>> url in local required: http://example.dev
>> dbName in local required: local_database
>> dbUser in local required: local_dbuser
>> dbPass in local required: local_dbpass
>> url in production required: http://website.dev
>> dbName in production required: production_database
>> dbUser in production required: production_dbuser
>> dbPass in production required: production_dbpass
>> Would you like to save this config? (yes|no) y
>> Connected to 123.456.789.012
>> Exporting Database
>> Transferring SQL file
>> Importing Database
>> Writing log and tidying up
Success: Transfer complete!
```

**Note** In order to import the sql file, the database must already exist in the mysql server you're importing to.
 
`push` exports the local mysql database and imports to the remote database. `pull` does the opposite, exporting the remote database and importing it locally. Both tasks automatically replace the URL with the correct environment URL. Required `wpkit.json` settings:

```json
{
  "local": {
    "url": "http://example.dev",
    "dbName": "local_database",
    "dbUser": "local_dbuser",
    "dbPass": "local_dbpass"
  },
  "stage_name": {
    "host": "xxx.xxx.xxx.xxx",
    "username": "user",
    "url": "http://website.com",
    "privatePath": "/absolute/path/to/project",
    "dbName": "stage_database",
    "dbUser": "stage_dbuser",
    "dbPass": "stage_dbpass"
  }
}
```

Both tasks will store the exported `.sql` file under the remote environment's `privatePath/shared/sqldumps` and will be timestamped. This is effectively a snapshot of the latest data in the remote environment at the time of export. Likely you won't be pushing or pulling the database often, but keep in mind those backups are being stored.

**Note** Both these tasks will _overwrite_ the existing database in the importing environment. So take that into account before you pull the trigger.

## Command Line Options

Verbose logging. Gives you a lot more information on what's happening.

```sh
$ wpkit deploy stage --verbose
```

## Roadmap

This toolkit is in active development. I intend to develop it into a full-stack WordPress management tool, from scaffolding to deployment.

Intended future releases will include the following functionality.

* Scaffolding a new WordPress site.
* Plugin stack installation. Define a set of common plugins to install and pull them all into your project with one command.
* Uploads pushing and pulling for quick transfers of the WordPress uploads data between local and remote servers.
* Setting up the remote environment with the `wp-config.php` settings and `.htaccess` settings for pretty permalinks and some security. Should allow for root URL installation, or subdirectory installations.

For a release schedule, see the [Milestones](https://github.com/Toddses/wpkit/milestones).

Any and all feature requests are [welcome](https://github.com/Toddses/wpkit/issues).

## License

The MIT License (MIT)

Copyright (c) 2015 Todd Miller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
