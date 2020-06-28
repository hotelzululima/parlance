// ✊🏿

'use strict';

const fs = require('fs').promises; /* Kept them */
const bent = require('bent'); /* Get bent */
const iso8601x = require('./iso8601x'); /* It's time */

/**
  A base class for most other classes. Accepts options.
**/
const Base = class {

  constructor (_options) {

    this._options = JSON.parse(JSON.stringify(_options || {}));

    return this;
  }

  get options () {

    return this._options;
  }
};

/**
  A simple console output base class.
  @extends Base
**/
const Output = class {

  /**
    Write a string to standard output with no added linefeed.
    Override this implementation; it is almost certainly not what you want.
    @arg _message {string} - The message to emit.
  **/
  stdout (_message) {

    console.log(_message);
    return this;
  }

  /**
    Write a string to standard error with no added linefeed.
    Override this implementation; it is almost certainly not what you want.
    @arg _message {string} - The message to emit.
  **/
  stderr (_message, _is_critical) {

    if (_is_critical) {
      console.error(_message);
    } else {
      console.log(_message);
    }

    return this;
  }

  /**
    Terminate execution.
    @arg _status {number} - The process exit code. Defaults to non-zero.
  **/
  exit (_status) {

    throw new Error(`Process exited with status ${_status || 127}\n`);
  }

  /**
    Raise a fatal error and terminate execution.
    @arg _message {string} - The message to emit.
    @arg _status {number} - The process exit code. Defaults to non-zero.
  **/
  fatal (_message, _status) {

    this.stderr(`[fatal] ${_message}\n`, true);
    throw new Error(`Process exited with status ${_status || 127}\n`);
  }

  /**
    Log a message to standard error.
    @arg {_type} {string} - The type of message being logged.
    @arg {_message} {string} - The message to log to standard error.
  **/
  log (_type, _message) {

    this.stderr(`[${_type}] ${_message}\n`);
    return this;
  }

  /**
    Log a network request.
  **/
  log_network (_url) {

    return this.log('network', `Fetching ${_url}`);
  }

  /**
    Log the successful completion of an operation.
  **/
  log_success (_message) {

    return this.log('success', _message);
  }
};

/**
  A Node.js specialization of the `Output` base class.
**/
const OutputNode = class extends Output {

  constructor (_options) {

    super(_options);

    /* To do: this probably isn't ideal */
    this._process = require('process');
    return this;
  }

  /**
    Write a string to standard output.
  **/
  stdout (_message) {

    this._process.stdout.write(_message);
    return this;
  }
  /**
    Write a string to standard error.
  **/
  stderr (_message, _is_critical) {

    this._process.stderr.write(_message);
    return this;
  }

  /**
    Terminate execution.
    @arg _status {number} - The process exit code. Defaults to non-zero.
  **/
  exit (_status) {

    this._process.exit(_status);
  }

  /**
    Raise a fatal error and terminate execution.
  **/
  fatal (_message, _status) {

    try {
      super.fatal(_message, _status);
    } catch (_e) {
      /* Ignore exception */
    }

    this.exit(_status);
  }
};

/**
  All available output classes.
**/
const Out = {
  Base: Output, Node: OutputNode
};

/**
  A mutable in-memory credential/token store.
  @extends Base
**/
const Credentials = class extends Base {

  constructor (_mst, _jst, _options) {

    super(_options);

    this.mst = _mst;
    this.jst = _jst;

    return this;
  }

  get mst () {

    return this._mst;
  }

  get jst () {

    return this._jst;
  }

  set mst (_mst) {

    this._mst = _mst.toString().replace(/^mst=/, '');
    return this;
  }

  set jst (_jst) {

    this._jst = _jst.toString().replace(/^jst=/, '');
  }
};

