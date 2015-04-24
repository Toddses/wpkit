# wpkit

Opinionated command line toolkit for managing and deploying WordPress installations over SSH in multi-server environments.

Add any issues or feature requests to the [GitHub issues](https://github.com/Toddses/wpkit/issues)!

## Installation

Install it with [NPM](https://www.npmjs.com/).

Install globally:

	$ npm install -g wpkit

In your project's directory, run the initializer:

    $ cd /path/to/your/project
	$ wpkit init

Edit the `wpkit.yml` configuration file with your various settings and stages.

[Set up your ssh keys](https://help.github.com/articles/generating-ssh-keys/) and install on your remote server(s).

## Options

Verbose logging.

	$ wpkit deploy stage --verbose

## Deployment

Deploy your project with git over SSH. Set

```yaml
repo: git@github.com:user/example.git
```

to your git repository. You must enable agent forwarding. One way to handle this is in `~/.ssh/config`

```
Host 12.34.56.789
    User you
    AgentForward yes
```

**wpkit** creates a release structure that keeps in mind there are some WordPress files you don't want in your repo that are the same across all releases. Each stage in the `wpkit.yml` manifest will have the following structure:

```yaml
staging:
  host: xxx.xxx.xxx.xxx
  username: user
  branch: staging
  publicPath: /path/to/project/public
  privatePath: /path/to/project
```

`privatePath` is not a public facing directory, while `publicPath` is the public facing website. This allows you to define symlinks to directories and files, keeping important and shared files out of your public facing website and safely tucked away on your server.

```yaml
linkedDirs:
  - content/uploads
linkedFiles:
  - wp-config.php
  - .htaccess
```

The above is a basic WordPress symlink structure. These files and directories will live in your `privatePath` under `/shared`.

`wp-config.php` and `.htaccess` are nice to symlink because they will be the same for each release. So you can have these unchanged files that don't live in your repo, but the public site will still have access to them.

`/wp-content/uploads` is nice to symlink as well. You won't need to copy over your site's uploads for each release, or store them in your repo. They will just symlink to the uploads in `/shared` and you're golden!

## Deployment Structure

```
/private/path/root
├─ repo
│  └─ <VCS data>
├─ shared
│  ├─ <symlinked files>
│  └─ <symlinked dirs>
└─ deployments.log

/public/path/root
├─ REVISION
└─ *
```

#### Private Path
* **./repo/** Contains the bare repo.
* **./shared/** Contains shared files/directories to be symlinked within each release.
* **./deployments.log** Log file containing data on each deployment.

#### Public Path
* **./REVISION** Contains the revision number for this release.
* **./*** Project files.

## Roadmap

This toolkit is in active development. I intend to develop it into a full-stack WordPress management tool, from scaffolding to deployment.

Intended future releases will include the following functionality.

* Scaffolding a new WordPress site.
* Plugin stack installation. Define a set of common plugins to install and pull them all into your project with one command.
* Database pushing and pulling for quick transfer of MySQL databases between local and remote servers. Will automatically update URLs in the data.
* Uploads pushing and pulling for quick transfers of the WordPress uploads data between local and remote servers.

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
