var resource = require('resource');
var hook = resource.define('hook');
var user = require('../user');
var metric = require('../metric');
var cache = require('../cache');
var config = require('../../../config');
var request = require('hyperquest');
var slug = require('slug');

hook.languages = require('../programmingLanguage').languages;

/*
[
  "bash",
  "coffee-script",
  "javascript",
  "lua",
  "perl",
  "php",
  "python",
  "python3",
  "ruby",
  "scheme",
  "smalltalk",
  "tcl"
];
*/

hook.timestamps();

hook.property('name', {
  "type": "string",
  "default": "my-hook",
  "required": true,
  "minLength": 1,
  "maxLength": 50,
  "description": "The name of the Hook. This will be part of the url to access to the Hook."
});

hook.property('path', {
  "type": "string",
  "default": "/:id",
  "required": false,
  "maxLength": 100,
  "description": "Optional path of the Hook. This allows for url route parameter style routing."
});

hook.property('description', {
  "type": "string",
  "default": "",
  "required": false,
  "description": "A brief description of what the Hook does"
});

// npm package for hook
hook.property('pkg', 'object');

hook.property('language', {
  "type": "string",
  "default": "bash",
  "required": true,
  "minLength": 1,
  "maxLength": 50,
  "description": "The programming language of the Hook."
});

hook.property('isPublic', {
  "type": "boolean",
  "default": true
});

hook.property('customTimeout', {
  "type": "number",
  "default": config.UNTRUSTED_HOOK_TIMEOUT,
  "min": 1000,
  "max": 300000,
  "description": "Custom timeout variable for services"
});

hook.property('themeName', {
  "type": "string",
  "default": "form",
  "required": false,
  "description": "The name of the Theme, such as 'form'"
});

hook.property('themeStatus', {
  "description": "the current status of the theme",
  "enum": ["enabled", "disabled", "error"],
  "default": "disabled",
  "required": false
});

hook.property('mschemaStatus', {
  "description": "the current status of the schema for the service",
  "enum": ["enabled", "disabled", "error"],
  "default": "disabled",
  "required": false
});

hook.property('status', {
  "type": "string",
  "enum": ["active", "disabled"],
  "default": "active"
});

hook.property('gist', {
  "type": "string",
  "required": false,
  "description": "source of the Hook provided as a Github Gist Url"
});

hook.property('githubRepo', {
  "type": "string",
  "required": false,
  "description": "github repo of the Hook source code"
});

hook.property('githubBranch', {
  "type": "string",
  "required": false,
  "description": "github repo branch of the Hook source code"
});

hook.property('mainEntry', {
  "type": "string",
  "required": false,
  "description": "main entry point of service"
});

hook.property('ran', {
  "type": "number",
  "default": 0
});

// Array of services as strings which act as pre-facing middlewares
hook.property('inputs', {
  "type": "array",
  "default": []
});

// TODO: implement after middlewares ( not yet available )
hook.property('outputs', {
  "type": "array",
  "default": []
});

hook.property('forked', {
  "type": "number",
  "default": 0,
  "description": "The amount of times the Hook has been forked"
});

hook.property('owner', {
  "type": "string",
  "required": true
});

hook.property('theme', {
  "type": "string",
  "required": false,
  "default": ""
});

hook.property('cron', 'string');
hook.property('lastCron', 'string');
hook.property('nextCron', 'string');
hook.property('cronActive', 'boolean')

hook.property('presenter', {
  "type": "string",
  "required": false,
  "default": ""
});

// holds the schema of the hook
// remark: "schema" namespace is occupied by jugglingdb, and will be available after juggling is removed
hook.property('mschema', {
  "type": "object"
});

// TODO: should auto-create or update this on uploads / saves / deploys
hook.property('packageJSON', {
  "type": "object"
});

hook.property('hookType', {
  "type": "string",
  "description": "additional ( internal ) type classification for hooks. currently used to help manage hot-code gateways",
  "enum": ["service", "gateway"],
  "default": "service",
  "required": false
});

hook.property('sourceType', {
  "type": "string",
  "description": "the active type of source for the hook",
  "enum": ["code", "gist", "githubRepo"],
  "default": "code",
  "required": false
});