/**
  A ratelimiting implementation based upon HTTP response headers.
  @extends Base
**/
const Ratelimit = class extends Base {

  constructor (_headers) {

    super(_headers);

    /* To do: this probably isn't ideal */
    this._crypto = require('crypto');
    this._rng_divisor = 64;

    return this;
  }

  get limit () {

    return 0;
  }

  get remaining () {

    return 0;
  }

  get reset () {

    return 0;
  }

  set headers (_headers) {

    return this;
  }

  async wait () {

    return new Promise((_resolve) => {
      setTimeout(_resolve, Math.floor(
        (this._crypto.randomBytes(1)[0] / this._rng_divisor) * 1000
      ));
    });
  }
};

/**
  A session abstraction.
  Handles credential rotation from HTTP response headers.
  @extends Base
**/
const Session = class extends Base {

  constructor (_credentials, _headers) {

    super(_headers);

    this._credentials = _credentials;
    return this;
  }

  set headers (_headers) {

    return this;
  }
};

/**
  The core HTTPS client implementation.
  @extends Base
**/
const Client = class extends Base {

  constructor (_credentials, _options) {

    super(_options);

    this._out = new Out.Node();
    this._session = new Session();
    this._ratelimit = new Ratelimit();

    this._page_size = (
      this.options.page_size ?
        parseInt(_options.page_size, 10) : 20
    );

    this._credentials = _credentials;
    this._page_size_temporarily_disabled = false;
    this._url = (this.options.url || 'https://api.parler.com/');

    this._ua = (
      this.options.ua || [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'AppleWebKit/537.36 (KHTML, like Gecko)',
        'Chrome/83.0.4103.116',
        'Safari/537.36'
      ].join(' ')
    );

    return this;
  }

  get credentials () {

    return this._credentials;
  }

  get user_agent () {

    return this._ua;
  }

  get base_url () {

    return this._url;
  }

  get page_size () {

    return this._page_size;
  }

  set page_size (_page_size) {

    let page_size = parseInt(_page_size, 10);
    this._page_size = (page_size > 0 ? page_size : this._page_size);
  }

  /** HTTPS functions **/

  _create_client (_headers) {

    let headers = Object.assign(_headers, {
      'User-Agent': this.user_agent,
      'Origin': 'https://parler.com',
      'Cookie': `mst=${encodeURIComponent(this._credentials.mst)}`
    });

    return bent(this.base_url, 'GET', null, 200, headers);
  }

  _create_extra_headers (_username) {

    let username = encodeURIComponent(_username);

    return {
      'Referrer': `https://parler.com/profile/${username}/posts`
    }
  }

  /** Result output functions **/

  _start_json_results () {

    this._out.stdout("[\n");
    return true;
  }

  _end_json_results () {

    this._out.stdout("\n]");
    return true;
  }

  _print_json_results (_results, _is_first_page, _is_final_page) {

    if (_results.length <= 0) {
      return true;
    }

    for (let i = 0, len = _results.length; i < len; ++i) {

      if (!(_is_first_page && i <= 0)) {
        this._out.stdout(",");
      }
      this._out.stdout(
        JSON.stringify(_results[i]).trim()
      );
    }

    return true;
  }

  /** Paging **/

  _temporarily_disable_page_size () {

    this._page_size_temporarily_disabled = true;
    return this;
  }

  async _paged_request (_profile, _request_callback, _reduce_callback,
                        _result_callback, _start_callback, _end_callback) {

    /* To do:
        This paging logic could be pulled out into a buffered iterator. */

    let record = {};
    let results = [];
    let next_key = null;
    let is_first_page = true;

    if (!_request_callback) {
      throw new Error('Request callback required');
    }

    let end_cb = (_end_callback || this._end_json_results.bind(this));
    let start_cb = (_start_callback || this._start_json_results.bind(this));
    let result_cb = (_result_callback || this._print_json_results.bind(this));

    if (!start_cb()) {
      throw new Error('Result dispatch: start failed');
    }

    /* To do: allow a check on next_key, with history */
    for (;;) {

      /* Perform actual network request */
      let record = await _request_callback(_profile, next_key);

      /* Extract result array */
      results = _reduce_callback(record);

      /* Exit conditions */
      let is_final_page = !(
        record.last !== true ||
          (is_first_page || results.length >= this.page_size)
      );

      if (!results.length) {
        is_final_page = true;
      }

      /* Dispatch result */
      if (!result_cb(results, is_first_page, is_final_page)) {
        throw new Error('Result dispatch failed');
      }

      next_key = record.next;
      is_first_page = false;

      /* Termination */
      if (is_final_page) {
        break;
      }
    }

    /* Some APIs don't use the limit parameter */
    this._page_size_temporarily_disabled = false;

    if (!end_cb()) {
      throw new Error('Result dispatch: completion failed');
    }

    this._out.log_success('Finished fetching paged results');
    return true;
  }

  async _paged_request_one (_url, _profile, _start_key, _url_callback) {

    let username = (_profile || {}).username;

    let request = this._create_client(
      this._create_extra_headers(username)
    );

    let url_callback = (
      _url_callback || ((_profile) => {
        return `id=${encodeURIComponent(_profile._id)}`;
      })
    );

    let qs = url_callback(_profile);
    let url = `${_url}?${qs}`;

    /* Some APIs don't use the limit parameter */
    if (!this._page_size_temporarily_disabled) {
      url = `${url}&limit=${encodeURIComponent(this.page_size)}`;
    }

    if (_start_key) {
      url += `&startkey=${encodeURIComponent(_start_key)}`;
    }

    this._out.log_network(url);
    await this._ratelimit.wait();

    /* Issue actual HTTPS request */
    return await request(url);
  }

  /** API request helpers **/

  async _request_creator (_profile, _start_ts) {

    let response = await this._paged_request_one(
      'v1/post/creator', _profile, _start_ts
    );

    return await response.json();
  }

  async _request_following (_profile, _start_ts) {

    let response = await this._paged_request_one(
      'v1/follow/following', _profile, _start_ts
    );

    return await response.json();
  }

  async _request_followers (_profile, _start_ts) {

    let response = await this._paged_request_one(
      'v1/follow/followers', _profile, _start_ts
    );

    return await response.json();
  }

  async _request_user_comments (_profile, _start_ts) {

    let response = await this._paged_request_one(
      'v1/comment/creator', _profile, _start_ts, (_profile) => {
        return `username=${encodeURIComponent(_profile.username)}`;
      }
    );

    return await response.json();
  }

  async _request_post_comments (_profile, _start_ts) {

    let response = await this._paged_request_one(
      'v1/comment', _profile, _start_ts, (_profile) => {
        return `id=${encodeURIComponent(_profile._id)}&reverse=true`;
      }
    );

    return await response.json();
  }

  async _print_generic (_profile, _fn_name, _key) {

    return await this._paged_request(
      _profile, this[_fn_name].bind(this), (_o) => (_o[_key] || [])
    );
  }

  /** API endpoints **/

  async profile (_username) {

    let request = this._create_client(
      this._create_extra_headers(_username)
    );

    let username = encodeURIComponent(_username);
    let url = `v1/profile?username=${username}`;

    this._out.log_network(url);
    await this._ratelimit.wait();

    /* HTTPS request */
    let response = await request(url);
    return await response.json();
  }

  async print_posts (_profile) {

    this.page_size = 20;
    return this._print_generic(
      _profile, '_request_creator', 'posts'
    );
  }

  async print_echoes (_profile) {

    this.page_size = 20;
    return this._print_generic(
      _profile, '_request_creator', 'postRefs'
    );
  }

  async print_following (_profile) {

    this.page_size = 10;
    return this._print_generic(
      _profile, '_request_following', 'followees'
    );
  }

  async print_followers (_profile) {

    this.page_size = 10;
    return this._print_generic(
      _profile, '_request_followers', 'followers'
    );
  }

  async print_user_comments (_profile) {

    this.page_size = 10;
    return this._print_generic(
      _profile, '_request_user_comments', 'comments'
    );
  }

  async print_post_comments (_id) {

    this.page_size = 10;
    this._temporarily_disable_page_size(); /* They do this */

    return this._print_generic(
      { _id: _id }, '_request_post_comments', 'comments'
    );
  }
};

