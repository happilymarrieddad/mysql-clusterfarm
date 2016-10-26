var Pool          = require('./Pool');
var PoolConfig    = require('./PoolConfig');
var PoolNamespace = require('./PoolNamespace');
var PoolSelector  = require('./PoolSelector');
var Util          = require('util');
var EventEmitter  = require('events').EventEmitter;

/**
 * PoolClusterFarm
 * @constructor
 * @param {object} [config] The pool cluster farm configuration
 * @public
 */
function PoolClusterFarm(config) {
  EventEmitter.call(this);

  config = config || {};
  this._servers = [];
  this._numMasters = 0;
  this._numSlaves = 0;
  this._last_index = 0;
  this.debug = config.debug || false
}

var isFunction = function(func) {
	return func && typeof func == 'function'
}

Util.inherits(PoolClusterFarm,EventEmitter);

PoolClusterFarm.prototype.query = function query(sql,values,cb) {
	var self = this

	if (!this._numMasters || this._numMasters < 1) {
		throw new Error('No servers assigned to PoolClusterFarm. Please verify...')
	}

	if (typeof sql != 'string') {
		throw new Error('Invalid sql statement. Please verify...')
	}

	if (sql.match(/select/i) || sql.match(/call/i)) {
		var index_to_use = this._last_index;
		if (index_to_use >= (this._servers.length)) { this._last_index = index_to_use = 0; }
		else { this._last_index++; }
		if (this.debug) { console.log('Using server',(index_to_use+1),'of',(this._servers.length)); }
		this._servers[index_to_use].pool.query(sql,values,cb);
	} else {
		var num = this._numMasters;
		var error_encountered = false

		var updateMasters = function(i) {
			if (error_encountered) { return }
			self._servers[i].pool.query(sql,values,function(err,rows) {
				if (error_encountered) { return }
				if (err) {
					error_encountered = true
					if (isFunction(cb)) { return cb(err,rows); }
					else if (values && typeof values == 'function') { return values(err,rows); }
				}
				if (!(--num)) {
					if (isFunction(cb)) { return cb(err,rows); }
					else if (values && typeof values == 'function') { return values(err,rows); }
				}
			});
		}

		for (var i = 0; i < this._servers.length; i++) {
			if (this._servers[i].type == 'master') {
				updateMasters(i);
			}
		}

	}
}

PoolClusterFarm.prototype.addMaster = function(id,config,respond) {
	if (!respond || typeof respond != 'function') { respond = function(err){ throw new Error(err) }; }
	var server_name = typeof id == 'string' ? id : this._makeId();
	var server_type = 'master';
	var server_config = {};
	if (config && typeof config == 'object') {
		server_config = config;
	} else if (type && typeof type == 'object') {
		server_config = type;
	} else if (id && typeof id == 'object') {
		server_config = id;
	} else {
		throw new Error('No server configuration passed in. Please look at the documentation.');
	}
	var poolConfig = new PoolConfig(server_config)
	this._servers.push({
		id:server_name,
		type:server_type,
		master_id:null,
		pool:new Pool({config:poolConfig}),
		online:1
	})
	this._calculateNumServers()
}

PoolClusterFarm.prototype.addSlave = function(id,master,config,respond) {
	if (!respond || typeof respond != 'function') { respond = function(err){ throw new Error(err) }; }
	var server_name = typeof id == 'string' ? id : this._makeId();
	var server_type = 'slave';
	var server_master_id = master;
	var server_config = {};
	if (config && typeof config == 'object') {
		server_config = config;
	} else if (type && typeof type == 'object') {
		server_config = type;
	} else if (id && typeof id == 'object') {
		server_config = id;
	} else {
		throw new Error('No server configuration passed in. Please look at the documentation.');
	}
	var poolConfig = new PoolConfig(server_config)
	this._servers.push({
		id:server_name,
		type:server_type,
		master_id:server_master_id,
		pool:new Pool({config:poolConfig}),
		online:1
	})
	this._calculateNumServers()
}

PoolClusterFarm.prototype._makeId = function _makeId() {
	return Math.random().toString(36).substring(5);
}

PoolClusterFarm.prototype._calculateNumServers = function _calculateNumServers() {
	this._numMasters = 0;
	this._numSlaves = 0;
	for (var i = 0; i < this._servers.length; i++) {
		if (this._servers[i].type == 'master') { this._numMasters++; }
		else { this._numSlaves++; }
	}
}

module.exports = PoolClusterFarm;