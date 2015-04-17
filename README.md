### reploy

Command line tool for [Capistrano](http://capistranorb.com/) style deployments in multi-server environments over SSH. And hey, its a NodeJS package!

Add any issues or feature requests to the [GitHub issues](https://github.com/Toddses/reploy/issues)!

## Installation

Install it with NPM. So cool!

Install globally:

	$ npm install -g reploy

In your project's directory, run the initializer:

    $ cd /path/to/your/project
	$ reploy init

Edit the `reploy.json` file with your various settings and stages.

Deploy!

	$ reploy deploy stage

Where `stage` is the stage you'd like to deploy to.

## Options

Verbose logging.

	$ reploy deploy stage --verbose

## Deployment Structure

```
project_root
├─ current
├─ releases
│  ├─ 20150215123456
│  ├─ 20150216123456
│  └─ 20150217123456
├─ repo
│  └─ <VCS data>
├─ shared
│  ├─ <symlinked files>
│  └─ <symlinked dirs>
└─ deployments.log
```

* **./current/** Symlinked dir to the latest release
* **./releases/** Directory containing the various releases that have been deployed.
* **./repo/** Contains the bare repo.
* **./shared/** Contains shared files/directories to be symlinked within each release.
* **./deployments.log** Log file containing data on each deployment.

## Milestones

This tool is in active development. Short list of planned releases:

#### v0.1.0

* Add the rollback task for quickly returning to previous releases.

#### v0.2.0

* build an upload task
* build a download task
* Implement a hook system to allow custom tasks to hook into the deployment and rollback flow, via a reployfile.

#### v0.3.0

* Add an npm style init with prompts for building the reploy.json file.

#### v0.4.0

* Add slack integration.

#### v0.5.0

* Revisit the logging system and implement a robust application-wide logging system.
* Allow custom tasks to hook into the logging system.

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