/**
  An argument parser for command-line invocation.
  @extends Base
**/
const Arguments = class extends Base {

  constructor (_options) {

    super(_options);

    /* To do: this probably isn't ideal */
    this._yargs = require('yargs');

    return this._setup();
  }

  parse () {

    return this._yargs.argv;
  }

  usage () {

    return this._yargs.showHelp();
  }

  _setup () {

    this._yargs.demandCommand(1)
      .option(
        'a', {
          type: 'string',
          alias: 'authorization',
          default: 'config/auth.json',
          describe: 'Authorization file'
        }
      )
      .command(
        'profile', 'Fetch a user profile', {
          u: {
            type: 'string',
            alias: 'username',
            demandOption: true,
            describe: 'The name of the user'
          }
        }
      )
      .command(
        'posts', 'Fetch all posts for a user', {
          u: {
            type: 'string',
            alias: 'username',
            demandOption: true,
            describe: 'The name of the user'
          }
        }
      )
      .command(
        'echoes', 'Fetch all echoes for a user', {
          u: {
            type: 'string',
            alias: 'username',
            demandOption: true,
            describe: 'The name of the user'
          }
        }
      )
      .command(
        'following', 'Fetch all users followed by a user', {
          u: {
            type: 'string',
            alias: 'username',
            demandOption: true,
            describe: 'The name of the user'
          }
        }
      )
      .command(
        'followers', 'Fetch all followers of a user', {
          u: {
            type: 'string',
            alias: 'username',
            demandOption: true,
            describe: 'The name of the user'
          }
        }
      )
      .command(
        'comments', 'Fetch all comments for a user or post', {
          u: {
            type: 'string',
            conflicts: 'i',
            alias: 'username',
            describe: 'The name of the user'
          },
          i: {
            type: 'string',
            conflicts: 'u',
            alias: 'identifier',
            describe: 'The unique identifier of the post'
          }
        }
      );

    return this;
  }
};