hook.property('source', {
  "type": "string",
  "description": "source code of Hook",
  "required": false,
  "default": 'echo "hello world"'
});

hook.property('themeSource', {
  "type": "string",
  "description": "source code of Hook's view",
  "required": false
});

hook.property('presenterSource', {
  "type": "string",
  "description": "source code of Hook's presenter",
  "required": false
});

hook.property('mode', {
  "type": "string",
  "enum": ["Production", "Development"],
  "required": true,
  "default": "Development"
});

// cache settings
hook.property('cacheSourceCode', {
  "type": "boolean",
  "default": false,
  "required": true
});

hook.property('cacheThemeView', {
  "type": "boolean",
  "default": false,
  "required": true
});

hook.property('cacheThemePresenter', {
  "type": "boolean",
  "default": false,
  "required": true
});

hook.property('isPromoted', {
  "type": "boolean",
  "description": "Promoted hooks are top-level Hooks show-cased on https://hook.io",
  "default": false
});

hook.property('isPrivate', {
  "type": "boolean",
  "description": "Private hooks require access keys",
  "default": false
});

var checkRoleAccess = require('../../server/routeHandlers/checkRoleAccess');

hook.before('create', function (data, next) {
  // check auth role
  var self = this;
  checkRoleAccess({ req: self.req, res: self.res, role: "hook::create" }, function (err, hasPermission) {
    if (!hasPermission) {
      next(new Error(config.messages.unauthorizedRoleAccess(self.req, "hook::create")), data);
      //return res.end(config.messages.unauthorizedRoleAccess(req));
    } else {
      next(null, data);
    }
  });
});

hook.before('create', function (data, next) {
  // slugify name
  data.name = slug(data.name);
  next(null, data);
});

// keep track of active crons in redis ( reduces reads / finds on couch )
hook.after('update', function (data, next) {
  // console.log('performing update', data)
  // TODO: fix bug here for new pattern was causing duplicate entries
  // might need to adjust data structure entirely
  var cron = {
    owner: data.owner,
    name: data.name,
    cron: data.cron
  };
  if (data.cronActive) {
    cache.sadd('crons', cron, function (err) {
      next(err, data);
    });
  } else {
    cache.srem('crons', cron, function (err) {
      next(err, data);
    });
  }
});

// keep track of active crons in redis ( reduces reads / finds on couch )
hook.after('create', function (data, next){
  var cron = {
    owner: data.owner,
    name: data.name,
    cron: data.cron
  };
  if (data.cronActive) {
    cache.sadd('crons', cron, function (err) {
      next(err, data);
    });
  } else {
    cache.srem('crons', cron, function (err) {
      next(err, data);
    });
  }
});


function onlyPaidAccountsCanCreatePrivateServices (data, next) {
  var self = this;
  if (data.isPrivate) {
    user.findOne({ name: data.owner }, function (err, _user){
      if (err) {
        return next(err);
      }
      if (_user.paidStatus === "paid" || (self.req && self.req.session && self.req.session.paidStatus === "paid")) {
        next(null, data);
      } else {
        var msg = {
          error: true,
          message: "Only paid accounts can create private Hook Services!",
          type: "paid-account-required"
        };
        next(new Error(JSON.stringify(msg)))
      }
    });
  } else {
    next(null, data);
  }
}

// check that non-paid account is not trying to create private hook
hook.before('create', onlyPaidAccountsCanCreatePrivateServices);
// check that non-paid account is not trying to create private hook
hook.before('update', onlyPaidAccountsCanCreatePrivateServices);

// updates metrics for total hook count after creating
hook.after('create', function(data, next){
  metric.incr('/hook/count');
  next(null, data);
});

hook.fork = require('./fork');
hook.run = require('./run');
hook.gateway = require('./gateway');
hook.runHook = require('./runHook');
hook.formatError = require('./formatError');
hook.fetchHookSourceCode = require('./fetchHookSourceCode');
hook.preprocessHook = require('./preprocessHook');
hook.viewPresenter = require('microcule').viewPresenter;
hook.runUntrustedService = require('run-service');
hook.runRemote = require('run-remote-service');

module['exports'] = hook;