/**
  The command-line interface to Parlaid.
  @extends Base
**/
const CLI = class extends Base {

  constructor (_options) {

    super(_options);

    this._out = new Out.Node();
    this._args = new Arguments();
  }

  async run () {

    let config, profile;
    let args = this._args.parse();

    try {
      let json_config = await fs.readFile(args.a);
      config = JSON.parse(json_config);
    } catch (_e) {
      this._out.fatal(`Unable to read authorization data from ${args.a}`, 2);
    }

    let credentials = new Credentials(config.mst, config.jst);
    let client = new Client(credentials);

    /* Command dispatch */
    switch (args._[0]) {

      case 'profile':
        profile = await client.profile(args.u);
        this._out.stdout(JSON.stringify(profile));
        this._out.stdout("\n");
        break;

      case 'posts':
        profile = await client.profile(args.u);
        await client.print_posts(profile);
        break;

      case 'echoes':
        profile = await client.profile(args.u);
        await client.print_echoes(profile);
        break;

      case 'comments':
        if (!this._yargs_check_comment_options(args)) {
          this._args.usage();
          this._out.stderr("Missing required argument: u or i\n");
          this._out.exit(1);
        }
        if (args.i) {
          await(client.print_post_comments(args.i));
        } else {
          profile = await client.profile(args.u);
          await client.print_user_comments(profile);
        }
        break;

      case 'following':
        profile = await client.profile(args.u);
        await client.print_following(profile);
        break;

      case 'followers':
        profile = await client.profile(args.u);
        await client.print_followers(profile);
        break;

      default:
        this._args.usage();
        this._out.exit(1);
        break;
    }
  }

  _yargs_check_comment_options(_args) {

    /* Intentional == */
    return (
      (_args.i != null && _args.u == null)
        || (_args.u != null || _args.i == null)
    );
  }
};

/**
  Application entry point
**/
async function main () {

  let cli = new CLI();
  await cli.run();
}

// 🚀
main();

